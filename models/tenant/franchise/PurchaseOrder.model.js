import mongoose from 'mongoose';

const POItemSchema = new mongoose.Schema({
  medicineId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName: { type: String, trim: true },
  qty:          { type: Number, default: 1 },
  ptr:          { type: Number, default: 0 },
  mrp:          { type: Number, default: 0 },
  scheme:       { type: String, trim: true },
  amount:       { type: Number, default: 0 },
}, { _id: false });

const PurchaseOrderSchema = new mongoose.Schema({
  poNo:         { type: String, required: true, unique: true, trim: true },
  supplierId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplier:     { type: String, trim: true },
  items:        [POItemSchema],
  totalAmount:  { type: Number, default: 0 },
  totalMRP:     { type: Number, default: 0 },       // For live rates orders
  discountAmt:  { type: Number, default: 0 },       // For live rates orders
  gstAmt:       { type: Number, default: 0 },       // For live rates orders
  grandTotal:   { type: Number, default: 0 },       // For live rates orders
  expectedDate: { type: Date },
  notes:        { type: String, trim: true },
  status:       { type: String, enum: ['draft', 'pending', 'accepted', 'dispatched', 'completed', 'cancelled', 'Pending', 'Confirmed', 'Packed', 'In Transit', 'Out for Delivery', 'Delivered', 'Cancelled'], default: 'pending' },
  source:       { type: String, enum: ['purchase_module', 'live_rates_module'], default: 'purchase_module', index: true },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const getPurchaseOrderModel = (connection) => {
  try { return connection.model('PurchaseOrder'); }
  catch { return connection.model('PurchaseOrder', PurchaseOrderSchema); }
};
