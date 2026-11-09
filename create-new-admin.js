import mongoose from "mongoose";
import User from "./models/user.modal.js";
import dotenv from "dotenv";

dotenv.config();

async function createNewAdmin() {
  try {
    console.log("🔄 Connecting to database...");
    await mongoose.connect(process.env.MAIN_DB_URI);
    console.log("✅ Connected to Main DB\n");

    // Delete old superadmin if exists
    await User.deleteOne({ userId: "superadmin" });
    console.log("🗑️  Old superadmin deleted\n");

    // Create brand new admin with simple credentials
    const newAdmin = await User.create({
      userId: "admin",
      password: "1234",  // Super simple password
      name: "Admin",
      email: "admin@pharmanexus.in",
      phone: "+919999999999",
      gender: "Male",
      role: "SuperAdmin",
      isActive: true
    });

    console.log("✅ New admin created successfully!\n");
    console.log("🎯 Login Credentials:");
    console.log("────────────────────");
    console.log("User ID: admin");
    console.log("Password: 1234");
    console.log("────────────────────\n");

    await mongoose.disconnect();
    console.log("✅ Done!\n");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

createNewAdmin();
