/* eslint-disable */
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getMedicineModel } from '../../../models/tenant/franchise/Medicine.model.js';
import { getMedicineBatchModel } from '../../../models/tenant/franchise/MedicineBatch.model.js';
import { getRackModel } from '../../../models/tenant/franchise/Rack.model.js';

// ── GET /api/franchise/medicines?search=&category=&formulation=&company=&status=&page=&limit=&withLocation=
export const getMedicines = asyncHandler(async (req, res) => {
  // Defensive check for req.db
  if (!req.db) {
    console.error('❌ req.db is undefined in getMedicines');
    return res.status(500).json(new apiResponse(500, null, 'Database connection not initialized'));
  }

  const { search = '', category = '', formulation = '', company = '', status = '', page = 1, limit = 20, withLocation = false, rackId = '' } = req.query;
  const Medicine = getMedicineModel(req.db);

  const filter = { isActive: status !== 'Inactive' ? (status === 'Active' ? true : undefined) : false };
  if (filter.isActive === undefined) delete filter.isActive;
  if (search)      filter.$or = [{ name: new RegExp(search, 'i') }, { salt: new RegExp(search, 'i') }, { genericName: new RegExp(search, 'i') }];
  if (category)    filter.category   = new RegExp(category, 'i');
  if (formulation) filter.formulation= new RegExp(formulation, 'i');
  if (company)     filter.company    = new RegExp(company, 'i');
  if (rackId)      filter['rackLocation.rackId'] = rackId;
  if (status === 'Low Stock') {
    delete filter.isActive;
    filter.isActive = true;
    filter.$expr = { $lte: ['$currentStock', '$reorderLevel'] };
    filter.currentStock = { $gt: 0 };
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [meds, total, categories, formulations, companies] = await Promise.all([
    Medicine.find(filter).skip(skip).limit(Number(limit)).lean(),
    Medicine.countDocuments(filter),
    Medicine.distinct('category'),
    Medicine.distinct('formulation'),
    Medicine.distinct('company'),
  ]);

  const totalMeds    = await Medicine.countDocuments({});
  const activeMeds   = await Medicine.countDocuments({ isActive: true });
  const inactiveMeds = await Medicine.countDocuments({ isActive: false });
  const lowStock     = await Medicine.countDocuments({ $expr: { $lte: ['$currentStock', '$reorderLevel'] }, currentStock: { $gt: 0 }, isActive: true });

  const result = meds.map(m => ({
    _id:         m._id,
    name:        m.name,
    salt:        m.salt,
    genericName: m.genericName,
    strength:    m.strength,
    formulation: m.formulation,
    category:    m.category,
    company:     m.company,
    packSize:    m.packSize,
    mrp:         m.mrp,
    purchasePrice: m.purchasePrice,
    gstPercent:  m.gstPercent,
    currentStock: m.currentStock,
    reorderLevel: m.reorderLevel,
    rackLabel:   m.rackLocation?.position || m.rackLocation?.rackId || '—',
    rackLocation: m.rackLocation, // Always include for consistency
    barcode:     m.barcode,
    isActive:    m.isActive,
    imageUrl:    m.imageUrl, // ← Primary image for display
    images:      m.images, // ← All images array
    stock:       m.currentStock,
    status:      m.currentStock <= 0 ? 'Out of Stock' : m.currentStock <= m.reorderLevel ? 'Low Stock' : 'In Stock',
    batches:     withLocation === 'true' ? m.batches : undefined, // Include batches if requested
  }));

  return res.status(200).json(new apiResponse(200, {
    medicines: result, total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
    kpi:         { totalMeds, activeMeds, inactiveMeds, lowStock },
    categories:  ['All Categories', ...categories.filter(Boolean)],
    formulations:['All Formulations', ...formulations.filter(Boolean)],
    companies:   ['All Companies',    ...companies.filter(Boolean)],
  }, 'Medicines fetched'));
});

// ── POST /api/franchise/medicines
export const createMedicine = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  
  // Validate required fields
  if (!req.body.name || !req.body.salt || !req.body.mrp) {
    return res.status(400).json(new apiResponse(400, null, 'Name, Salt, and MRP are required'));
  }
  
  // Validate rack location
  if (!req.body.rackLocation || !req.body.rackLocation.rackId || !req.body.rackLocation.shelf || !req.body.rackLocation.row || !req.body.rackLocation.column) {
    return res.status(400).json(new apiResponse(400, null, 'Complete rack location is required (rackId, shelf, row, column)'));
  }
  
  // Validate at least one batch
  if (!req.body.batches || req.body.batches.length === 0) {
    return res.status(400).json(new apiResponse(400, null, 'At least one batch is required'));
  }
  
  // Check if barcode already exists (if provided)
  if (req.body.barcode) {
    const existing = await Medicine.findOne({ barcode: req.body.barcode });
    if (existing) {
      return res.status(400).json(new apiResponse(400, null, 'Barcode already exists'));
    }
  }
  
  // Auto-generate position if not provided
  if (req.body.rackLocation && !req.body.rackLocation.position) {
    const { rackId, shelf, row, column } = req.body.rackLocation;
    req.body.rackLocation.position = `${rackId}-${shelf}-${row}-${column}`;
  }
  
  // Create medicine with batches
  const med = await Medicine.create({
    ...req.body,
    isBatchTracked: true,
    createdBy: req.user?._id
  });
  
  console.log('✅ Medicine created:', med.name, 'at', med.rackLocation?.position);
  
  return res.status(201).json(new apiResponse(201, {
    _id: med._id,
    name: med.name,
    rackLocation: med.rackLocation,
    currentStock: med.currentStock,
    batches: med.batches
  }, 'Medicine created successfully with rack location'));
});

