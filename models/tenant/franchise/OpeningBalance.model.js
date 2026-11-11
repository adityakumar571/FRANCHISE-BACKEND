import mongoose from 'mongoose';

const OpeningBalanceSchema = new mongoose.Schema({
  fiscalYear:   { type: String, required: true }, // e.g., "2024-2025", "2025-2026"
  fiscalYearStart: { type: Date, required: true }, // April 1
  fiscalYearEnd: { type: Date, required: true },   // March 31
  entries:      [{
    accountId:  { type: mongoose.Schema.Types.ObjectId, ref: 'AccountMaster', required: true },
    accountName: { type: String, required: true },
    accountType: { type: String, required: true },
    openingDebit: { type: Number, default: 0 },
    openingCredit: { type: Number, default: 0 },
  }],
  totalDebit:   { type: Number, default: 0 },
  totalCredit:  { type: Number, default: 0 },
  status:       { type: String, enum: ['Draft', 'Approved', 'Locked'], default: 'Draft' },
  franchiseId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const getOpeningBalanceModel = (connection) => {
  try { return connection.model('OpeningBalance'); }
  catch { return connection.model('OpeningBalance', OpeningBalanceSchema); }
};
