import mongoose from 'mongoose';

const SaleItemSchema = new mongoose.Schema({
  medicineId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  medicineName: { type: String },
  batchNo:      { type: String },
  expiryDate:   { type: Date },
  qty:          { type: Number, required: true },
  mrp:          { type: Number, required: true },
  discountPct:  { type: Number, default: 0 },
  gstPct:       { type: Number, default: 0 },
  amount:       { type: Number, required: true },
}, { _id: false });

const SaleInvoiceSchema = new mongoose.Schema({
  invoiceNo:    { type: String, required: true, unique: true, trim: true },
  invoiceDate:  { type: Date, default: Date.now },
  customerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, default: 'Walk-in Customer' },
  customerPhone: { type: String },
  items:        [SaleItemSchema],
  subtotal:     { type: Number, default: 0 },
  discountAmt:  { type: Number, default: 0 },
  gstAmt:       { type: Number, default: 0 },
  roundOff:     { type: Number, default: 0 },
  totalAmt:     { type: Number, required: true },
  paymentMode:  { type: String, enum: ['Cash', 'UPI', 'Card', 'Credit', 'Wallet', 'Split'], default: 'Cash' },
  paidAmt:      { type: Number, default: 0 },
  dueAmt:       { type: Number, default: 0 },
  cashierId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cashierName:  { type: String },
  isReturn:     { type: Boolean, default: false },
  status:       { type: String, enum: ['Completed', 'Held', 'Cancelled', 'Returned'], default: 'Completed' },
  notes:        { type: String, trim: true },
}, { timestamps: true });

export const getSaleInvoiceModel = (connection) => {
  try { return connection.model('SaleInvoice'); }
  catch { return connection.model('SaleInvoice', SaleInvoiceSchema); }
};
