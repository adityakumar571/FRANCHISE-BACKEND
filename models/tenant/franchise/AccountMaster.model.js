import mongoose from 'mongoose';

const AccountMasterSchema = new mongoose.Schema({
  accountCode:  { type: String, required: true, unique: true, trim: true },
  accountName:  { type: String, required: true, trim: true },
  accountType:  { type: String, enum: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense', 'Other'], required: true },
  subType:      { type: String }, // e.g., Current Asset, Fixed Asset, etc.
  description:  { type: String },
  openingBalance: { type: Number, default: 0 },
  isActive:     { type: Boolean, default: true },
  franchiseId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const getAccountMasterModel = (connection) => {
  try { return connection.model('AccountMaster'); }
  catch { return connection.model('AccountMaster', AccountMasterSchema); }
};
