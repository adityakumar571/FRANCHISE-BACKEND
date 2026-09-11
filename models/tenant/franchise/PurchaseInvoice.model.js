import mongoose from 'mongoose';

const PurchaseItemSchema = new mongoose.Schema({
  medicineId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  medicineName: { type: String },
  batchNo:      { type: String },
  expiryDate:   { type: Date },
  qty:          { type: Number, required: true },
  freeQty:      { type: Number, default: 0 },
  ptr:          { type: Number, required: true }, // Price to retailer
  mrp:          { type: Number, default: 0 },
  discountPct:  { type: Number, default: 0 },
  gstPct:       { type: Number, default: 0 },
  amount:       { type: Number, required: true },
  rackLabel:    { type: String },
}, { _id: false });

const PurchaseInvoiceSchema = new mongoose.Schema({
  billNo:       { type: String, required: true, unique: true, trim: true },
  billDate:     { type: Date, default: Date.now },
  supplierId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  supplierName: { type: String },
  poRef:        { type: String, trim: true },
  items:        [PurchaseItemSchema],
  subtotal:     { type: Number, default: 0 },
  discountAmt:  { type: Number, default: 0 },
  gstAmt:       { type: Number, default: 0 },
  totalAmt:     { type: Number, required: true },
  paymentMode:  { type: String, enum: ['Cash', 'Credit', 'UPI', 'Bank Transfer', 'Cheque'], default: 'Credit' },
  paidAmt:      { type: Number, default: 0 },
  dueAmt:       { type: Number, default: 0 },
  status:       { type: String, enum: ['Paid', 'Due', 'Partial', 'Cancelled'], default: 'Due' },
  notes:        { type: String, trim: true },
}, { timestamps: true });

export const getPurchaseInvoiceModel = (connection) => {
  try { return connection.model('PurchaseInvoice'); }
  catch { return connection.model('PurchaseInvoice', PurchaseInvoiceSchema); }
};