// ── PUT /api/franchise/medicines/:id
export const updateMedicine = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Medicine not found'));
  return res.status(200).json(new apiResponse(200, med, 'Medicine updated'));
});

// ── GET /api/franchise/medicines/:id
export const getMedicineById = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id).lean();
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Medicine not found'));
  return res.status(200).json(new apiResponse(200, med, 'Medicine fetched'));
});

// ── PATCH /api/franchise/medicines/:id/status
export const toggleMedicineStatus = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id);
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  med.isActive = !med.isActive;
  await med.save();
  return res.status(200).json(new apiResponse(200, { isActive: med.isActive }, `Medicine ${med.isActive ? 'activated' : 'deactivated'}`));
});

// ── GET /api/franchise/medicines/:id/batches
export const getMedicineBatches = asyncHandler(async (req, res) => {
  const MedicineBatch = getMedicineBatchModel(req.db);
  const batches = await MedicineBatch.find({ medicineId: req.params.id, isActive: true }).sort({ expiryDate: 1 }).lean();
  const now = new Date();
  const result = batches.map(b => ({
    _id:          b._id,
    batchNo:      b.batchNo,
    expiryDate:   new Date(b.expiryDate).toLocaleDateString('en-IN'),
    qty:          b.qty,
    purchasePrice:b.purchasePrice,
    mrp:          b.mrp,
    rackLabel:    b.rackLabel,
    daysLeft:     Math.ceil((new Date(b.expiryDate) - now) / 86400000),
  }));
  return res.status(200).json(new apiResponse(200, result, 'Batches fetched'));
});

// ── GET /api/franchise/medicines/:id/alternatives
export const getAlternatives = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id).lean();
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  const alts = await Medicine.find({ salt: med.salt, _id: { $ne: med._id }, isActive: true }).limit(10).lean();
  return res.status(200).json(new apiResponse(200, alts, 'Alternatives fetched'));
});

// ── GET /api/franchise/medicines/:id/barcode
export const getMedicineBarcode = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id).lean();
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  return res.status(200).json(new apiResponse(200, {
    barcode: med.barcode || `MED${String(med._id).slice(-8).toUpperCase()}`,
    name:    med.name, mrp: med.mrp, packSize: med.packSize,
  }, 'Barcode data fetched'));
});

