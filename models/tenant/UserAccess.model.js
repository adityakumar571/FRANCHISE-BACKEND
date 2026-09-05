import mongoose from 'mongoose'

/**
 * UserAccess — per-user module access overrides (stored in tenant DB)
 * One doc per user — tracks which modules they can access.
 */
const UserAccessSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    // Array of module keys: dashboard, pos, purchase, inventory, medicines,
    // suppliers, b2b, customers, accounts, staff, reports, settings
    modules: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
)

export const getUserAccessModel = (connection) => {
  try {
    return connection.model('UserAccess')
  } catch {
    return connection.model('UserAccess', UserAccessSchema)
  }
}
