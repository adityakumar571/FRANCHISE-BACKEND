import mongoose from 'mongoose';

const FranchiseStaffSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  staffId:     { type: String, unique: true, trim: true },
  role:        { type: String, enum: ['Franchise Owner', 'Branch Manager', 'Pharmacist', 'Cashier'], default: 'Cashier' },
  department:  { type: String, trim: true, default: 'Operations' },
  phone:       { type: String, trim: true },
  email:       { type: String, trim: true, lowercase: true },
  shift:       { type: String, enum: ['Morning', 'Evening', 'Night'], default: 'Morning' },
  salary:      { type: Number, default: 0 },
  joiningDate: { type: Date, default: Date.now },
  isActive:    { type: Boolean, default: true },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  todaySales:  { type: Number, default: 0 },
  attendance:  { type: String, enum: ['Present', 'Absent', 'Late', 'Half Day'], default: 'Present' },
}, { timestamps: true });

export const getFranchiseStaffModel = (connection) => {
  try { return connection.model('FranchiseStaff'); }
  catch { return connection.model('FranchiseStaff', FranchiseStaffSchema); }
};
