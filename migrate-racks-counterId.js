import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const BASE_DB_URI = process.env.BASE_DB_URI;
const CENTRAL_DB_URI = BASE_DB_URI ? `${BASE_DB_URI.replace(/\/$/, '')}/cloudFranchaize` : null;

async function migrateRacksCounterId() {
    try {
        console.log("📦 Starting racks counterId migration...");
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
                
                // Define schemas
                const RackSchema = new mongoose.Schema({}, { strict: false });
                const CounterSchema = new mongoose.Schema({}, { strict: false });
                
                const Rack = tenantConn.model("Rack", RackSchema, "racks");
                const Counter = tenantConn.model("Counter", CounterSchema, "counters");

                // Get the first counter (default counter to assign racks to)
                const defaultCounter = await Counter.findOne();
                
                if (!defaultCounter) {
                    console.log(`  ⚠️  No counters found for tenant ${tenant.subdomain}, skipping...`);
                    await tenantConn.close();
                    continue;
                }

                console.log(`  📍 Default Counter: ${defaultCounter.code} (${defaultCounter.name})`);

                // Find all racks without counterId
                const racksWithoutCounterId = await Rack.find({ counterId: { $exists: false } });
                
                if (racksWithoutCounterId.length === 0) {
                    console.log(`  ✅ All racks already have counterId`);
                    await tenantConn.close();
                    continue;
                }

                console.log(`  Found ${racksWithoutCounterId.length} racks without counterId`);

                // Update all racks without counterId
                const result = await Rack.updateMany(
                    { counterId: { $exists: false } },
                    { $set: { counterId: defaultCounter._id } }
                );

                console.log(`  ✅ Updated ${result.modifiedCount} racks with counterId`);
                console.log(`  📊 Details: matched=${result.matchedCount}, modified=${result.modifiedCount}`);

                await tenantConn.close();
            } catch (err) {
                console.error(`❌ Error processing tenant ${tenant.subdomain}:`, err.message);
            }
        }

        await centralConn.connection.close();
        console.log("\n✅ Racks counterId migration completed!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    }
}

migrateRacksCounterId();
