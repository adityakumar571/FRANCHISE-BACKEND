import mongoose from 'mongoose';

const CustomerSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  customerId:    { type: String, trim: true, unique: true },
  phone:         { type: String, trim: true, index: true },
  email:         { type: String, trim: true, lowercase: true },
  address:       { type: String, trim: true },
  dob:           { type: Date },
  gender:        { type: String, enum: ['Male', 'Female', 'Other'] },
  tier:          { type: String, enum: ['Regular', 'Silver', 'Gold', 'Platinum', 'Diamond'], default: 'Regular' },
  walletBalance: { type: Number, default: 0 },
  loyaltyPoints: { type: Number, default: 0 },
  careCoins:     { type: Number, default: 0 },
  totalPurchase: { type: Number, default: 0 },
  dueAmount:     { type: Number, default: 0 },
  membershipId:  { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerMembership' },
  isActive:      { type: Boolean, default: true },
}, { timestamps: true });

export const getCustomerModel = (connection) => {
  try { return connection.model('Customer'); }
  catch { return connection.model('Customer', CustomerSchema); }
};