// ── GET /api/franchise/generic-mapping?salt=
export const getGenericMapping = asyncHandler(async (req, res) => {
  const { salt = '' } = req.query;
  const Medicine = getMedicineModel(req.db);
  const meds = await Medicine.find({ salt: new RegExp(salt, 'i'), isActive: true }).lean();
  const salts = [...new Set(meds.map(m => m.salt).filter(Boolean))];
  return res.status(200).json(new apiResponse(200, {
    salt: salt || 'All',
    medicines: meds.map(m => ({ _id: m._id, name: m.name, salt: m.salt, company: m.company, mrp: m.mrp })),
    uniqueSalts: salts,
  }, 'Generic mapping fetched'));
});

// ── GET /api/franchise/rack-management
export const getRackManagement = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const Rack     = getRackModel(req.db);
  const racks    = await Rack.find({ isActive: true }).lean();
  const result   = await Promise.all(racks.map(async (rack) => {
    // Fixed: Use rackLocation.rackId instead of rackLabel (which doesn't exist)
    const meds = await Medicine.find({ 'rackLocation.rackId': rack.code, isActive: true }).lean();
    return { ...rack, medicines: meds.map(m => ({ _id: m._id, name: m.name, stock: m.currentStock })) };
  }));
  return res.status(200).json(new apiResponse(200, result, 'Rack management fetched'));
});

// ── PUT /api/franchise/rack-management/:rackId — assign medicine to rack
export const assignMedicineRack = asyncHandler(async (req, res) => {
  const { medicineId, rackLocation } = req.body;
  const Medicine = getMedicineModel(req.db);
  
  // Validate rackLocation structure
  if (!rackLocation || !rackLocation.rackId) {
    return res.status(400).json(new apiResponse(400, null, 'Valid rackLocation object required'));
  }
  
  // Update medicine with rackLocation object (not rackLabel string)
  await Medicine.findByIdAndUpdate(medicineId, { rackLocation });
  return res.status(200).json(new apiResponse(200, { medicineId, rackLocation }, 'Rack assigned'));
});

// ── GET /api/franchise/medicines/meta
// Return distinct categories, formulations, companies for dropdowns
export const getMedicineMeta = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const [categories, formulations, companies] = await Promise.all([
    Medicine.distinct('category'),
    Medicine.distinct('formulation'),
    Medicine.distinct('company'),
  ]);
  return res.status(200).json(new apiResponse(200, {
    categories:   categories.filter(Boolean).sort(),
    formulations: formulations.filter(Boolean).sort(),
    companies:    companies.filter(Boolean).sort(),
  }, 'Meta fetched'));
});

// ── GET /api/franchise/medicines/:id/generic
export const getMedicineGenericMapping = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id).lean();
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  // Find all medicines with same salt/genericName
  const generics = await Medicine.find({
    $or: [
      { salt: med.salt, salt: { $exists: true, $ne: '' } },
      { genericName: med.genericName, genericName: { $exists: true, $ne: '' } },
    ],
    _id: { $ne: med._id },
    isActive: true,
  }).select('name company mrp formulation salt genericName currentStock').lean();
  return res.status(200).json(new apiResponse(200, { medicine: med, generics }, 'Generic mapping fetched'));
});

// ── DELETE /api/franchise/medicines/:id/generic/:brandId
// Not applicable as generics are computed — return success
export const deleteGenericMapping = asyncHandler(async (req, res) => {
  return res.status(200).json(new apiResponse(200, null, 'Generic mapping removed'));
});

// ── DELETE /api/franchise/medicines/:id/alternatives/:altId
export const deleteAlternative = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id);
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  // Remove altId from alternatives array if it exists
  if (Array.isArray(med.alternatives)) {
    med.alternatives = med.alternatives.filter(a => String(a) !== req.params.altId);
    await med.save();
  }
  return res.status(200).json(new apiResponse(200, null, 'Alternative removed'));
});

