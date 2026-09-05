import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'

/**
 * Distributor — Main DB model
 * Each distributor is a separate company that supplies medicines to franchises.
 */
const distributorSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'Distributor name is required'],
      trim: true,
    },
    distributorCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    // ── Login credentials ─────────────────────────────────────
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      unique: true,
      trim: true,
      match: [/^\d{10}$/, 'Enter a valid 10-digit mobile number'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
    },

    // ── Contact ───────────────────────────────────────────────
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    contactPerson: {
      type: String,
      trim: true,
    },
    phone2: String,

    // ── Business info ─────────────────────────────────────────
    type: {
      type: String,
      enum: ['Wholesale Distributor', 'C&F Agent', 'Stockist', 'Retailer', 'Other'],
      default: 'Wholesale Distributor',
    },
    gstNo: String,
    drugLicenseNo: String,
    panNo: String,

    // ── Address ───────────────────────────────────────────────
    addressLine1: String,
    city: String,
    state: String,
    country: { type: String, default: 'India' },
    pincode: String,

    // ── Stats (denormalised for quick reads) ──────────────────
    totalSkus: { type: Number, default: 0 },
    activeFranchises: { type: Number, default: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },

    // ── Status ────────────────────────────────────────────────
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
  },
  { timestamps: true }
)

// ── JWT ───────────────────────────────────────────────────────
distributorSchema.methods.generateAuthToken = function () {
  return jwt.sign(
    { distributorId: this._id, role: 'distributor', mobile: this.mobile },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  )
}

export default mongoose.model('Distributor', distributorSchema)
