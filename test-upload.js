import "./config/env.js";
import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";

const BASE_URL = "http://localhost:9001";

// Generate a SuperAdmin token
const generateSuperAdminToken = () => {
  const token = jwt.sign(
    {
      userId: "superadmin123",
      role: "superadmin",
      email: "admin@test.com",
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  return token;
};

const testBulkUpload = async () => {
  try {
    console.log("🧪 Testing Bulk Upload...\n");

    // Create token
    const token = generateSuperAdminToken();
    console.log("✅ Generated SuperAdmin token");
    console.log(`   Token: ${token.substring(0, 20)}...\n`);

    // Read test file
    const filePath = "./test-medicines.xlsx";
    if (!fs.existsSync(filePath)) {
      console.error("❌ Test file not found:", filePath);
      process.exit(1);
    }

    const fileBuffer = fs.readFileSync(filePath);
    console.log(`✅ Read test file: ${filePath}`);
    console.log(`   Size: ${fileBuffer.length} bytes\n`);

    // Create FormData
    const form = new FormData();
    form.append("file", fileBuffer, "test-medicines.xlsx");

    console.log("📤 Uploading to: POST /api/superadmin/medicines/bulk-upload\n");

    // Make request
    const response = await fetch(`${BASE_URL}/api/superadmin/medicines/bulk-upload`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
      body: form,
    });

    console.log(`📥 Response Status: ${response.status} ${response.statusText}\n`);

    const result = await response.json();
    console.log("📊 Response Body:");
    console.log(JSON.stringify(result, null, 2));

    if (response.status !== 201) {
      console.error("\n❌ Upload failed!");
      process.exit(1);
    }

    console.log("\n✅ Upload successful!");
    console.log(`   Uploaded: ${result.data?.uploaded_count || 0}`);
    console.log(`   Skipped: ${result.data?.skipped_count || 0}`);
    
    if (result.data?.skipped_details?.length > 0) {
      console.log("\n⚠️  Skipped Rows:");
      result.data.skipped_details.forEach((row, i) => {
        console.log(`   ${i+1}. Row ${row.row}: ${row.reason}`);
        console.log(`      Data: ${JSON.stringify(row.data)}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

console.log("🚀 Starting test...\n");
testBulkUpload();
