import mongoose from 'mongoose';

const B2BOrderItemSchema = new mongoose.Schema({
  medicineId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName: { type: String },
  qty:          { type: Number, default: 1 },
  unit:         { type: String, default: 'Strip' },
  rate:         { type: Number, default: 0 },
  amount:       { type: Number, default: 0 },
}, { _id: false });

const B2BOrderSchema = new mongoose.Schema({
  orderId:       { type: String, required: true, unique: true },
  supplierId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName:  { type: String, trim: true },
  items:         [B2BOrderItemSchema],
  totalQty:      { type: Number, default: 0 },
  amount:        { type: Number, default: 0 },
  orderStatus:   { type: String, enum: ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'], default: 'Pending' },
  paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Partial', 'Overdue'], default: 'Pending' },
  notes:         { type: String },
  orderDate:     { type: Date, default: Date.now },
}, { timestamps: true });

export const getB2BOrderModel = (connection) => {
  try { return connection.model('B2BOrder'); }
  catch { return connection.model('B2BOrder', B2BOrderSchema); }
};
