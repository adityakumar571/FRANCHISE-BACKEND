import mongoose from 'mongoose';

const AuditItemSchema = new mongoose.Schema({
  medicineId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName:   { type: String, trim: true },
  systemQty:      { type: Number, default: 0 },
  physicalQty:    { type: Number, default: 0 },
  difference:     { type: Number, default: 0 },
  rackLabel:      { type: String, trim: true },
}, { _id: false });

const InventoryAuditSchema = new mongoose.Schema({
  auditNo:    { type: String, required: true, unique: true, trim: true },
  startedAt:  { type: Date, default: Date.now },
  completedAt:{ type: Date },
  items:      [AuditItemSchema],
  status:     { type: String, enum: ['in_progress', 'completed', 'cancelled'], default: 'in_progress' },
  notes:      { type: String, trim: true },
  by:         { type: String, trim: true, default: 'Admin' },
}, { timestamps: true });

export const getInventoryAuditModel = (connection) => {
  try { return connection.model('InventoryAudit'); }
  catch { return connection.model('InventoryAudit', InventoryAuditSchema); }
};
