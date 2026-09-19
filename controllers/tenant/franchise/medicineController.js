/* eslint-disable */
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getMedicineModel } from '../../../models/tenant/franchise/Medicine.model.js';
import { getMedicineBatchModel } from '../../../models/tenant/franchise/MedicineBatch.model.js';
import { getRackModel } from '../../../models/tenant/franchise/Rack.model.js';

// ── GET /api/franchise/medicines?search=&category=&formulation=&company=&status=&page=&limit=
export const getMedicines = asyncHandler(async (req, res) => {
  const { search = '', category = '', formulation = '', company = '', status = '', page = 1, limit = 20 } = req.query;
  const Medicine = getMedicineModel(req.db);

  const filter = { isActive: status !== 'Inactive' ? (status === 'Active' ? true : undefined) : false };
  if (filter.isActive === undefined) delete filter.isActive;
  if (search)      filter.$or = [{ name: new RegExp(search, 'i') }, { salt: new RegExp(search, 'i') }, { genericName: new RegExp(search, 'i') }];
  if (category)    filter.category   = new RegExp(category, 'i');
  if (formulation) filter.formulation= new RegExp(formulation, 'i');
  if (company)     filter.company    = new RegExp(company, 'i');
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
    rackLabel:   m.rackLabel,
    barcode:     m.barcode,
    isActive:    m.isActive,
    stock:       m.currentStock,
    status:      m.currentStock <= 0 ? 'Out of Stock' : m.currentStock <= m.reorderLevel ? 'Low Stock' : 'In Stock',
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
  const med = await Medicine.create(req.body);
  return res.status(201).json(new apiResponse(201, med, 'Medicine created'));
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
    const meds = await Medicine.find({ rackLabel: rack.code, isActive: true }).lean();
    return { ...rack, medicines: meds.map(m => ({ _id: m._id, name: m.name, stock: m.currentStock })) };
  }));
  return res.status(200).json(new apiResponse(200, result, 'Rack management fetched'));
});

// ── PUT /api/franchise/rack-management/:rackId — assign medicine to rack
export const assignMedicineRack = asyncHandler(async (req, res) => {
  const { medicineId, rackLabel } = req.body;
  const Medicine = getMedicineModel(req.db);
  await Medicine.findByIdAndUpdate(medicineId, { rackLabel });
  return res.status(200).json(new apiResponse(200, { medicineId, rackLabel }, 'Rack assigned'));
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
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  // Expect { url } in body (after Cloudinary upload) or file via multer
  const url = req.body.url || req.file?.path;
  if (!url) return res.status(400).json(new apiResponse(400, null, 'Image URL or file required'));
  if (!Array.isArray(med.images)) med.images = [];
  const img = { url, isPrimary: med.images.length === 0, createdAt: new Date() };
  med.images.push(img);
  await med.save();
  return res.status(201).json(new apiResponse(201, img, 'Image uploaded'));
});

// ── DELETE /api/franchise/medicines/:id/images/:imageId
export const deleteMedicineImage = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id);
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  if (Array.isArray(med.images)) {
    med.images = med.images.filter(img => String(img._id) !== req.params.imageId);
    await med.save();
  }
  return res.status(200).json(new apiResponse(200, null, 'Image deleted'));
});

// ── POST /api/franchise/medicines/:id/images/:imageId/set-primary
export const setPrimaryMedicineImage = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id);
  if (!med) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  if (Array.isArray(med.images)) {
    med.images.forEach(img => {
      img.isPrimary = String(img._id) === req.params.imageId;
    });
    await med.save();
  }
  return res.status(200).json(new apiResponse(200, null, 'Primary image set'));
});
