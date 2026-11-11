import mongoose from "mongoose";

const BatchSchema = new mongoose.Schema(
  {
    batchNo: { type: String, required: true, trim: true },
    mfgDate: { type: Date },
    expiryDate: { type: Date, required: true },
    quantity: { type: Number, required: true, default: 0 },
    availableQty: { type: Number }, // For FIFO tracking - will default to quantity if not set
    mrp: { type: Number, required: true },
    purchasePrice: { type: Number, required: true },
    supplierId: { type: String }, // Supplier reference
    supplierName: { type: String },
    purchaseDate: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    rackLocation: {
      rackId: { type: String, trim: true }, // 'RACK-A', 'RACK-B'
      shelf: { type: Number }, // 1-10
      row: { type: String }, // 'A'-'Z'
      column: { type: Number }, // 1-20
      position: { type: String }, // Auto-generated: 'A-3-B-5'
    },
  },
  { timestamps: true },
);

// Pre-save hook for batch to set availableQty if not provided
BatchSchema.pre("save", function (next) {
  if (this.availableQty === undefined || this.availableQty === null) {
    this.availableQty = this.quantity;
  }
  next();
});

const MedicineSchema = new mongoose.Schema(
  {
    // Excel Fields - Global Medicine Master
    medicine_id: { type: String, trim: true, sparse: true, index: true }, // From Excel
    generic_name: { type: String, trim: true },
    brand_names: [String], // Multiple brand names
    manufacturer: { type: String, trim: true },
    medical_system: {
      type: String,
      enum: ["Allopathy", "Ayurveda", "Homeopathy", "Unani", "Siddha"],
    },
    primary_specialty: { type: String, trim: true },
    secondary_specialties: [String],
    patient_conditions: [String],
    sub_category: { type: String, trim: true },

    // Clinical Details
    indications_symptoms: { type: String, trim: true },
    benefits_summary: { type: String, trim: true },
    common_side_effects: [String],
    contraindications: [String],
    drug_interactions: [String],
    dosage_adult: { type: String, trim: true },
    dosage_pediatric: { type: String, trim: true },
    pregnancy_category: { type: String, trim: true },
    storage_conditions: { type: String, trim: true },
    expiry_months: { type: Number },
    vet_safe: { type: Boolean, default: false },
    keywords_synonyms: [String],
    regulatory_status: {
      type: String,
      enum: ["Approved", "Under Review", "Banned"],
      default: "Approved",
    },
    source: { type: String, trim: true },
    last_updated: { type: Date },
    notes: { type: String, trim: true },

    // Basic Information (for local franchise use)
    name: { type: String, required: true, trim: true, index: true },
    genericName: { type: String, trim: true },
    salt: { type: String, trim: true },
    brand: { type: String, trim: true },
    strength: { type: String, trim: true },
    formulation: { type: String, trim: true }, // Tablet, Capsule, Syrup, Injection, etc.
    category: { type: String, trim: true, index: true },
    company: { type: String, trim: true },
    unit: { type: String, trim: true, default: "Tablet" },
    packSize: { type: String, trim: true }, // e.g. "1x10", "Strip of 10"

    // Pricing
    mrp: { type: Number, required: true, default: 0 },
    purchasePrice: { type: Number, default: 0 },
    sellingPrice: { type: Number, default: 0 }, // Calculated or manual

    // Tax & Regulatory
    gstPercent: { type: Number, default: 12 },
    gst: { type: String, default: "12%" }, // For display
    hsnCode: { type: String, trim: true, default: "3004" },
    schedule: {
      type: String,
      enum: ["H", "H1", "X", "G", "None"],
      default: "None",
    },
    requiresPrescription: { type: Boolean, default: false },
    prescription_required: { type: Boolean, default: false }, // Alternative field name from Excel

    // Identification
    barcode: { type: String, trim: true, sparse: true, unique: true },
    sku: { type: String, trim: true },

    // Stock Management
    currentStock: { type: Number, default: 0, index: true },
    reorderLevel: { type: Number, default: 10 },
    openingStock: { type: Number, default: 0 },
    minStock: { type: Number, default: 5 },
    maxStock: { type: Number, default: 1000 },

    // Batch Management
    batches: [BatchSchema],
    isBatchTracked: { type: Boolean, default: true },

    // Counter & Rack Assignment
    counterId: { type: mongoose.Schema.Types.ObjectId, ref: "Counter" },

    // Rack Location (Default/Primary Location)
    rackLocation: {
      rackId: { type: String, trim: true, index: true },
      shelf: { type: Number },
      row: { type: String },
      column: { type: Number },
      position: { type: String, index: true }, // 'A-3-B-5'
      qrCode: { type: String }, // For mobile scanning
    },

    // Images & Media
    images: [String], // Cloudinary URLs
    imageUrl: { type: String, trim: true }, // Primary image

    // Dimensions (for storage calculation)
    dimensions: {
      length: { type: Number }, // cm
      width: { type: Number }, // cm
      height: { type: Number }, // cm
      weight: { type: Number }, // grams
    },

    // Alternative Medicines
    alternativeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Medicine" }],

    // Status
    isActive: { type: Boolean, default: true },
    isDiscontinued: { type: Boolean, default: false },
    isGlobal: { type: Boolean, default: false, index: true }, // true = Global medicine (created by Superadmin in main DB)

    // ── Global Medicine Sync (Tenant DB Only) ──
    linkedGlobalMedicineId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      sparse: true,
      index: true,
    }, // Reference to global medicine (in main DB) if imported from global

    isLinkedToGlobal: {
      type: Boolean,
      default: false,
      index: true,
    }, // Quick flag for linked medicines

    globalMedicineData: {
      // Frozen snapshot of global medicine at import time
      medicine_id: String,
      generic_name: String,
      brand_names: [String],
      manufacturer: String,
      medical_system: String,
      primary_specialty: String,
      secondary_specialties: [String],
      patient_conditions: [String],
      sub_category: String,
      indications_symptoms: String,
      benefits_summary: String,
      common_side_effects: [String],
      contraindications: [String],
      drug_interactions: [String],
      dosage_adult: String,
      dosage_pediatric: String,
      pregnancy_category: String,
      storage_conditions: String,
      expiry_months: Number,
      vet_safe: Boolean,
      keywords_synonyms: [String],
      regulatory_status: String,
      source: String,
      notes: String,
      importedAt: { type: Date, default: Date.now },
      lastSyncedAt: { type: Date, default: null },
    },

    // Additional Info
    description: { type: String, trim: true },
    sideEffects: { type: String, trim: true },
    dosage: { type: String, trim: true },
    warnings: { type: String, trim: true },

    // Metadata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Indexes for better performance
MedicineSchema.index({ name: "text", genericName: "text", salt: "text" });
MedicineSchema.index({ category: 1, isActive: 1 });
MedicineSchema.index({ "batches.expiryDate": 1 }); // For expiry alerts

// Pre-save hook to calculate stock from batches
MedicineSchema.pre("save", function (next) {
  if (this.isBatchTracked && this.batches && this.batches.length > 0) {
    this.currentStock = this.batches.reduce((sum, batch) => {
      // Use availableQty if exists, otherwise use quantity
      const qty =
        batch.availableQty !== undefined ? batch.availableQty : batch.quantity;
      return sum + (batch.isActive !== false ? qty : 0);
    }, 0);
  }

  // Auto-generate position string
  if (
    this.rackLocation &&
    this.rackLocation.rackId &&
    this.rackLocation.shelf &&
    this.rackLocation.row &&
    this.rackLocation.column
  ) {
    this.rackLocation.position = `${this.rackLocation.rackId}-${this.rackLocation.shelf}-${this.rackLocation.row}-${this.rackLocation.column}`;
  }

  next();
});

// Method to get active batches sorted by expiry (FIFO)
MedicineSchema.methods.getActiveBatches = function () {
  return this.batches
    .filter((b) => b.isActive && b.availableQty > 0)
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
};

// Method to check if medicine is expiring soon (within 60 days)
MedicineSchema.methods.isExpiringSoon = function (days = 60) {
  const expiryThreshold = new Date();
  expiryThreshold.setDate(expiryThreshold.getDate() + days);

  return this.batches.some(
    (batch) =>
      batch.isActive &&
      batch.availableQty > 0 &&
      new Date(batch.expiryDate) <= expiryThreshold,
  );
};

// Method to check if medicine is expired
MedicineSchema.methods.hasExpiredBatches = function () {
  const today = new Date();
  return this.batches.some(
    (batch) => batch.isActive && new Date(batch.expiryDate) < today,
  );
};

// Static method to find medicines by rack location
MedicineSchema.statics.findByRackLocation = function (
  rackId,
  shelf = null,
  row = null,
  column = null,
) {
  const query = {
    "rackLocation.rackId": rackId,
    isActive: true,
  };
  if (shelf) query["rackLocation.shelf"] = shelf;
  if (row) query["rackLocation.row"] = row;
  if (column) query["rackLocation.column"] = column;

  return this.find(query).sort({
    "rackLocation.shelf": 1,
    "rackLocation.row": 1,
    "rackLocation.column": 1,
  });
};

export const getMedicineModel = (connection) => {
  try {
    return connection.model("Medicine");
  } catch {
    return connection.model("Medicine", MedicineSchema);
  }
};
