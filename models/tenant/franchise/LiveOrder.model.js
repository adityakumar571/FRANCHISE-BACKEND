import mongoose from 'mongoose';

const LiveOrderItemSchema = new mongoose.Schema({
  medicineId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName: { type: String },
  packSize:     { type: String },
  qty:          { type: Number, default: 1 },
  price:        { type: Number, default: 0 },
  discountPct:  { type: Number, default: 0 },
  amount:       { type: Number, default: 0 },
}, { _id: false });

const LiveOrderSchema = new mongoose.Schema({
  orderId:      { type: String, required: true, unique: true },
  supplierId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName: { type: String },
  items:        [LiveOrderItemSchema],
  totalMRP:     { type: Number, default: 0 },
  discountAmt:  { type: Number, default: 0 },
  gstAmt:       { type: Number, default: 0 },
  grandTotal:   { type: Number, default: 0 },
  status:       { type: String, enum: ['Pending', 'Confirmed', 'Packed', 'In Transit', 'Out for Delivery', 'Delivered', 'Cancelled'], default: 'Pending' },
  notes:        { type: String },
}, { timestamps: true });

export const getLiveOrderModel = (connection) => {
  try { return connection.model('LiveOrder'); }
  catch { return connection.model('LiveOrder', LiveOrderSchema); }
};
