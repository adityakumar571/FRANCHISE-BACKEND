import mongoose from "mongoose";
import Tenant from "./models/tenant.model.js";
import User from "./models/tenant/user.model.js";
import dotenv from "dotenv";

dotenv.config();

async function createTestTenant() {
  try {
    console.log("🔄 Connecting to database...\n");
    await mongoose.connect(process.env.MAIN_DB_URI);
    console.log("✅ Connected to Main DB\n");

    // ==================== CREATE TENANT ====================
    console.log("📝 Creating test tenant...");
    const tenant = await Tenant.create({
      name: "PharmaNexus Delhi",
      subdomain: "delhi",
      email: "admin@delhi.pharmanexus.in",
      phone: "+919876543210",
      contactPerson: "Raj Kumar",
      address: "123 Pharmacy Lane, Delhi",
      city: "Delhi",
      state: "Delhi",
      country: "India",
      pincode: "110001",
      portalPassword: "delhi1234",  // Plain text - no hashing
      isActive: true,
      status: "ACTIVE",
    });

    console.log("✅ Tenant created!");
    console.log(`   Name: ${tenant.name}`);
    console.log(`   Subdomain: ${tenant.subdomain}`);
    console.log(`   ID: ${tenant._id}\n`);

    // ==================== CONNECT TO TENANT DB ====================
    const tenantDbUri = process.env.BASE_DB_URI.replace(
      "cloudFranchaize",
      `franchise_${tenant.subdomain}`
    );

    console.log("🔄 Connecting to tenant database...");
    const tenantConn = await mongoose.createConnection(tenantDbUri);
    console.log("✅ Connected to Tenant DB\n");

    // ==================== CREATE TENANT USER ====================
    console.log("📝 Creating tenant user...");
    
    const TenantUserModel = tenantConn.model(
      "User",
      mongoose.Schema({
        userId: String,
        password: String,
        name: String,
        email: String,
        phone: String,
        role: String,
        isActive: Boolean,
      })
    );

    const tenantUser = await TenantUserModel.create({
      userId: "manager",
      password: "manager1234",  // Plain text - no hashing
      name: "Store Manager",
      email: "manager@delhi.pharmanexus.in",
      phone: "+919876543211",
      role: "Manager",
      isActive: true,
    });

    console.log("✅ Tenant user created!");
    console.log(`   User ID: ${tenantUser.userId}\n`);

    // ==================== CREDENTIALS ====================
    console.log("\n🎯 TENANT LOGIN CREDENTIALS:");
    console.log("════════════════════════════════════════");
    console.log(`Subdomain/Tenant:  delhi`);
    console.log(`Username:          manager`);
    console.log(`Password:          manager1234`);
    console.log("════════════════════════════════════════\n");

    console.log("📱 Frontend Login URL:");
    console.log("   http://delhi.localhost:5173/franchise-login");
    console.log("   or");
    console.log("   http://localhost:5173/franchise-login?subdomain=delhi\n");

    await tenantConn.disconnect();
    await mongoose.disconnect();
    console.log("✅ Done!\n");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

createTestTenant();
