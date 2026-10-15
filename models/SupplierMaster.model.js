import mongoose from 'mongoose'

/**
 * SupplierMaster — single collection for all dropdown masters
 *   type: 'category' | 'unit' | 'company'
 *   name: the display value
 *   isActive: soft delete / hide from dropdowns
 */
const supplierMasterSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['category', 'unit', 'company'],
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
)

// Unique: same name cannot appear twice for the same type
supplierMasterSchema.index({ type: 1, name: 1 }, { unique: true })

export default mongoose.model('SupplierMaster', supplierMasterSchema)
