import mongoose from 'mongoose';

const SupplierSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  supplierCode: { type: String, trim: true },
  phone:        { type: String, trim: true },
  email:        { type: String, trim: true, lowercase: true },
  gstNo:        { type: String, trim: true },
  dlNo:         { type: String, trim: true },
  address:      { type: String, trim: true },
  city:         { type: String, trim: true },
  state:        { type: String, trim: true },
  pincode:      { type: String, trim: true },
  contactPerson: { type: String, trim: true },
  isVerified:   { type: Boolean, default: false },
  rating:       { type: Number, default: 0, min: 0, max: 5 },
  isActive:     { type: Boolean, default: true },
  outstandingBalance: { type: Number, default: 0 },
}, { timestamps: true });

export const getSupplierModel = (connection) => {
  try { return connection.model('Supplier'); }
  catch { return connection.model('Supplier', SupplierSchema); }
};
