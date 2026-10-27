import mongoose from 'mongoose';

const MedicineBatchSchema = new mongoose.Schema({
  medicineId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true, index: true },
  batchNo:      { type: String, required: true, trim: true },
  expiryDate:   { type: Date, required: true },
  mfgDate:      { type: Date },
  qty:          { type: Number, default: 0 },
  freeQty:      { type: Number, default: 0 },
  purchasePrice: { type: Number, default: 0 },
  ptr:          { type: Number, default: 0 },
  mrp:          { type: Number, default: 0 },
  gst:          { type: Number, default: 0 },
  discount:     { type: Number, default: 0 },
  supplierId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  grnId:        { type: mongoose.Schema.Types.ObjectId, ref: 'GRN' },
  adjustmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockAdjustment' },
  rackLabel:    { type: String, trim: true }, // Legacy field (kept for backward compatibility)
  rackLocation: { // New structured rack location (optional, synced from Medicine)
    rackId:   { type: String, trim: true },
    shelf:    { type: Number },
    row:      { type: String, trim: true },
    column:   { type: Number },
    position: { type: String, trim: true } // Auto-generated: "A01-1-A-5"
  },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

export const getMedicineBatchModel = (connection) => {
  try { return connection.model('MedicineBatch'); }
  catch { return connection.model('MedicineBatch', MedicineBatchSchema); }
};
