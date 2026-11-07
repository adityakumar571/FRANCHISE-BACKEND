import mongoose from 'mongoose';

const JournalLineSchema = new mongoose.Schema({
  accountId:    { type: mongoose.Schema.Types.ObjectId, ref: 'AccountMaster' },
  accountName:  { type: String, required: true },
  accountType:  { type: String, enum: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense', 'Other'], required: true },
  debit:        { type: Number, default: 0 },
  credit:       { type: Number, default: 0 },
  narration:    { type: String },
}, { _id: false });

const JournalEntrySchema = new mongoose.Schema({
  jvNo:         { type: String, required: true, unique: true, trim: true },
  entryDate:    { type: Date, default: Date.now, required: true },
  narration:    { type: String, required: true },
  lines:        [JournalLineSchema],
  totalDebit:   { type: Number, default: 0 },
  totalCredit:  { type: Number, default: 0 },
  status:       { type: String, enum: ['Draft', 'Posted', 'Approved', 'Cancelled'], default: 'Draft' },
  reference:    { type: String },
  approvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedDate: { type: Date },
  notes:        { type: String },
  franchiseId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
}, { timestamps: true });

export const getJournalEntryModel = (connection) => {
  try { return connection.model('JournalEntry'); }
  catch { return connection.model('JournalEntry', JournalEntrySchema); }
};
