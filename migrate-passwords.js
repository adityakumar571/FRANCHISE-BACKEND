import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const BASE_DB_URI = process.env.BASE_DB_URI;
const CENTRAL_DB_URI = BASE_DB_URI ? `${BASE_DB_URI.replace(/\/$/, '')}/cloudFranchaize` : null;

async function migratePasswords() {
    try {
        console.log("🔐 Starting password migration...");
        console.log("CENTRAL_DB_URI:", CENTRAL_DB_URI);

        if (!CENTRAL_DB_URI) {
            throw new Error("BASE_DB_URI is not set in .env");
        }

        // Connect to central DB
        const centralConn = await mongoose.connect(CENTRAL_DB_URI);
        const tenantSchema = new mongoose.Schema({}, { strict: false });
        const Tenant = centralConn.model("Tenant", tenantSchema, "tenants");

        // Get all tenants
        const tenants = await Tenant.find();
        console.log(`Found ${tenants.length} tenants`);

        for (const tenant of tenants) {
            try {
                console.log(`\n📌 Processing tenant: ${tenant.subdomain}`);

                // Connect to tenant database
                const tenantConn = await mongoose.createConnection(tenant.dbUri).asPromise();
                const UserSchema = new mongoose.Schema({}, { strict: false });
                const User = tenantConn.model("User", UserSchema, "users");

                // Get all users
                const users = await User.find();

                for (const user of users) {
                    // Check if password is already hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
                    if (user.password && !user.password.startsWith("$2")) {
                        const hashedPassword = await bcrypt.hash(user.password, 10);
                        await User.updateOne(
                            { _id: user._id },
                            { password: hashedPassword }
                        );
                        console.log(`  ✅ Updated user: ${user.userId}`);
                    }
                }

                await tenantConn.close();
            } catch (err) {
                console.error(`❌ Error processing tenant ${tenant.subdomain}:`, err.message);
            }
        }

        await centralConn.connection.close();
        console.log("\n✅ Password migration completed!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    }
}

migratePasswords();
