import mongoose from 'mongoose';

const POItemSchema = new mongoose.Schema({
  medicineId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName: { type: String, trim: true },
  qty:          { type: Number, default: 1 },
  ptr:          { type: Number, default: 0 },
  mrp:          { type: Number, default: 0 },
  scheme:       { type: String, trim: true },
  amount:       { type: Number, default: 0 },
}, { _id: false });

const PurchaseOrderSchema = new mongoose.Schema({
  poNo:         { type: String, required: true, unique: true, trim: true },
  supplierId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplier:     { type: String, trim: true },
  items:        [POItemSchema],
  totalAmount:  { type: Number, default: 0 },
  expectedDate: { type: Date },
  notes:        { type: String, trim: true },
  status:       { type: String, enum: ['draft', 'pending', 'accepted', 'dispatched', 'completed', 'cancelled'], default: 'pending' },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const getPurchaseOrderModel = (connection) => {
  try { return connection.model('PurchaseOrder'); }
  catch { return connection.model('PurchaseOrder', PurchaseOrderSchema); }
};
