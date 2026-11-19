/**
 * Medicine Matcher - Smart matching logic for bulk upload
 * Handles case-insensitive comparison with normalization
 */

/**
 * Normalize text for comparison
 * - Convert to lowercase
 * - Trim whitespace
 * - Remove special characters
 * - Normalize multiple spaces
 */
export const normalizeForComparison = (text) => {
  if (!text) return "";

  return String(text)
    .toLowerCase() 
    .trim() // Remove leading/trailing spaces
    .replace(/\s+/g, " ") // Normalize multiple spaces to single space
    .replace(/[^\w\s]/g, ""); // Remove special characters (keep only alphanumeric & spaces)
};

/**
 * Find existing medicine by name + salt + strength + brand (case-insensitive)
 * Returns the medicine if found, null otherwise
 */
export const findMatchingMedicine = async (Medicine, inputData) => {
  const { name, salt, strength, brand } = inputData;

  // Normalize inputs
  const normName = normalizeForComparison(name);
  const normSalt = normalizeForComparison(salt);
  const normStrength = normalizeForComparison(strength);
  const normBrand = normalizeForComparison(brand);

  // Validate required fields (strength & brand can be empty, but name & salt required)
  if (!normName || !normSalt) {
    return null;
  }

  try {
    // Query all active medicines and filter in-memory with case-insensitive comparison
    // This approach works even if the DB doesn't support regex aggregation
    const allMedicines = await Medicine.find({
      isActive: true,
    })
      .select("_id name salt strength brand batches")
      .lean();

    // Find first medicine matching normalized values
    const matching = allMedicines.find((med) => {
      const medNormName = normalizeForComparison(med.name);
      const medNormSalt = normalizeForComparison(med.salt);
      const medNormStrength = normalizeForComparison(med.strength);
      const medNormBrand = normalizeForComparison(med.brand);

      return (
        medNormName === normName &&
        medNormSalt === normSalt &&
        medNormStrength === normStrength &&
        medNormBrand === normBrand
      );
    });

    return matching || null;
  } catch (error) {
    console.error("Error in findMatchingMedicine:", error);
    return null;
  }
};

/**
 * Validate medicine data
 * Returns { valid: boolean, errors: string[] }
 */
export const validateMedicineData = (rowData, rowNumber) => {
  const errors = [];

  // Check required fields
  if (!rowData.name || String(rowData.name).trim() === "") {
    errors.push("Medicine name is required");
  }
  if (!rowData.salt || String(rowData.salt).trim() === "") {
    errors.push("Salt (generic name) is required");
  }
  if (!rowData.category || String(rowData.category).trim() === "") {
    errors.push("Category is required");
  }
  if (!rowData.medicalSystem || String(rowData.medicalSystem).trim() === "") {
    errors.push("Medical system is required");
  }
  if (!rowData.mrp) {
    errors.push("MRP is required");
  }

  // Validate numeric fields
  const mrp = parseFloat(rowData.mrp);
  if (isNaN(mrp) || mrp <= 0) {
    errors.push("MRP must be a positive number");
  }

  const gst = parseFloat(rowData.gst || "12");
  if (isNaN(gst) || gst < 0 || gst > 28) {
    errors.push("GST% must be between 0 and 28");
  }

  const qty = parseInt(rowData.quantity || "0");
  if (isNaN(qty) || qty < 0) {
    errors.push("Quantity must be a non-negative integer");
  }

  // Validate batch number if quantity > 0
  if (qty > 0 && (!rowData.batchNo || String(rowData.batchNo).trim() === "")) {
    errors.push("Batch number is required when quantity > 0");
  }

  // Validate expiry date if quantity > 0
  if (
    qty > 0 &&
    (!rowData.expiryDate || String(rowData.expiryDate).trim() === "")
  ) {
    errors.push("Expiry date is required when quantity > 0");
  } else if (qty > 0 && rowData.expiryDate) {
    const expiryDate = new Date(rowData.expiryDate);
    if (isNaN(expiryDate.getTime())) {
      errors.push("Expiry date format is invalid (use YYYY-MM-DD)");
    }
    // Allow any date - past or future (no past date check)
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Prepare batch data from Excel row
 */
export const prepareBatchData = (rowData) => {
  const qty = parseInt(rowData.quantity || "0");

  if (qty === 0) {
    return null; // No batch if quantity is 0
  }

  const batch = {
    batchNo: String(rowData.batchNo).trim(),
    quantity: qty,
    availableQty: qty,
    mrp: parseFloat(rowData.mrp),
    purchasePrice: parseFloat(rowData.purchasePrice || rowData.mrp),
    expiryDate: new Date(rowData.expiryDate),
    purchaseDate: new Date(rowData.purchaseDate || new Date()),
    isActive: true,
  };

  return batch;
};

/**
 * Prepare medicine data from Excel row (for new medicines)
 */
export const prepareMedicineData = (rowData, counterId, defaultRackId) => {
  return {
    name: String(rowData.name).trim(),
    salt: String(rowData.salt).trim(),
    brand: String(rowData.brand || "").trim(), // ← ADD brand
    genericName: String(rowData.genericName || rowData.salt).trim(),
    category: String(rowData.category).trim(),
    medical_system: String(rowData.medicalSystem || "").trim(),  // Keep for API compatibility
    strength: String(rowData.strength || "").trim(),
    formulation: String(rowData.formulation || "").trim(),
    company: String(rowData.company || "").trim(),
    packSize: String(rowData.packSize || "").trim(),
    mrp: parseFloat(rowData.mrp),
    purchasePrice: parseFloat(rowData.purchasePrice || rowData.mrp),
    gstPercent: parseFloat(rowData.gst || "12"),
    reorderLevel: parseInt(rowData.reorderLevel || "10"),
    barcode: rowData.barcode ? String(rowData.barcode).trim() : undefined,
    counterId,
    rackLocation: defaultRackId
      ? {
          rackId: defaultRackId,
          shelf: 1,
          row: "A",
          column: 1,
          position: `${defaultRackId}-1-A-1`,
        }
      : undefined,
    isBatchTracked: true,
    batches: [],
    isActive: true,
  };
};
