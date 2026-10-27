import mongoose from 'mongoose';

const RackSchema = new mongoose.Schema({
  code:        { type: String, required: true, unique: true, trim: true },
  name:        { type: String, trim: true }, // Display name (e.g., RACK-A, RACK-B)
  area:        { type: String, trim: true, default: 'Main Store' },
  warehouse:   { type: String, trim: true, default: 'Main Pharmacy' }, // Warehouse location
  shelf:       { type: String, trim: true },
  section:     { type: String, trim: true }, // Medicine section (e.g., Pain Relief)
  description: { type: String, trim: true },
  capacity:    { type: Number, default: 20 },
  currentItems: { type: Number, default: 0 }, // Track current items
  status:      { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

export const getRackModel = (connection) => {
  try { return connection.model('Rack'); }
  catch { return connection.model('Rack', RackSchema); }
};
