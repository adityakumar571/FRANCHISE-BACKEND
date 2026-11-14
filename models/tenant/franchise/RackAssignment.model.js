import mongoose from 'mongoose';

/**
 * RackAssignment Model
 * Stores per-medicine rack location assignments for a franchise
 * Allows manual override + batch-level rack assignments
 */

const RackAssignmentSchema = new mongoose.Schema({
  franchiseId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  medicineId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  medicineName:  { type: String, trim: true },
  batchNo:       { type: String, trim: true },  // If batch-specific, else null (use medicine-level default)
  
  // Location assignment
  counterId:     { type: String, trim: true },  // e.g., 'Counter-1', 'Counter-2'
  rackId:        { type: String, trim: true },  // e.g., 'RACK-A', 'RACK-B'
  shelf:         { type: Number },              // 1-10
  row:           { type: String },              // 'A'-'Z'
  column:        { type: Number },              // 1-20
  position:      { type: String, trim: true }, // Auto-gen: "Counter-1>RACK-A>1-A-5"
  
  // Tracking
  assignedVia:   { type: String, enum: ['auto', 'manual', 'bulk'], default: 'auto' },  // How it was assigned
  assignedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },  // User who assigned
  grnId:         { type: mongoose.Schema.Types.ObjectId, ref: 'GRN' },    // Which GRN this was assigned from
  
  // Metadata
  isActive:      { type: Boolean, default: true },
  notes:         { type: String, trim: true },
  
}, { timestamps: true });

// Index for quick lookups
RackAssignmentSchema.index({ franchiseId: 1, medicineId: 1, batchNo: 1 });
RackAssignmentSchema.index({ franchiseId: 1, position: 1 });

export const getRackAssignmentModel = (connection) => {
  try { return connection.model('RackAssignment'); }
  catch { return connection.model('RackAssignment', RackAssignmentSchema); }
};
