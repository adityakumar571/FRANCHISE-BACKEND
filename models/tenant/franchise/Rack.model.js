import mongoose from 'mongoose';

const RackSchema = new mongoose.Schema({
  counterId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Counter', required: true }, // Link to counter
  code:        { type: String, required: true, unique: true, trim: true },
  name:        { type: String, required: true, trim: true }, // Display name (e.g., RACK-A, RACK-B)
  
  // Shelf Structure
  shelves:     { type: Number, default: 5 }, // Number of shelves in rack (1-10)
  rowsPerShelf: { type: Number, default: 3 }, // Number of rows per shelf (e.g., A, B, C)
  columnsPerRow: { type: Number, default: 4 }, // Number of columns per row
  
  // Capacity & Space
  capacity:    { type: Number, default: 200 }, // Total capacity (pieces/boxes)
  currentItems: { type: Number, default: 0 }, // Track current items
  
  // Status
  status:      { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

export const getRackModel = (connection) => {
  try { return connection.model('Rack'); }
  catch { return connection.model('Rack', RackSchema); }
};