// ── GET /api/franchise/medicines/:id/images
export const getMedicineImages = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id).select('images').lean();
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  return res.status(200).json(new apiResponse(200, { images: med.images || [] }, 'Images fetched'));
});

// ── POST /api/franchise/medicines/:id/images  (multipart)
export const uploadMedicineImage = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id);
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Medicine not found'));
  
  // If URL is provided directly (already uploaded)
  if (req.body.url) {
    if (!Array.isArray(med.images)) med.images = [];
    const img = { 
      url: req.body.url, 
      role: req.body.role || 'primary',
      isPrimary: med.images.length === 0, 
      createdAt: new Date() 
    };
    med.images.push(img);
    await med.save();
    return res.status(201).json(new apiResponse(201, img, 'Image added'));
  }
  
  // Expect multer file upload
  if (!req.file) {
    return res.status(400).json(new apiResponse(400, null, 'Image file required'));
  }

  // Store file path - will integrate Cloudinary next
  const imageUrl = `/uploads/medicines/${req.file.filename}`;
  
  if (!Array.isArray(med.images)) med.images = [];
  
  // Push only URL string (schema expects [String])
  med.images.push(imageUrl);
  
  // Set as primary image if it's the first one
  if (!med.imageUrl) {
    med.imageUrl = imageUrl;
  }
  
  await med.save();
  
  // Return metadata for frontend
  const responseData = {
    url: imageUrl,
    isPrimary: med.imageUrl === imageUrl,
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    createdAt: new Date()
  };
  
  return res.status(201).json(new apiResponse(201, responseData, 'Image uploaded successfully'));
});

// ── DELETE /api/franchise/medicines/:id/images/:imageId
export const deleteMedicineImage = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id);
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  
  if (Array.isArray(med.images)) {
    // imageId is the URL or index
    const imageUrl = decodeURIComponent(req.params.imageId);
    const initialLength = med.images.length;
    med.images = med.images.filter(img => img !== imageUrl);
    
    // If primary image was deleted, set new primary
    if (med.imageUrl === imageUrl && med.images.length > 0) {
      med.imageUrl = med.images[0];
    }
    
    await med.save();
    
    if (med.images.length < initialLength) {
      return res.status(200).json(new apiResponse(200, null, 'Image deleted'));
    }
  }
  return res.status(404).json(new apiResponse(404, null, 'Image not found'));
});

// ── POST /api/franchise/medicines/:id/images/:imageId/set-primary
export const setPrimaryMedicineImage = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id);
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  
  const imageUrl = decodeURIComponent(req.params.imageId);
  
  // Check if image exists in array
  if (Array.isArray(med.images) && med.images.includes(imageUrl)) {
    med.imageUrl = imageUrl; // Set as primary
    await med.save();
    return res.status(200).json(new apiResponse(200, { primaryImage: imageUrl }, 'Primary image set'));
  }
  
  return res.status(404).json(new apiResponse(404, null, 'Image not found'));
});


// ══════════════════════════════════════════════════════════════════════════════
// NEW ENDPOINTS - Rack Location & Batch Management
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/franchise/medicines/racks/:rackId
// Get all medicines in a specific rack
export const getMedicinesByRack = asyncHandler(async (req, res) => {
  const { rackId } = req.params;
  const { shelf, row, column } = req.query;
  const Medicine = getMedicineModel(req.db);
  
  const filter = { 
    'rackLocation.rackId': rackId,
    isActive: true 
  };
  
  if (shelf) filter['rackLocation.shelf'] = parseInt(shelf);
  if (row) filter['rackLocation.row'] = row;
  if (column) filter['rackLocation.column'] = parseInt(column);
  
  const medicines = await Medicine.find(filter)
    .sort({ 'rackLocation.shelf': 1, 'rackLocation.row': 1, 'rackLocation.column': 1 })
    .lean();
  
  return res.status(200).json(new apiResponse(200, {
    rackId,
    count: medicines.length,
    medicines: medicines.map(m => ({
      _id: m._id,
      name: m.name,
      salt: m.salt,
      stock: m.currentStock,
      position: m.rackLocation?.position,
      shelf: m.rackLocation?.shelf,
      row: m.rackLocation?.row,
      column: m.rackLocation?.column,
      mrp: m.mrp,
      category: m.category
    }))
  }, 'Medicines in rack fetched'));
});

