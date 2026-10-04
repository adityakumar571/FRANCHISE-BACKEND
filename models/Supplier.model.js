import mongoose from 'mongoose'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

const supplierSchema = new mongoose.Schema({
  // Basic Info
  companyName: {
    type: String,
    required: true,
    trim: true,
  },
  contactPerson: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  // Authentication
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationToken: {
    type: String,
  },
  resetPasswordToken: {
    type: String,
  },
  resetPasswordExpiry: {
    type: Date,
  },
  lastLogin: {
    type: Date,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  alternatePhone: {
    type: String,
    trim: true,
  },
  address: {
    street: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    pincode: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      default: 'India',
      trim: true,
    },
  },
  businessType: {
    type: String,
    enum: ['Manufacturer', 'Distributor', 'Retailer', 'Wholesaler', 'Service Provider'],
    required: true,
  },
  gstNumber: {
    type: String,
    trim: true,
  },
  panNumber: {
    type: String,
    trim: true,
  },
  bankDetails: {
    accountNumber: {
      type: String,
      trim: true,
    },
    ifscCode: {
      type: String,
      trim: true,
    },
    bankName: {
      type: String,
      trim: true,
    },
    branchName: {
      type: String,
      trim: true,
    },
  },
  // Medicine Inventory
  medicines: [{
    name: {
      type: String,
      required: true,
      trim: true,
    },
    genericName: {
      type: String,
      trim: true,
    },
    manufacturer: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Drops', 'Cream', 'Ointment', 'Other'],
    },
    strength: {
      type: String,
      trim: true,
    },
    packSize: {
      type: String,
      trim: true,
    },
    batchNumber: {
      type: String,
      trim: true,
    },
    expiryDate: {
      type: Date,
    },
    mrp: {
      type: Number,
      required: true,
      min: 0,
    },
    supplierPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    minStock: {
      type: Number,
      default: 10,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      trim: true,
    },
    images: [{
      type: String,
    }],
    addedAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  creditLimit: {
    type: Number,
    default: 0,
  },
  paymentTerms: {
    type: String,
    enum: ['Cash', 'Net 30', 'Net 60', 'Net 90', 'Custom'],
    default: 'Net 30',
  },
  customPaymentTerms: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Suspended', 'Pending'],
    default: 'Pending',
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: {
    type: Date,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 3,
  },
  notes: {
    type: String,
    trim: true,
  },
  documents: [{
    name: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['GST Certificate', 'PAN Card', 'Bank Statement', 'License', 'Agreement', 'Other'],
      trim: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
})

// Indexes for better performance
supplierSchema.index({ email: 1 })
supplierSchema.index({ companyName: 1 })
supplierSchema.index({ status: 1 })
supplierSchema.index({ businessType: 1 })
supplierSchema.index({ createdAt: -1 })
supplierSchema.index({ 'medicines.name': 'text', 'medicines.genericName': 'text' })

// Pre-save middleware to hash password
supplierSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next()
  
  try {
    const salt = await bcrypt.genSalt(10)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// Pre-save middleware to update lastModifiedBy
supplierSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.lastModifiedBy = this.modifiedBy || this.createdBy
  }
  next()
})

// Virtual for full address
supplierSchema.virtual('fullAddress').get(function() {
  const addr = this.address
  return `${addr.street}, ${addr.city}, ${addr.state} - ${addr.pincode}, ${addr.country}`
})

// Authentication methods
supplierSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password)
}

supplierSchema.methods.generatePasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex')
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex')
  this.resetPasswordExpiry = Date.now() + 10 * 60 * 1000 // 10 minutes
  return resetToken
}

// Medicine management methods
supplierSchema.methods.addMedicine = function(medicineData) {
  this.medicines.push({
    ...medicineData,
    addedAt: new Date(),
    updatedAt: new Date()
  })
  return this.save()
}

supplierSchema.methods.updateMedicine = function(medicineId, updateData) {
  const medicine = this.medicines.id(medicineId)
  if (medicine) {
    Object.assign(medicine, updateData)
    medicine.updatedAt = new Date()
    return this.save()
  }
  throw new Error('Medicine not found')
}

supplierSchema.methods.removeMedicine = function(medicineId) {
  this.medicines.id(medicineId).remove()
  return this.save()
}

supplierSchema.methods.updateStock = function(medicineId, newStock) {
  const medicine = this.medicines.id(medicineId)
  if (medicine) {
    medicine.stock = newStock
    medicine.updatedAt = new Date()
    return this.save()
  }
  throw new Error('Medicine not found')
}

export default mongoose.model('Supplier', supplierSchema)