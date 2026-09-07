import mongoose from 'mongoose';

const LiveWholesaleRateSchema = new mongoose.Schema({
  medicineId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName:  { type: String, required: true, trim: true },
  strength:      { type: String, trim: true },
  packSize:      { type: String, trim: true },
  supplierId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName:  { type: String, trim: true },
  basicRate:     { type: Number, default: 0 },
  mrp:           { type: Number, default: 0 },
  discountPct:   { type: Number, default: 0 },
  scheme:        { type: String, trim: true },
  gstPct:        { type: Number, default: 12 },
  effectiveRate: { type: Number, default: 0 },
  stock:         { type: Number, default: 0 },
  deliveryDays:  { type: Number, default: 1 },
  isActive:      { type: Boolean, default: true },
  updatedAt:     { type: Date, default: Date.now },
}, { timestamps: true });

LiveWholesaleRateSchema.index({ medicineName: 'text', strength: 'text' });

export const getLiveWholesaleRateModel = (connection) => {
  try { return connection.model('LiveWholesaleRate'); }
  catch { return connection.model('LiveWholesaleRate', LiveWholesaleRateSchema); }
};
