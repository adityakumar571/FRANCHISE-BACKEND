import mongoose from "mongoose";
import User from "./models/user.modal.js";
import dotenv from "dotenv";

dotenv.config();

async function setupSuperAdmin() {
  try {
    console.log("🔄 Connecting to database...");
    await mongoose.connect(process.env.MAIN_DB_URI);
    console.log("✅ Connected to Main DB\n");

    // Check if superadmin exists
    const existing = await User.findOne({ userId: "superadmin" });
    
    if (existing) {
      console.log("📝 Superadmin found. Updating password...");
      existing.password = "SuperAdmin@123";
      existing.isActive = true;
      await existing.save();
      console.log("✅ Password updated to: SuperAdmin@123");
    } else {
      console.log("📝 Superadmin not found. Creating...");
      const superAdmin = await User.create({
        userId: "superadmin",
        password: "SuperAdmin@123",  // Plain text - no hashing
        name: "Super Admin",
        email: "superadmin@pharmanexus.in",
        phone: "+919999999999",
        gender: "Male",
        role: "SuperAdmin",
        isActive: true
      });
      console.log("✅ Superadmin created successfully!");
    }

    console.log("\n🎯 Login Credentials:");
    console.log("────────────────────");
    console.log("User ID: superadmin");
    console.log("Password: SuperAdmin@123");
    console.log("────────────────────\n");

    await mongoose.disconnect();
    console.log("✅ Done!\n");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

setupSuperAdmin();
