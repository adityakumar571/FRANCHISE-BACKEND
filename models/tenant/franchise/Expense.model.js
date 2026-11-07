import mongoose from 'mongoose';

const ExpenseSchema = new mongoose.Schema({
  expenseNo:    { type: String, required: true, unique: true, trim: true },
  expenseDate:  { type: Date, default: Date.now, required: true },
  particulars:  { type: String, required: true },
  amount:       { type: Number, required: true },
  category:     { type: String, enum: ['Rent', 'Salary', 'Utilities', 'Transport', 'Office', 'Marketing', 'Maintenance', 'Insurance', 'Repairs', 'Other'], default: 'Other' },
  paymentMode:  { type: String, enum: ['Cash', 'Bank', 'UPI', 'Card', 'Cheque'], default: 'Cash' },
  vendor:       { type: String },
  vendorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  reference:    { type: String },
  billNo:       { type: String },
  notes:        { type: String },
  status:       { type: String, enum: ['Recorded', 'Approved', 'Paid', 'Cancelled'], default: 'Recorded' },
  franchiseId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
}, { timestamps: true });

export const getExpenseModel = (connection) => {
  try { return connection.model('Expense'); }
  catch { return connection.model('Expense', ExpenseSchema); }
};
