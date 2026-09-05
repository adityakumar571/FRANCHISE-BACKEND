import mongoose from 'mongoose';

const MedicineBatchSchema = new mongoose.Schema({
  medicineId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true, index: true },
  batchNo:      { type: String, required: true, trim: true },
  expiryDate:   { type: Date, required: true },
  mfgDate:      { type: Date },
  qty:          { type: Number, default: 0 },
  freeQty:      { type: Number, default: 0 },
  purchasePrice: { type: Number, default: 0 },
  mrp:          { type: Number, default: 0 },
  supplierId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  grnId:        { type: mongoose.Schema.Types.ObjectId, ref: 'GRN' },
  rackLabel:    { type: String, trim: true },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

export const getMedicineBatchModel = (connection) => {
  try { return connection.model('MedicineBatch'); }
  catch { return connection.model('MedicineBatch', MedicineBatchSchema); }
};
