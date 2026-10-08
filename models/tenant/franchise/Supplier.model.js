/**
 * ⚠️ DEPRECATED: Tenant Supplier Model
 * 
 * This model is kept for backward compatibility with seed/demo data only.
 * 
 * ✅ PRODUCTION USE: Use global Supplier model from models/Supplier.model.js
 * 
 * Suppliers are now GLOBAL - managed centrally, not per-tenant.
 * This file exists only to prevent breaking imports in legacy seed scripts.
 */

import mongoose from 'mongoose';

const SupplierSchema = new mongoose.Schema({
  name:         { type: String, trim: true },
  supplierCode: { type: String, trim: true },
  phone:        { type: String, trim: true },
  email:        { type: String, trim: true, lowercase: true },
  contactPerson: { type: String, trim: true },
  isActive:     { type: Boolean, default: true },
  rating:       { type: Number, default: 0, min: 0, max: 5 },
}, { timestamps: true });

export const getSupplierModel = (connection) => {
  try { return connection.model('Supplier'); }
  catch { return connection.model('Supplier', SupplierSchema); }
};
