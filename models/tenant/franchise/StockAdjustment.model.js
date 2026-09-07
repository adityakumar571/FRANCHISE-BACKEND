import mongoose from 'mongoose';

const StockAdjustmentSchema = new mongoose.Schema({
  adjNo:        { type: String, required: true, unique: true, trim: true },
  medicineId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicine:     { type: String, required: true, trim: true },
  batch:        { type: String, trim: true },
  type:         { type: String, enum: ['damaged', 'expired', 'correction', 'transfer', 'other'], default: 'correction' },
  qty:          { type: Number, required: true }, // negative = reduction
  reason:       { type: String, required: true, trim: true },
  status:       { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
  by:           { type: String, trim: true, default: 'Admin' },
  approvedBy:   { type: String, trim: true },
}, { timestamps: true });

export const getStockAdjustmentModel = (connection) => {
  try { return connection.model('StockAdjustment'); }
  catch { return connection.model('StockAdjustment', StockAdjustmentSchema); }
};
