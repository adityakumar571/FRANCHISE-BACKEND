import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema({
  paymentNo:    { type: String, required: true, unique: true, trim: true },
  paymentDate:  { type: Date, default: Date.now, required: true },
  particulars:  { type: String, required: true },
  amount:       { type: Number, required: true },
  mode:         { type: String, enum: ['Cash', 'Bank', 'UPI', 'Cheque', 'Card', 'NEFT', 'RTGS'], default: 'Bank' },
  partyName:    { type: String },
  supplierId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  purchaseInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseInvoice' },
  reference:    { type: String },
  chequeNo:     { type: String },
  chequeDate:   { type: Date },
  bankName:     { type: String },
  notes:        { type: String },
  status:       { type: String, enum: ['Paid', 'Pending', 'Cancelled'], default: 'Paid' },
  franchiseId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
}, { timestamps: true });

export const getPaymentModel = (connection) => {
  try { return connection.model('Payment'); }
  catch { return connection.model('Payment', PaymentSchema); }
};
