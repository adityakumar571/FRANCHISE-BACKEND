import mongoose from "mongoose";
import User from "./models/user.modal.js";
import dotenv from "dotenv";

dotenv.config();

async function fixSuperAdminPassword() {
  try {
    // Connect to main database
    const conn = await mongoose.connect(process.env.MAIN_DB_URI);
    console.log("✅ Connected to Main DB");

    // Find superadmin user
    const superadmin = await User.findOne({ userId: "superadmin" });
    
    if (!superadmin) {
      console.log("❌ Superadmin not found");
      process.exit(1);
    }

    console.log("📝 Current superadmin password:", superadmin.password);
    console.log("📝 Current superadmin isActive:", superadmin.isActive);

    // Update password to plain text (no hashing)
    superadmin.password = "SuperAdmin@123";
    superadmin.isActive = true;
    
    await superadmin.save();

    console.log("✅ Password updated to plain text: SuperAdmin@123");
    console.log("✅ Account activated");
    console.log("\n🎯 You can now login with:");
    console.log("   userId: superadmin");
    console.log("   password: SuperAdmin@123");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

fixSuperAdminPassword();
