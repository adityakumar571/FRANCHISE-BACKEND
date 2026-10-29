import mongoose from 'mongoose';

const BatchSchema = new mongoose.Schema({
  batchNo:        { type: String, required: true, trim: true },
  mfgDate:        { type: Date },
  expiryDate:     { type: Date, required: true },
  quantity:       { type: Number, required: true, default: 0 },
  availableQty:   { type: Number }, // For FIFO tracking - will default to quantity if not set
  mrp:            { type: Number, required: true },
  purchasePrice:  { type: Number, required: true },
  supplierId:     { type: String }, // Supplier reference
  supplierName:   { type: String },
  purchaseDate:   { type: Date, default: Date.now },
  isActive:       { type: Boolean, default: true },
  rackLocation:   {
    rackId:       { type: String, trim: true }, // 'RACK-A', 'RACK-B'
    shelf:        { type: Number },              // 1-10
    row:          { type: String },              // 'A'-'Z'
    column:       { type: Number },              // 1-20
    position:     { type: String },              // Auto-generated: 'A-3-B-5'
  },
}, { timestamps: true });

// Pre-save hook for batch to set availableQty if not provided
BatchSchema.pre('save', function(next) {
  if (this.availableQty === undefined || this.availableQty === null) {
    this.availableQty = this.quantity;
  }
  next();
});

const MedicineSchema = new mongoose.Schema({
  // Basic Information
  name:           { type: String, required: true, trim: true, index: true },
  genericName:    { type: String, trim: true },
  salt:           { type: String, trim: true },
  brand:          { type: String, trim: true },
  strength:       { type: String, trim: true },
  formulation:    { type: String, trim: true }, // Tablet, Capsule, Syrup, Injection, etc. (stores name or ID)
  category:       { type: String, trim: true, index: true },
  company:        { type: String, trim: true },
  unit:           { type: String, trim: true, default: 'Tablet' },
  packSize:       { type: String, trim: true }, // e.g. "1x10", "Strip of 10"
  
  // Pricing
  mrp:            { type: Number, required: true, default: 0 },
  purchasePrice:  { type: Number, default: 0 },
  sellingPrice:   { type: Number, default: 0 }, // Calculated or manual
  
  // Tax & Regulatory
  gstPercent:     { type: Number, default: 12 },
  gst:            { type: String, default: '12%' }, // For display
  hsnCode:        { type: String, trim: true, default: '3004' },
  schedule:       { type: String, enum: ['H', 'H1', 'X', 'G', 'None'], default: 'None' },
  requiresPrescription: { type: Boolean, default: false },
  
  // Identification
  barcode:        { type: String, trim: true, sparse: true, unique: true },
  sku:            { type: String, trim: true },
  
  // Stock Management
  currentStock:   { type: Number, default: 0, index: true },
  reorderLevel:   { type: Number, default: 10 },
  openingStock:   { type: Number, default: 0 },
  minStock:       { type: Number, default: 5 },
  maxStock:       { type: Number, default: 1000 },
  
  // Batch Management
  batches:        [BatchSchema],
  isBatchTracked: { type: Boolean, default: true },
  
  // Counter & Rack Assignment
  counterId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Counter' },
  
  // Rack Location (Default/Primary Location)
  rackLocation:   {
    rackId:       { type: String, trim: true, index: true },
    shelf:        { type: Number },
    row:          { type: String },
    column:       { type: Number },
    position:     { type: String, index: true }, // 'A-3-B-5'
    qrCode:       { type: String }, // For mobile scanning
  },
  
  // Images & Media
  images:         [String], // Cloudinary URLs
  imageUrl:       { type: String, trim: true }, // Primary image
  
  // Dimensions (for storage calculation)
  dimensions:     {
    length:       { type: Number }, // cm
    width:        { type: Number }, // cm
    height:       { type: Number }, // cm
    weight:       { type: Number }, // grams
  },
  
  // Alternative Medicines
  alternativeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' }],
  
  // Status
  isActive:       { type: Boolean, default: true },
  isDiscontinued: { type: Boolean, default: false },
  
  // Additional Info
  description:    { type: String, trim: true },
  sideEffects:    { type: String, trim: true },
  dosage:         { type: String, trim: true },
  warnings:       { type: String, trim: true },
  
  // Metadata
  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Indexes for better performance
MedicineSchema.index({ name: 'text', genericName: 'text', salt: 'text' });
MedicineSchema.index({ barcode: 1 }, { unique: true, sparse: true });
MedicineSchema.index({ 'rackLocation.position': 1 });
MedicineSchema.index({ category: 1, isActive: 1 });
MedicineSchema.index({ currentStock: 1 }); // For low stock queries
MedicineSchema.index({ 'batches.expiryDate': 1 }); // For expiry alerts

// Pre-save hook to calculate stock from batches
MedicineSchema.pre('save', function(next) {
  if (this.isBatchTracked && this.batches && this.batches.length > 0) {
    this.currentStock = this.batches.reduce((sum, batch) => {
      // Use availableQty if exists, otherwise use quantity
      const qty = batch.availableQty !== undefined ? batch.availableQty : batch.quantity;
      return sum + (batch.isActive !== false ? qty : 0);
    }, 0);
  }
  
  // Auto-generate position string
  if (this.rackLocation && this.rackLocation.rackId && this.rackLocation.shelf && this.rackLocation.row && this.rackLocation.column) {
    this.rackLocation.position = `${this.rackLocation.rackId}-${this.rackLocation.shelf}-${this.rackLocation.row}-${this.rackLocation.column}`;
  }
  
  next();
});

// Method to get active batches sorted by expiry (FIFO)
MedicineSchema.methods.getActiveBatches = function() {
  return this.batches
    .filter(b => b.isActive && b.availableQty > 0)
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
};

// Method to check if medicine is expiring soon (within 60 days)
MedicineSchema.methods.isExpiringSoon = function(days = 60) {
  const expiryThreshold = new Date();
  expiryThreshold.setDate(expiryThreshold.getDate() + days);
  
  return this.batches.some(batch => 
    batch.isActive && 
    batch.availableQty > 0 && 
    new Date(batch.expiryDate) <= expiryThreshold
  );
};

// Method to check if medicine is expired
MedicineSchema.methods.hasExpiredBatches = function() {
  const today = new Date();
  return this.batches.some(batch => 
    batch.isActive && 
    new Date(batch.expiryDate) < today
  );
};

// Static method to find medicines by rack location
MedicineSchema.statics.findByRackLocation = function(rackId, shelf = null, row = null, column = null) {
  const query = { 
    'rackLocation.rackId': rackId,
    isActive: true 
  };
  if (shelf) query['rackLocation.shelf'] = shelf;
  if (row) query['rackLocation.row'] = row;
  if (column) query['rackLocation.column'] = column;
  
  return this.find(query).sort({ 'rackLocation.shelf': 1, 'rackLocation.row': 1, 'rackLocation.column': 1 });
};

export const getMedicineModel = (connection) => {
  try { return connection.model('Medicine'); }
  catch { return connection.model('Medicine', MedicineSchema); }
};
