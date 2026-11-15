import mongoose from 'mongoose';

const GRNItemSchema = new mongoose.Schema({
  medicineId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName:    { type: String, trim: true },
  
  // From PO (read-only display)
  poOrderedQty:    { type: Number },                 // What was ordered in PO
  
  // GRN specific (what we actually received)
  grnReceivedQty:  { type: Number, required: true }, // What we received
  grnRejectedQty:  { type: Number, default: 0 },    // What we rejected (damaged/wrong)
  
  batchNo:         { type: String, required: true, trim: true }, // MANDATORY
  expiryDate:      { type: Date, required: true },               // MANDATORY
  
  // Quality control
  qcStatus:        { type: String, enum: ['passed', 'rejected', 'partial'], default: 'passed' },
  qcReason:        { type: String, trim: true },    // "Damaged", "Expired", "Wrong item"
  
  ptr:             { type: Number, default: 0 },
  mrp:             { type: Number, default: 0 },
  rackLabel:       { type: String, trim: true },
  amount:          { type: Number, default: 0 },
}, { _id: false });

const GRNSchema = new mongoose.Schema({
  grnNo:           { type: String, required: true, unique: true, trim: true },
  
  // PO Linking (CRITICAL)
  poId:            { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },  // Link to PO
  poRef:           { type: String, trim: true },                                     // PO number for display
  
  supplierId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplier:        { type: String, trim: true },
  
  items:           [GRNItemSchema],
  
  // Invoice info
  invoiceNo:       { type: String, trim: true },
  invoiceDate:     { type: Date },
  invoiceAmount:   { type: Number },
  
  // GRN tracking
  status:          { type: String, enum: ['draft', 'verified', 'completed', 'rejected', 'partial'], default: 'draft' },
  receivedDate:    { type: Date, default: Date.now },
  grnSequence:     { type: Number },                // 1st GRN, 2nd GRN, etc. for same PO
  
  totalAmount:     { type: Number, default: 0 },
  notes:           { type: String, trim: true },
  
  createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const getGRNModel = (connection) => {
  try { return connection.model('GRN'); }
  catch { return connection.model('GRN', GRNSchema); }
};
