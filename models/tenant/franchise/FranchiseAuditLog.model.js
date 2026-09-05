import mongoose from 'mongoose';

const FranchiseAuditLogSchema = new mongoose.Schema({
  action:    { type: String, enum: ['LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'VIEW', 'EXPORT'], required: true },
  module:    { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName:  { type: String, trim: true },
  userRole:  { type: String, trim: true },
  ipAddress: { type: String, trim: true },
  result:    { type: String, enum: ['Success', 'Failed'], default: 'Success' },
}, { timestamps: true });

export const getFranchiseAuditLogModel = (connection) => {
  try { return connection.model('FranchiseAuditLog'); }
  catch { return connection.model('FranchiseAuditLog', FranchiseAuditLogSchema); }
};
