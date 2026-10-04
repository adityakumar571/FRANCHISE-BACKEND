import mongoose from 'mongoose'

const supplierSchema = new mongoose.Schema({
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
  products: [{
    name: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
    },
    unit: {
      type: String,
      trim: true,
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
    enum: ['Active', 'Inactive', 'Blacklisted'],
    default: 'Active',
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
    required: true,
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

// Static method to get suppliers by business type
supplierSchema.statics.getByBusinessType = function(businessType) {
  return this.find({ businessType, status: 'Active' })
}

// Instance method to update rating
supplierSchema.methods.updateRating = function(newRating) {
  this.rating = newRating
  return this.save()
}

// Instance method to add product
supplierSchema.methods.addProduct = function(productData) {
  this.products.push(productData)
  return this.save()
}

// Instance method to remove product
supplierSchema.methods.removeProduct = function(productId) {
  this.products.id(productId).remove()
  return this.save()
}

export default mongoose.model('Supplier', supplierSchema)