// ── GET /api/franchise/medicines/search-by-location?position=
// Search medicine by exact position
export const searchByLocation = asyncHandler(async (req, res) => {
  const { position } = req.query;
  const Medicine = getMedicineModel(req.db);
  
  if (!position) {
    return res.status(400).json(new apiResponse(400, null, 'Position query parameter is required'));
  }
  
  const medicines = await Medicine.find({ 
    'rackLocation.position': position,
    isActive: true 
  }).lean();
  
  return res.status(200).json(new apiResponse(200, {
    position,
    count: medicines.length,
    medicines
  }, medicines.length > 0 ? 'Medicines found at position' : 'No medicines at this position'));
});

// ── PUT /api/franchise/medicines/:id/location
// Update medicine rack location
export const updateMedicineLocation = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const { rackId, shelf, row, column } = req.body;
  
  if (!rackId || !shelf || !row || !column) {
    return res.status(400).json(new apiResponse(400, null, 'Complete location required: rackId, shelf, row, column'));
  }
  
  const position = `${rackId}-${shelf}-${row}-${column}`;
  
  const med = await Medicine.findByIdAndUpdate(
    req.params.id,
    {
      rackLocation: {
        rackId,
        shelf: parseInt(shelf),
        row,
        column: parseInt(column),
        position
      },
      updatedBy: req.user?._id
    },
    { new: true, runValidators: true }
  );
  
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Medicine not found'));
  
  console.log('📍 Medicine location updated:', med.name, 'to', position);
  
  return res.status(200).json(new apiResponse(200, {
    _id: med._id,
    name: med.name,
    rackLocation: med.rackLocation
  }, 'Medicine location updated'));
});

// ── POST /api/franchise/medicines/:id/batch
// Add a new batch to existing medicine
export const addBatchToMedicine = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const { batchNo, mfgDate, expiryDate, quantity, mrp, purchasePrice, supplierName } = req.body;
  
  if (!batchNo || !expiryDate || !quantity) {
    return res.status(400).json(new apiResponse(400, null, 'Batch number, expiry date, and quantity are required'));
  }
  
  const med = await Medicine.findById(req.params.id);
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Medicine not found'));
  
  // Check if batch already exists
  const batchExists = med.batches.some(b => b.batchNo === batchNo);
  if (batchExists) {
    return res.status(400).json(new apiResponse(400, null, 'Batch number already exists for this medicine'));
  }
  
  // Add new batch
  med.batches.push({
    batchNo,
    mfgDate: mfgDate || undefined,
    expiryDate,
    quantity: parseInt(quantity),
    availableQty: parseInt(quantity),
    mrp: parseFloat(mrp) || med.mrp,
    purchasePrice: parseFloat(purchasePrice) || med.purchasePrice,
    supplierName: supplierName || '',
    isActive: true
  });
  
  await med.save();
  
  console.log('📦 Batch added to', med.name, '- Batch:', batchNo, 'Qty:', quantity);
  
  return res.status(200).json(new apiResponse(200, {
    _id: med._id,
    name: med.name,
    currentStock: med.currentStock,
    batches: med.batches
  }, 'Batch added successfully'));
});

