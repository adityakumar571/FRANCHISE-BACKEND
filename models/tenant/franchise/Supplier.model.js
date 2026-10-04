import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const SupplierSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  supplierCode: { type: String, trim: true },
  phone:        { type: String, trim: true },
  email:        { type: String, trim: true, lowercase: true },
  password:     { type: String, select: false }, // Default: supplierCode
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
  lastLogin:    { type: Date },
  isFirstLogin: { type: Boolean, default: true },
}, { timestamps: true });

// Hash password before saving
SupplierSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    // If no password set, use supplierCode as default
    if (!this.password && this.supplierCode) {
      this.password = this.supplierCode;
    }
    
    // Hash the password
    if (this.password) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
SupplierSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    return false;
  }
};

export const getSupplierModel = (connection) => {
  try { return connection.model('Supplier'); }
  catch { return connection.model('Supplier', SupplierSchema); }
};
