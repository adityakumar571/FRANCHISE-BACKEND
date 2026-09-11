import mongoose from 'mongoose';

const RackSchema = new mongoose.Schema({
  code:        { type: String, required: true, unique: true, trim: true },
  area:        { type: String, trim: true, default: 'Main Store' },
  shelf:       { type: String, trim: true },
  description: { type: String, trim: true },
  capacity:    { type: Number, default: 20 },
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

export const getRackModel = (connection) => {
  try { return connection.model('Rack'); }
  catch { return connection.model('Rack', RackSchema); }
};
