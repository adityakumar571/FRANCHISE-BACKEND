/**
 * Excel Parser - Parse and validate Excel files for bulk medicine upload
 */

import XLSX from "xlsx";
import fs from "fs";

/**
 * Parse Excel file and return array of medicine data
 * Expects columns: Medicine Name, Generic Name, Category, Medical System, Strength, MRP, GST%, Quantity, Batch No, Expiry Date, etc.
 */
export const parseExcelFile = (filePath) => {
  try {
    // Read file
    const buffer = fs.readFileSync(filePath);

    // Parse workbook
    const workbook = XLSX.read(buffer, { type: "buffer" });

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error("No sheets found in Excel file");
    }

    const sheet = workbook.Sheets[sheetName];

    // Convert to JSON with header row
    const medicines = XLSX.utils.sheet_to_json(sheet, {
      header: 0, // Use first row as header
      defval: "", // Default value for empty cells
    });

    if (!medicines || medicines.length === 0) {
      throw new Error("No data found in Excel file");
    }

    return medicines;
  } catch (error) {
    console.error("Excel parsing error:", error);
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
};

/**
 * Map Excel columns to medicine fields
 * Handles various column name formats
 */
export const mapColumnsToFields = (headers) => {
  const columnMap = {};

  const fieldMappings = {
    name: [
      "medicine name",
      "medicine_name",
      "name",
      "medicinename",
      "product name",
    ],
    salt: [
      "generic name",
      "generic_name",
      "salt",
      "ingredient",
      "active ingredient",
    ],
    brand: ["brand", "brand name", "brand_name", "manufacturer"],
    genericName: ["generic name", "generic_name", "salt", "ingredient"],
    category: ["category", "formulation", "type", "form"],
    medicalSystem: ["medical system", "medical_system", "system", "pathy"],
    strength: ["strength", "dose", "dosage", "potency"],
    formulation: ["formulation", "form", "type", "category"],
    company: ["company", "manufacturer", "maker", "pharma"],
    packSize: ["pack size", "pack_size", "packing", "unit"],
    mrp: ["mrp", "price", "retail price", "mrp_price", "retail_price"],
    purchasePrice: [
      "purchase price",
      "purchase_price",
      "cost price",
      "cost_price",
      "pp",
    ],
    gst: ["gst", "gst%", "tax", "tax_percent", "gst_percent"],
    reorderLevel: ["reorder level", "reorder_level", "min stock", "min_stock"],
    quantity: ["quantity", "qty", "stock", "opening stock"],
    batchNo: ["batch no", "batch_no", "batch number", "batch", "lot no"],
    expiryDate: [
      "expiry date",
      "expiry_date",
      "exp date",
      "exp_date",
      "validity",
    ],
    purchaseDate: [
      "purchase date",
      "purchase_date",
      "received date",
      "received_date",
    ],
    barcode: ["barcode", "ean", "upc", "sku"],
  };

  // Find matching header for each field
  Object.keys(fieldMappings).forEach((field) => {
    const possibleNames = fieldMappings[field];

    // Find first header that matches (case-insensitive)
    const foundHeader = headers.find((h) =>
      possibleNames.some(
        (name) => String(h).toLowerCase().trim() === name.toLowerCase().trim(),
      ),
    );

    if (foundHeader) {
      columnMap[field] = foundHeader;
    }
  });

  return columnMap;
};

/**
 * Normalize row data using column mapping
 */
export const normalizeRowData = (row, columnMap) => {
  const normalized = {};

  Object.keys(columnMap).forEach((field) => {
    const excelColumn = columnMap[field];
    let value = row[excelColumn];

    // Handle empty values
    if (value === undefined || value === null || value === "") {
      normalized[field] = "";
      return;
    }

    // Convert to string and trim
    value = String(value).trim();

    // Parse numeric fields
    if (
      ["mrp", "purchasePrice", "gst", "quantity", "reorderLevel"].includes(
        field,
      )
    ) {
      normalized[field] = value;
    }
    // Parse date fields
    else if (["expiryDate", "purchaseDate"].includes(field)) {
      // Try to parse Excel date format
      if (!isNaN(value)) {
        // Excel stores dates as numbers (serial dates)
        const excelDate = new Date((value - 25569) * 86400 * 1000);
        normalized[field] = excelDate.toISOString().split("T")[0];
      } else {
        normalized[field] = value;
      }
    }
    // Regular string fields
    else {
      normalized[field] = value;
    }
  });

  return normalized;
};

/**
 * Validate Excel file
 */
export const validateExcelFile = (file) => {
  const errors = [];

  // Check file exists
  if (!file) {
    errors.push("No file provided");
    return { valid: false, errors };
  }

  // Check file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    errors.push("File size exceeds 5MB limit");
  }

  // Check file type
  const allowedMimes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "application/vnd.ms-excel",
  ];

  if (!allowedMimes.includes(file.mimetype)) {
    errors.push(
      `Invalid file type: ${file.mimetype}. Only .xlsx, .xls, .csv allowed`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Parse Excel with validation and error handling
 */
export const parseAndValidateExcel = (filePath) => {
  try {
    // Parse file
    const medicines = parseExcelFile(filePath);

    // Validate row count
    if (medicines.length === 0) {
      throw new Error("Excel file is empty");
    }

    if (medicines.length > 1000) {
      throw new Error(
        "Maximum 1000 medicines per upload. Current count: " + medicines.length,
      );
    }

    // Get headers from first row
    const headers = Object.keys(medicines[0]);

    // Map columns
    const columnMap = mapColumnsToFields(headers);

    // Check for required columns
    const requiredFields = ["name", "salt", "category", "medicalSystem", "mrp"];
    const missingFields = requiredFields.filter((field) => !columnMap[field]);

    if (missingFields.length > 0) {
      throw new Error(
        `Missing required columns: ${missingFields.join(", ")}. ` +
          `Available columns: ${headers.join(", ")}`,
      );
    }

    // Normalize all rows
    const normalizedMedicines = medicines.map((row) =>
      normalizeRowData(row, columnMap),
    );

    return {
      success: true,
      medicines: normalizedMedicines,
      count: normalizedMedicines.length,
      columns: columnMap,
    };
  } catch (error) {
    console.error("Excel parse and validate error:", error);
    return {
      success: false,
      error: error.message,
      medicines: [],
      count: 0,
    };
  }
};
