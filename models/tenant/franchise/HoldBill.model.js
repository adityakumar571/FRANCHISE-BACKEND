import mongoose from 'mongoose';

const HoldBillItemSchema = new mongoose.Schema({
  medicineId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName: String,
  batchNo:      String,
  qty:          { type: Number, default: 1 },
  mrp:          Number,
  discountPct:  { type: Number, default: 0 },
  gstPct:       { type: Number, default: 0 },
  amount:       Number,
}, { _id: false });

const HoldBillSchema = new mongoose.Schema({
  holdId:       { type: String, trim: true },
  customerName: { type: String, default: 'Walk-In Customer' },
  customerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  items:        [HoldBillItemSchema],
  subtotal:     { type: Number, default: 0 },
  discountAmt:  { type: Number, default: 0 },
  totalAmt:     { type: Number, default: 0 },
  note:         { type: String, trim: true },
  cashierId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

export const getHoldBillModel = (connection) => {
  try { return connection.model('HoldBill'); }
  catch { return connection.model('HoldBill', HoldBillSchema); }
};
