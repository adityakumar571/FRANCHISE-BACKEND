import mongoose from 'mongoose';

const DayClosingSchema = new mongoose.Schema({
  date:             { type: String, required: true }, // 'YYYY-MM-DD'
  openingCash:      { type: Number, default: 0 },
  totalSales:       { type: Number, default: 0 },
  salesReturns:     { type: Number, default: 0 },
  netSales:         { type: Number, default: 0 },
  transactions:     { type: Number, default: 0 },
  payments: {
    cash:    { type: Number, default: 0 },
    upi:     { type: Number, default: 0 },
    card:    { type: Number, default: 0 },
    credit:  { type: Number, default: 0 },
    wallet:  { type: Number, default: 0 },
  },
  expenses:         { type: Number, default: 0 },
  expectedCash:     { type: Number, default: 0 },
  physicalCash:     { type: Number, default: 0 },
  cashDifference:   { type: Number, default: 0 },
  closingNote:      { type: String, trim: true },
  closedAt:         { type: Date },
  closedBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closedByName:     { type: String },
  status:           { type: String, enum: ['Pending', 'Closed'], default: 'Closed' },
}, { timestamps: true });

export const getDayClosingModel = (connection) => {
  try { return connection.model('DayClosing'); }
  catch { return connection.model('DayClosing', DayClosingSchema); }
};
