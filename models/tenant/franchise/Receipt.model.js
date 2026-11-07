import mongoose from 'mongoose';

const ReceiptSchema = new mongoose.Schema({
  receiptNo:    { type: String, required: true, unique: true, trim: true },
  receiptDate:  { type: Date, default: Date.now, required: true },
  particulars:  { type: String, required: true },
  amount:       { type: Number, required: true },
  mode:         { type: String, enum: ['Cash', 'Bank', 'UPI', 'Cheque', 'Card', 'NEFT', 'RTGS'], default: 'Cash' },
  partyName:    { type: String },
  customerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  reference:    { type: String },
  chequeNo:     { type: String },
  chequeDate:   { type: Date },
  bankName:     { type: String },
  notes:        { type: String },
  status:       { type: String, enum: ['Received', 'Pending', 'Cancelled', 'Bounced'], default: 'Received' },
  franchiseId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
}, { timestamps: true });

export const getReceiptModel = (connection) => {
  try { return connection.model('Receipt'); }
  catch { return connection.model('Receipt', ReceiptSchema); }
};
