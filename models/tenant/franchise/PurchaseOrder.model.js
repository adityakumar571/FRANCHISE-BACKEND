import mongoose from 'mongoose';

const POItemSchema = new mongoose.Schema({
  medicineId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName: { type: String, trim: true },
  orderedQty:   { type: Number, default: 1 },        // ← Quantity ordered
  receivedQty:  { type: Number, default: 0 },        // ← Quantity received (from GRNs)
  rejectedQty:  { type: Number, default: 0 },        // ← Quantity rejected (from GRNs)
  pendingQty:   { type: Number, default: 0 },        // ← Calculated: orderedQty - receivedQty - rejectedQty
  ptr:          { type: Number, default: 0 },
  mrp:          { type: Number, default: 0 },
  scheme:       { type: String, trim: true },
  amount:       { type: Number, default: 0 },
}, { _id: false });

const PurchaseOrderSchema = new mongoose.Schema({
  poNo:         { type: String, required: true, unique: true, trim: true },
  supplierId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplier:     { type: String, trim: true },
  items:        [POItemSchema],
  
  // Totals
  totalAmount:  { type: Number, default: 0 },
  totalMRP:     { type: Number, default: 0 },
  discountAmt:  { type: Number, default: 0 },
  gstAmt:       { type: Number, default: 0 },
  grandTotal:   { type: Number, default: 0 },
  
  // Tracking metrics
  totalOrderedQty:   { type: Number, default: 0 },
  totalReceivedQty:  { type: Number, default: 0 },
  totalRejectedQty:  { type: Number, default: 0 },
  completionPct:     { type: Number, default: 0 },   // % received (0-100)
  
  // Status flow for partial deliveries
  status:       { 
    type: String, 
    enum: [
      'draft',
      'pending',
      'partially_received',     // ← 1+ GRN created but not 100%
      'received',               // ← All items received
      'backordered',            // ← 30+ days no update
      'partially_closed',       // ← Manually closed with pending
      'completed',
      'cancelled',
      'accepted',
      'dispatched',
      'Pending',
      'Confirmed',
      'Packed',
      'In Transit',
      'Out for Delivery',
      'Delivered',
      'Cancelled'
    ],
    default: 'pending'
  },
  
  // GRN tracking
  grns:         [{ type: mongoose.Schema.Types.ObjectId, ref: 'GRN' }],  // All GRNs for this PO
  
  // Dates
  orderDate:    { type: Date, default: Date.now },
  expectedDate: { type: Date },
  firstGRNDate: { type: Date },                       // When first GRN received
  lastGRNDate:  { type: Date },                       // When last GRN received
  
  // Backorder tracking
  backorderStatus: { type: String, enum: ['none', 'pending', 'delayed', 'cancelled'], default: 'none' },
  backorderNote:   { type: String, trim: true },     // "Awaiting 95 items from Apollo"
  backorderExpectedDate: { type: Date },             // When supplier says baaki items aayega
  daysWithoutGRN:  { type: Number, default: 0 },    // Alert if > 30 days
  
  notes:        { type: String, trim: true },
  source:       { type: String, enum: ['purchase_module', 'live_rates_module'], default: 'purchase_module', index: true },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const getPurchaseOrderModel = (connection) => {
  try { return connection.model('PurchaseOrder'); }
  catch { return connection.model('PurchaseOrder', PurchaseOrderSchema); }
};
