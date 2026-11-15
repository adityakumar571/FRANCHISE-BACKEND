import mongoose from 'mongoose';

/**
 * RackConfig Model
 * Stores default counter/rack configuration for a franchise
 * Used to auto-assign medicines during GRN entry
 */

const CounterConfigSchema = new mongoose.Schema({
  counterId:      { type: String, trim: true, required: true },  // 'Counter-1', 'Counter-2'
  counterName:    { type: String, trim: true },                  // 'Main Counter', 'Billing Counter'
  
  // Default rack for this counter
  defaultRackId:  { type: String, trim: true },                 // 'RACK-A', 'RACK-B'
  
  // Physical dimensions (for validation)
  shelfCount:     { type: Number, default: 10 },
  rowCount:       { type: Number, default: 5 },  // A-E
  colCount:       { type: Number, default: 20 }, // 1-20
  
  // Auto-assign strategy
  autoAssignStrategy: { 
    type: String, 
    enum: ['round-robin', 'fill-first-rack', 'category-based'], 
    default: 'round-robin' 
  },
  
  // Priority categories (for category-based strategy)
  priorityCategories: [{ type: String }], // e.g., ['Antibiotics', 'Pain Relief']
  
  // Fill indicator (for round-robin)
  nextShelf:      { type: Number, default: 1 },
  nextRow:        { type: String, default: 'A' },
  nextColumn:     { type: Number, default: 1 },
  
  isActive:       { type: Boolean, default: true },
  notes:          { type: String, trim: true },
}, { _id: false });

const RackConfigSchema = new mongoose.Schema({
  franchiseId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  
  // Counters
  counters:       [CounterConfigSchema],
  
  // Default auto-assignment settings
  enableAutoAssign:       { type: Boolean, default: true },
  autoAssignStrategy:     { 
    type: String, 
    enum: ['round-robin', 'fill-first-rack', 'category-based', 'manual-only'], 
    default: 'round-robin' 
  },
  
  // Fallback counter (if no specific counter defined)
  defaultCounterId:   { type: String, trim: true },
  defaultRackId:      { type: String, trim: true },
  
  // Layout dimensions
  totalCounters:      { type: Number, default: 1 },
  racksPerCounter:    { type: Number, default: 5 },
  shelvesPerRack:     { type: Number, default: 10 },
  rowsPerShelf:       { type: Number, default: 5 },
  columnsPerRow:      { type: Number, default: 20 },
  
  // Capacity & tracking
  totalSlots:         { type: Number, default: 2500 },      // 5 racks × 10 shelves × 5 rows × 20 cols
  usedSlots:          { type: Number, default: 0 },
  occupancyPct:       { type: Number, default: 0 },
  
  // Layout reference  (for 3D visualization data)
  layout3DConfigId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Layout3DConfig' },
  
  // QR codes / Scanning
  enableQRCodes:      { type: Boolean, default: true },
  qrTemplate:         { type: String, trim: true },  // "{{counter}}-{{rack}}-{{shelf}}-{{row}}-{{col}}"
  
  // Metadata
  lastUpdatedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
}, { timestamps: true });

export const getRackConfigModel = (connection) => {
  try { return connection.model('RackConfig'); }
  catch { return connection.model('RackConfig', RackConfigSchema); }
};
