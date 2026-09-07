import mongoose from 'mongoose';

const ReturnItemSchema = new mongoose.Schema({
  medicineId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName: { type: String, trim: true },
  batchNo:      { type: String, trim: true },
  qty:          { type: Number, default: 1 },
  reason:       { type: String, enum: ['damaged', 'expired', 'near_expiry', 'incorrect', 'other'], default: 'damaged' },
  amount:       { type: Number, default: 0 },
}, { _id: false });

const PurchaseReturnSchema = new mongoose.Schema({
  returnNo:     { type: String, required: true, unique: true, trim: true },
  supplierId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplier:     { type: String, trim: true },
  grnRef:       { type: String, trim: true },
  items:        [ReturnItemSchema],
  totalAmt:     { type: Number, default: 0 },
  status:       { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' },
  notes:        { type: String, trim: true },
}, { timestamps: true });

export const getPurchaseReturnModel = (connection) => {
  try { return connection.model('PurchaseReturn'); }
  catch { return connection.model('PurchaseReturn', PurchaseReturnSchema); }
};
