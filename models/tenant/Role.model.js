import mongoose from 'mongoose'

const RoleSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    color:       { type: String, default: '#0c3b73' },  // hex color for badge
    isActive:    { type: Boolean, default: true },
    isSystem:    { type: Boolean, default: false },     // system roles cannot be deleted
  },
  { timestamps: true }
)

// Unique role name per tenant DB
RoleSchema.index({ name: 1 }, { unique: true })

export const getRoleModel = (connection) => {
  try {
    return connection.model('Role')
  } catch {
    return connection.model('Role', RoleSchema)
  }
}
