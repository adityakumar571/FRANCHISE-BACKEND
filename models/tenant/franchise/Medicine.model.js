import mongoose from 'mongoose';

const MedicineSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  genericName:    { type: String, trim: true },
  salt:           { type: String, trim: true },
  strength:       { type: String, trim: true },
  formulation:    { type: String, trim: true }, // Tablet, Capsule, Syrup, Injection, etc.
  category:       { type: String, trim: true },
  company:        { type: String, trim: true },
  packSize:       { type: String, trim: true }, // e.g. "Strip of 10"
  mrp:            { type: Number, default: 0 },
  purchasePrice:  { type: Number, default: 0 },
  gstPercent:     { type: Number, default: 0 },
  hsnCode:        { type: String, trim: true },
  barcode:        { type: String, trim: true, index: true },
  rackId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Rack' },
  rackLabel:      { type: String, trim: true }, // e.g. "A-2"
  reorderLevel:   { type: Number, default: 10 },
  currentStock:   { type: Number, default: 0 },
  isActive:       { type: Boolean, default: true },
  imageUrl:       { type: String, trim: true },
  schedule:       { type: String, enum: ['H', 'H1', 'X', 'G', 'None'], default: 'None' },
  requiresPrescription: { type: Boolean, default: false },
  alternativeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' }],
}, { timestamps: true });

MedicineSchema.index({ name: 'text', genericName: 'text', salt: 'text' });

export const getMedicineModel = (connection) => {
  try { return connection.model('Medicine'); }
  catch { return connection.model('Medicine', MedicineSchema); }
};
