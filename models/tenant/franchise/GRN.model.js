import mongoose from 'mongoose';

const GRNItemSchema = new mongoose.Schema({
  medicineId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName: { type: String, trim: true },
  batchNo:      { type: String, trim: true },
  expiryDate:   { type: Date },
  qty:          { type: Number, default: 1 },
  freeQty:      { type: Number, default: 0 },
  ptr:          { type: Number, default: 0 },
  mrp:          { type: Number, default: 0 },
  rackLabel:    { type: String, trim: true },
  amount:       { type: Number, default: 0 },
}, { _id: false });

const GRNSchema = new mongoose.Schema({
  grnNo:        { type: String, required: true, unique: true, trim: true },
  poRef:        { type: String, trim: true },
  supplierId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplier:     { type: String, trim: true },
  invoiceNo:    { type: String, trim: true },
  invoiceDate:  { type: Date },
  items:        [GRNItemSchema],
  totalAmt:     { type: Number, default: 0 },
  status:       { type: String, enum: ['draft', 'completed', 'cancelled'], default: 'completed' },
}, { timestamps: true });

export const getGRNModel = (connection) => {
  try { return connection.model('GRN'); }
  catch { return connection.model('GRN', GRNSchema); }
};
