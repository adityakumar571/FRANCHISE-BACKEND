import mongoose from 'mongoose'

/**
 * MenuAccess — per-role menu item visibility (stored in tenant DB)
 * One doc per role — tracks which menu items are visible.
 */
const MenuAccessSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Object: { "Dashboard": true, "New Bill": false, ... }
    items: {
      type: Map,
      of: Boolean,
      default: {},
    },
  },
  { timestamps: true }
)

export const getMenuAccessModel = (connection) => {
  try {
    return connection.model('MenuAccess')
  } catch {
    return connection.model('MenuAccess', MenuAccessSchema)
  }
}