// ── GET /api/franchise/medicines/expiring-soon?days=60
// Get medicines with batches expiring within specified days
export const getExpiringSoon = asyncHandler(async (req, res) => {
  const { days = 60 } = req.query;
  const Medicine = getMedicineModel(req.db);
  
  const expiryThreshold = new Date();
  expiryThreshold.setDate(expiryThreshold.getDate() + parseInt(days));
  const today = new Date();
  
  const medicines = await Medicine.find({
    isActive: true,
    'batches.isActive': true,
    'batches.availableQty': { $gt: 0 },
    'batches.expiryDate': { 
      $gte: today,
      $lte: expiryThreshold 
    }
  }).lean();
  
  const result = [];
  medicines.forEach(med => {
    med.batches.forEach(batch => {
      if (batch.isActive && batch.availableQty > 0) {
        const expDate = new Date(batch.expiryDate);
        if (expDate >= today && expDate <= expiryThreshold) {
          const daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
          result.push({
            medicineId: med._id,
            medicineName: med.name,
            salt: med.salt,
            batchNo: batch.batchNo,
            expiryDate: batch.expiryDate,
            daysLeft,
            quantity: batch.availableQty,
            rackLocation: med.rackLocation?.position,
            category: med.category
          });
        }
      }
    });
  });
  
  // Sort by days left (ascending)
  result.sort((a, b) => a.daysLeft - b.daysLeft);
  
  return res.status(200).json(new apiResponse(200, {
    count: result.length,
    expiringMedicines: result
  }, `Found ${result.length} batches expiring within ${days} days`));
});

// ── GET /api/franchise/medicines/expired
// Get medicines with expired batches
export const getExpiredMedicines = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const today = new Date();
  
  const medicines = await Medicine.find({
    isActive: true,
    'batches.isActive': true,
    'batches.expiryDate': { $lt: today }
  }).lean();
  
  const result = [];
  medicines.forEach(med => {
    med.batches.forEach(batch => {
      if (batch.isActive && new Date(batch.expiryDate) < today) {
        const daysExpired = Math.ceil((today - new Date(batch.expiryDate)) / (1000 * 60 * 60 * 24));
        result.push({
          medicineId: med._id,
          medicineName: med.name,
          salt: med.salt,
          batchNo: batch.batchNo,
          expiryDate: batch.expiryDate,
          daysExpired,
          quantity: batch.availableQty,
          rackLocation: med.rackLocation?.position,
          value: batch.availableQty * batch.purchasePrice
        });
      }
    });
  });
  
  const totalValue = result.reduce((sum, item) => sum + item.value, 0);
  
  return res.status(200).json(new apiResponse(200, {
    count: result.length,
    totalValue,
    expiredMedicines: result
  }, `Found ${result.length} expired batches`));
});

// ── POST /api/franchise/medicines/barcode/generate
// Generate unique barcode
export const generateBarcode = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  
  let barcode;
  let exists = true;
  let attempts = 0;
  
  while (exists && attempts < 10) {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    barcode = `MED${timestamp}${random}`;
    
    exists = await Medicine.findOne({ barcode });
    attempts++;
  }
  
  if (exists) {
    return res.status(500).json(new apiResponse(500, null, 'Could not generate unique barcode'));
  }
  
  return res.status(200).json(new apiResponse(200, { barcode }, 'Barcode generated'));
});

// ── GET /api/franchise/medicines/rack-summary
// Get summary of all racks with medicine count
export const getRackSummary = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  
  const summary = await Medicine.aggregate([
    {
      $match: { isActive: true, 'rackLocation.rackId': { $exists: true, $ne: null } }
    },
    {
      $group: {
        _id: '$rackLocation.rackId',
        medicineCount: { $sum: 1 },
        totalStock: { $sum: '$currentStock' },
        totalValue: { $sum: { $multiply: ['$currentStock', '$mrp'] } }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
  
  return res.status(200).json(new apiResponse(200, {
    racks: summary.map(s => ({
      rackId: s._id,
      medicineCount: s.medicineCount,
      totalStock: s.totalStock,
      totalValue: Math.round(s.totalValue)
    }))
  }, 'Rack summary fetched'));
});
