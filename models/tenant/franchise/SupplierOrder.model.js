import mongoose from 'mongoose';

const supplierOrderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    franchiseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Franchise',
      required: true,
    },
    franchiseName: {
      type: String,
      required: true,
    },
    franchiseCode: {
      type: String,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
    },
    supplierName: {
      type: String,
      required: true,
    },
    supplierCode: {
      type: String,
    },
    products: [
      {
        productId: {
          type: String,
        },
        productName: {
          type: String,
          required: true,
        },
        productCode: {
          type: String,
        },
        category: {
          type: String, // Medicine, Dummy, Equipment, etc.
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        unit: {
          type: String,
          default: 'pcs',
        },
        pricePerUnit: {
          type: Number,
          required: true,
          min: 0,
        },
        totalPrice: {
          type: Number,
          required: true,
          min: 0,
        },
        discount: {
          type: Number,
          default: 0,
          min: 0,
        },
        tax: {
          type: Number,
          default: 0,
          min: 0,
        },
      },
    ],
    orderType: {
      type: String,
      enum: ['Medicine', 'Dummy', 'Equipment', 'Mixed'],
      default: 'Medicine',
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'dispatched', 'delivered', 'cancelled', 'rejected'],
      default: 'pending',
    },
    statusHistory: [
      {
        status: {
          type: String,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        updatedBy: {
          type: String,
        },
        remarks: {
          type: String,
        },
      },
    ],
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    tax: {
      type: Number,
      default: 0,
      min: 0,
    },
    shippingCharges: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'partial', 'refunded'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'upi', 'bank_transfer', 'credit'],
      default: 'pending',
    },
    deliveryAddress: {
      address: String,
      city: String,
      state: String,
      pincode: String,
      contactPerson: String,
      contactNumber: String,
    },
    expectedDeliveryDate: {
      type: Date,
    },
    actualDeliveryDate: {
      type: Date,
    },
    dispatchDate: {
      type: Date,
    },
    trackingNumber: {
      type: String,
    },
    courierName: {
      type: String,
    },
    notes: {
      type: String,
    },
    supplierRemarks: {
      type: String,
    },
    cancellationReason: {
      type: String,
    },
    createdBy: {
      type: String,
    },
    updatedBy: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Generate unique order ID
supplierOrderSchema.pre('save', async function (next) {
  if (!this.orderId) {
    const count = await this.constructor.countDocuments();
    this.orderId = `SO${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Add status to history before updating
supplierOrderSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
      updatedBy: this.updatedBy || 'System',
    });
  }
  next();
});

export const getSupplierOrderModel = (db) => {
  // Check if model already exists in the connection
  if (db.models['SupplierOrder']) {
    return db.models['SupplierOrder'];
  }
  // Create and return the model
  return db.model('SupplierOrder', supplierOrderSchema);
};

export default getSupplierOrderModel;
