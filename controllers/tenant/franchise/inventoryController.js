/* eslint-disable */
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getMedicineModel } from '../../../models/tenant/franchise/Medicine.model.js';
import { getMedicineBatchModel } from '../../../models/tenant/franchise/MedicineBatch.model.js';
import { getSaleInvoiceModel } from '../../../models/tenant/franchise/SaleInvoice.model.js';
import { getStockAdjustmentModel } from '../../../models/tenant/franchise/StockAdjustment.model.js';
import { getRackModel } from '../../../models/tenant/franchise/Rack.model.js';
import { getInventoryAuditModel } from '../../../models/tenant/franchise/InventoryAudit.model.js';

// ── Seed racks ────────────────────────────────────────────────────────────────
const seedRacks = async (db) => {
  const Rack = getRackModel(db);
  if (await Rack.countDocuments() > 0) return;
  await Rack.insertMany([
    { code: 'A01', area: 'Main Store',  shelf: 'Shelf 1', description: 'Analgesics & Antipyretics', capacity: 20 },
    { code: 'A02', area: 'Main Store',  shelf: 'Shelf 2', description: 'Antibiotics',                capacity: 15 },
    { code: 'B01', area: 'Main Store',  shelf: 'Shelf 3', description: 'Cardiac & BP',              capacity: 12 },
    { code: 'B02', area: 'Main Store',  shelf: 'Shelf 3', description: 'Antidiabetics',             capacity: 15 },
    { code: 'C01', area: 'Back Store',  shelf: 'Shelf 1', description: 'Cold & Cough',              capacity: 20 },
    { code: 'D01', area: 'Back Store',  shelf: 'Shelf 2', description: 'Vitamins & Supplements',    capacity: 25 },
    { code: 'REF', area: 'Refrigerator',shelf: 'Fridge',  description: 'Cold Storage - Insulin/Vaccines', capacity: 8 },
  ]);
};

const seedAdjustments = async (db) => {
  const SA = getStockAdjustmentModel(db);
  if (await SA.countDocuments() > 0) return;
  const Medicine = getMedicineModel(db);
  const meds = await Medicine.find().limit(3).lean();
  await SA.insertMany([
    { adjNo: 'ADJ-301', medicine: meds[0]?.name || 'Azithromycin 500mg', batch: 'AZT0012', type: 'expired',    qty: -60, reason: 'Expired stock quarantine',      status: 'completed', by: 'Rahul Kumar' },
    { adjNo: 'ADJ-300', medicine: meds[1]?.name || 'Paracetamol 650mg',  batch: 'CR08023', type: 'damaged',    qty: -10, reason: 'Packaging damage',             status: 'pending',   by: 'Amit Singh'  },
    { adjNo: 'ADJ-299', medicine: meds[2]?.name || 'Metformin 500mg',    batch: 'MF2388',  type: 'correction', qty: +5,  reason: 'Physical count correction',     status: 'completed', by: 'Priya Sharma' },
  ]);
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/inventory/dashboard
// ────────────────────────────────────────────────────────────────────────────
export const getInventoryDashboard = asyncHandler(async (req, res) => {
  await seedRacks(req.db);
  const Medicine = getMedicineModel(req.db);
  const MedicineBatch = getMedicineBatchModel(req.db);

  const now = new Date();
  const in30  = new Date(now.getTime() + 30  * 86400000);
  const in60  = new Date(now.getTime() + 60  * 86400000);
  const in90  = new Date(now.getTime() + 90  * 86400000);

  const [allMeds, nearExpiryBatches, expiredBatches, topValueMeds, categoryAgg] = await Promise.all([
    Medicine.find({ isActive: true }).lean(),
    MedicineBatch.find({ expiryDate: { $gte: now, $lte: in90 }, qty: { $gt: 0 }, isActive: true })
      .populate('medicineId', 'name').sort({ expiryDate: 1 }).limit(5).lean(),
    MedicineBatch.find({ expiryDate: { $lt: now }, qty: { $gt: 0 }, isActive: true }).countDocuments(),
    Medicine.find({ isActive: true }).sort({ currentStock: -1 }).limit(5).lean(),
    Medicine.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$formulation', count: { $sum: 1 }, totalValue: { $sum: { $multiply: ['$currentStock', '$purchasePrice'] } } } },
      { $sort: { totalValue: -1 } }, { $limit: 5 },
    ]),
  ]);

  const totalItems    = allMeds.length;
  const lowStock      = allMeds.filter(m => m.currentStock > 0 && m.currentStock <= m.reorderLevel).length;
  const outOfStock    = allMeds.filter(m => m.currentStock <= 0).length;
  const nearExpiry    = nearExpiryBatches.length;
  const totalValue    = allMeds.reduce((s, m) => s + (m.currentStock * m.purchasePrice), 0);
  const inStock       = allMeds.filter(m => m.currentStock > m.reorderLevel).length;

  const nearExpiryResult = nearExpiryBatches.map(b => {
    const daysLeft = Math.ceil((new Date(b.expiryDate) - now) / 86400000);
    return {
      name:    b.medicineId?.name || 'Unknown',
      expiry:  new Date(b.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      days:    daysLeft,
      qty:     b.qty,
      urgent:  daysLeft <= 30,
    };
  });

  const lowStockResult = allMeds
    .filter(m => m.currentStock > 0 && m.currentStock <= m.reorderLevel)
    .slice(0, 5)
    .map(m => ({ name: m.name, stock: m.currentStock, rackLabel: m.rackLabel }));

  const topItemsResult = topValueMeds.map((m, i) => ({
    rank: i + 1,
    name: m.name,
    value: `₹${(m.currentStock * m.purchasePrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    loc: m.rackLabel || '—',
  }));

  const catTotal = categoryAgg.reduce((s, c) => s + c.totalValue, 0) || 1;
  const categoryData = categoryAgg.map(c => ({
    name:  c._id || 'Other',
    value: `₹${c.totalValue.toLocaleString('en-IN')}`,
    pct:   +((c.totalValue / catTotal) * 100).toFixed(1),
    color: ['#0c3b73', '#7c3aed', '#d97706', '#16a34a', '#9ca3af'][categoryAgg.indexOf(c) % 5],
  }));

  return res.status(200).json(new apiResponse(200, {
    kpi: { totalItems, lowStock, outOfStock, nearExpiry, totalValue, inStock, expiredBatches },
    donut: {
      inStock:    { count: inStock,    pct: +((inStock    / totalItems) * 100).toFixed(1) },
      lowStock:   { count: lowStock,   pct: +((lowStock   / totalItems) * 100).toFixed(1) },
      outOfStock: { count: outOfStock, pct: +((outOfStock / totalItems) * 100).toFixed(1) },
      nearExpiry: { count: nearExpiry, pct: +((nearExpiry / totalItems) * 100).toFixed(1) },
      expired:    { count: expiredBatches, pct: +((expiredBatches / totalItems) * 100).toFixed(1) },
    },
    nearExpiry:  nearExpiryResult,
    lowStockList: lowStockResult,
    topItems:    topItemsResult,
    categoryData,
  }, 'Inventory dashboard fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/inventory/stock?search=&status=&page=&limit=
// ────────────────────────────────────────────────────────────────────────────
export const getStockList = asyncHandler(async (req, res) => {
  const { search = '', status = '', page = 1, limit = 20 } = req.query;
  const Medicine = getMedicineModel(req.db);
  const MedicineBatch = getMedicineBatchModel(req.db);

  const filter = { isActive: true };
  if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { barcode: new RegExp(search, 'i') }];

  // Status filter
  if (status === 'In Stock')     filter.$expr = { $gt: ['$currentStock', '$reorderLevel'] };
  if (status === 'Low Stock')    filter.$and = [{ $expr: { $lte: ['$currentStock', '$reorderLevel'] } }, { currentStock: { $gt: 0 } }];
  if (status === 'Out of Stock') filter.currentStock = 0;

  const skip = (Number(page) - 1) * Number(limit);
  const [medicines, total] = await Promise.all([
    Medicine.find(filter).skip(skip).limit(Number(limit)).lean(),
    Medicine.countDocuments(filter),
  ]);

  const now = new Date();
  const in90 = new Date(now.getTime() + 90 * 86400000);

  const result = await Promise.all(medicines.map(async (m) => {
    const batch = await MedicineBatch.findOne({ medicineId: m._id, qty: { $gt: 0 }, isActive: true }).sort({ expiryDate: 1 }).lean();
    let itemStatus = 'In Stock';
    if (m.currentStock <= 0) itemStatus = 'Out of Stock';
    else if (m.currentStock <= m.reorderLevel) itemStatus = 'Low Stock';
    else if (batch && new Date(batch.expiryDate) <= in90) itemStatus = 'Near Expiry';

    if (status === 'Near Expiry' && itemStatus !== 'Near Expiry') return null;

    return {
      id:             m._id,
      code:           `MED${String(m._id).slice(-3).toUpperCase()}`,
      name:           m.name,
      batch:          batch?.batchNo || '—',
      expiry:         batch?.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
      qty:            m.currentStock,
      mrp:            `₹${Number(m.mrp).toFixed(2)}`,
      purchasePrice:  `₹${Number(m.purchasePrice).toFixed(2)}`,
      stockValue:     `₹${(m.currentStock * m.purchasePrice).toLocaleString('en-IN')}`,
      location:       m.rackLabel || '—',
      status:         itemStatus,
    };
  }));

  const filtered = result.filter(Boolean);

  return res.status(200).json(new apiResponse(200, {
    stock: filtered, total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
  }, 'Stock list fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/inventory/near-expiry?days=90&page=
// ────────────────────────────────────────────────────────────────────────────
export const getNearExpiry = asyncHandler(async (req, res) => {
  const { days = 90, status = 'All', page = 1, limit = 20 } = req.query;
  const MedicineBatch = getMedicineBatchModel(req.db);

  const now    = new Date();
  const cutoff = new Date(now.getTime() + Number(days) * 86400000);

  const filter = { expiryDate: { $gte: now, $lte: cutoff }, qty: { $gt: 0 }, isActive: true };
  const skip = (Number(page) - 1) * Number(limit);

  const [batches, total] = await Promise.all([
    MedicineBatch.find(filter).populate('medicineId', 'name mrp rackLabel').sort({ expiryDate: 1 }).skip(skip).limit(Number(limit)).lean(),
    MedicineBatch.countDocuments(filter),
  ]);

  const result = batches.map(b => {
    const daysLeft  = Math.ceil((new Date(b.expiryDate) - now) / 86400000);
    const itemStatus = daysLeft <= 30 ? 'Critical' : 'Warning';
    const value      = b.qty * (b.mrp || b.purchasePrice || 0);

    return {
      _id:    b._id,
      name:   b.medicineId?.name || 'Unknown',
      batch:  b.batchNo,
      expiry: new Date(b.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      daysLeft,
      qty:    b.qty,
      mrp:    b.mrp || 0,
      value,
      status: itemStatus,
    };
  }).filter(r => status === 'All' || r.status === status);

  const critical = result.filter(r => r.daysLeft <= 30).length;

  return res.status(200).json(new apiResponse(200, {
    items: result,
    total, totalPages: Math.ceil(total / Number(limit)), currentPage: Number(page),
    summary: {
      total:     total,
      qty:       batches.reduce((s, b) => s + b.qty, 0),
      value:     batches.reduce((s, b) => s + (b.qty * (b.mrp || b.purchasePrice || 0)), 0),
      critical,
    },
  }, 'Near expiry items fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/inventory/expired
// ────────────────────────────────────────────────────────────────────────────
export const getExpiredStock = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const MedicineBatch = getMedicineBatchModel(req.db);

  const now  = new Date();
  const skip = (Number(page) - 1) * Number(limit);
  const [batches, total] = await Promise.all([
    MedicineBatch.find({ expiryDate: { $lt: now }, qty: { $gt: 0 }, isActive: true })
      .populate('medicineId', 'name mrp').sort({ expiryDate: 1 }).skip(skip).limit(Number(limit)).lean(),
    MedicineBatch.countDocuments({ expiryDate: { $lt: now }, qty: { $gt: 0 }, isActive: true }),
  ]);

  const result = batches.map(b => ({
    _id:       b._id,
    name:      b.medicineId?.name || 'Unknown',
    batch:     b.batchNo,
    expiry:    new Date(b.expiryDate).toLocaleDateString('en-IN'),
    daysExpired: Math.ceil((now - new Date(b.expiryDate)) / 86400000),
    qty:       b.qty,
    value:     b.qty * (b.mrp || 0),
  }));

  return res.status(200).json(new apiResponse(200, {
    items: result, total, totalPages: Math.ceil(total / Number(limit)),
  }, 'Expired stock fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/inventory/damaged  (from stock adjustments)
// ────────────────────────────────────────────────────────────────────────────
export const getDamagedStock = asyncHandler(async (req, res) => {
  await seedAdjustments(req.db);
  const SA = getStockAdjustmentModel(req.db);
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    SA.find({ type: { $in: ['damaged'] }, status: 'completed' }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    SA.countDocuments({ type: { $in: ['damaged'] }, status: 'completed' }),
  ]);

  const result = items.map(i => ({
    _id:     i._id,
    adjNo:   i.adjNo,
    medicine: i.medicine,
    batch:   i.batch,
    qty:     Math.abs(i.qty),
    reason:  i.reason,
    date:    new Date(i.createdAt).toLocaleDateString('en-IN'),
    by:      i.by,
  }));

  return res.status(200).json(new apiResponse(200, { items: result, total }, 'Damaged stock fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/inventory/dead-stock
// ────────────────────────────────────────────────────────────────────────────
export const getDeadStock = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  // Dead stock = medicines with 0 stock or below reorder with no recent movement
  const [items, total] = await Promise.all([
    Medicine.find({ currentStock: { $lte: 0 }, isActive: true }).skip(skip).limit(Number(limit)).lean(),
    Medicine.countDocuments({ currentStock: { $lte: 0 }, isActive: true }),
  ]);

  const result = items.map(m => ({
    _id:     m._id,
    name:    m.name,
    category: m.category,
    currentStock: m.currentStock,
    mrp:     m.mrp,
    value:   0,
    status:  'Dead Stock',
  }));

  return res.status(200).json(new apiResponse(200, { items: result, total }, 'Dead stock fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/inventory/fast-moving?period=month
// ────────────────────────────────────────────────────────────────────────────
export const getFastMoving = asyncHandler(async (req, res) => {
  const { period = 'month', page = 1, limit = 20 } = req.query;
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const now = new Date();
  const periodStart = new Date(now);
  if (period === 'week')  periodStart.setDate(now.getDate() - 7);
  if (period === 'month') periodStart.setMonth(now.getMonth() - 1);
  if (period === 'year')  periodStart.setFullYear(now.getFullYear() - 1);

  const top = await SaleInvoice.aggregate([
    { $match: { invoiceDate: { $gte: periodStart }, status: { $ne: 'Cancelled' } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.medicineId', name: { $first: '$items.medicineName' }, totalQty: { $sum: '$items.qty' }, totalSales: { $sum: '$items.amount' } } },
    { $sort: { totalQty: -1 } },
    { $skip: (Number(page) - 1) * Number(limit) },
    { $limit: Number(limit) },
  ]);

  return res.status(200).json(new apiResponse(200, {
    items: top.map((t, i) => ({ rank: i + 1, medicineId: t._id, name: t.name, qty: t.totalQty, sales: `₹${t.totalSales.toLocaleString('en-IN')}`, status: 'Fast Moving' })),
  }, 'Fast moving items fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/inventory/slow-moving?period=month
// ────────────────────────────────────────────────────────────────────────────
export const getSlowMoving = asyncHandler(async (req, res) => {
  const { period = 'month', page = 1, limit = 20 } = req.query;
  const Medicine    = getMedicineModel(req.db);
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const now = new Date();
  const periodStart = new Date(now);
  if (period === 'month') periodStart.setMonth(now.getMonth() - 1);

  const soldIds = await SaleInvoice.aggregate([
    { $match: { invoiceDate: { $gte: periodStart } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.medicineId' } },
  ]);
  const soldSet = new Set(soldIds.map(s => s._id?.toString()));

  const allMeds = await Medicine.find({ isActive: true, currentStock: { $gt: 0 } }).lean();
  const slowMeds = allMeds.filter(m => !soldSet.has(m._id.toString()));

  const skip = (Number(page) - 1) * Number(limit);
  const result = slowMeds.slice(skip, skip + Number(limit)).map((m, i) => ({
    rank: skip + i + 1,
    medicineId: m._id,
    name: m.name,
    currentStock: m.currentStock,
    stockValue: `₹${(m.currentStock * m.purchasePrice).toLocaleString('en-IN')}`,
    status: 'Slow Moving',
  }));

  return res.status(200).json(new apiResponse(200, {
    items: result, total: slowMeds.length,
  }, 'Slow moving items fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/inventory/ledger?medicineId=&page=
// ────────────────────────────────────────────────────────────────────────────
export const getStockLedger = asyncHandler(async (req, res) => {
  const { medicineId, page = 1, limit = 20 } = req.query;
  const SaleInvoice    = getSaleInvoiceModel(req.db);
  const Medicine       = getMedicineModel(req.db);
  const MedicineBatch  = getMedicineBatchModel(req.db);

  let medFilter = {};
  if (medicineId) medFilter._id = medicineId;

  const medicines = await Medicine.find(medFilter).limit(5).lean();
  const result = [];

  for (const med of medicines) {
    // Sales entries
    const sales = await SaleInvoice.find({ 'items.medicineId': med._id, status: { $ne: 'Cancelled' } })
      .sort({ invoiceDate: -1 }).limit(10).lean();

    for (const s of sales) {
      const item = s.items.find(i => i.medicineId?.toString() === med._id.toString());
      if (item) {
        result.push({
          date:    new Date(s.invoiceDate).toLocaleDateString('en-IN'),
          type:    'Sale',
          voucher: s.invoiceNo,
          qty:     -item.qty,
          balance: med.currentStock,
          remark:  s.customerName,
        });
      }
    }

    // GRN entries
    const batches = await MedicineBatch.find({ medicineId: med._id }).sort({ createdAt: -1 }).limit(5).lean();
    for (const b of batches) {
      result.push({
        date:    new Date(b.createdAt).toLocaleDateString('en-IN'),
        type:    'GRN',
        voucher: `Batch-${b.batchNo}`,
        qty:     +b.qty,
        balance: med.currentStock,
        remark:  `Batch ${b.batchNo}`,
      });
    }
  }

  result.sort((a, b) => new Date(b.date) - new Date(a.date));
  const skip   = (Number(page) - 1) * Number(limit);
  const paged  = result.slice(skip, skip + Number(limit));

  return res.status(200).json(new apiResponse(200, {
    entries: paged,
    total:   result.length,
    totalPages: Math.ceil(result.length / Number(limit)),
    medicine: medicines[0]?.name || 'All Medicines',
  }, 'Stock ledger fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/inventory/batch-expiry?page=
// ────────────────────────────────────────────────────────────────────────────
export const getBatchExpiry = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search = '' } = req.query;
  const MedicineBatch = getMedicineBatchModel(req.db);

  const filter = { isActive: true };
  const skip = (Number(page) - 1) * Number(limit);
  const now = new Date();

  const [batches, total] = await Promise.all([
    MedicineBatch.find(filter).populate('medicineId', 'name mrp').sort({ expiryDate: 1 }).skip(skip).limit(Number(limit)).lean(),
    MedicineBatch.countDocuments(filter),
  ]);

  const result = batches.map(b => {
    const daysLeft = Math.ceil((new Date(b.expiryDate) - now) / 86400000);
    return {
      _id:     b._id,
      medicine: b.medicineId?.name || 'Unknown',
      batch:   b.batchNo,
      mfgDate: b.mfgDate ? new Date(b.mfgDate).toLocaleDateString('en-IN') : '—',
      expiry:  new Date(b.expiryDate).toLocaleDateString('en-IN'),
      daysLeft,
      qty:     b.qty,
      mrp:     b.mrp,
      rackLabel: b.rackLabel || '—',
      status:  daysLeft < 0 ? 'Expired' : daysLeft <= 30 ? 'Critical' : daysLeft <= 90 ? 'Warning' : 'Safe',
    };
  });

  return res.status(200).json(new apiResponse(200, {
    batches: result, total,
    totalPages: Math.ceil(total / Number(limit)),
  }, 'Batch expiry data fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/inventory/rack  + POST /api/franchise/inventory/rack
// ────────────────────────────────────────────────────────────────────────────
export const getRacks = asyncHandler(async (req, res) => {
  await seedRacks(req.db);
  const Rack        = getRackModel(req.db);
  const Medicine    = getMedicineModel(req.db);
  const MedicineBatch = getMedicineBatchModel(req.db);

  const { search = '' } = req.query;
  const filter = { isActive: true };
  if (search) filter.$or = [{ code: new RegExp(search, 'i') }, { area: new RegExp(search, 'i') }, { description: new RegExp(search, 'i') }];

  const racks = await Rack.find(filter).lean();

  const result = await Promise.all(racks.map(async (rack) => {
    const items = await Medicine.countDocuments({ rackLabel: rack.code, isActive: true });
    const pct   = rack.capacity > 0 ? Math.round((items / rack.capacity) * 100) : 0;
    return { ...rack, items, pct };
  }));

  return res.status(200).json(new apiResponse(200, result, 'Racks fetched'));
});

export const createRack = asyncHandler(async (req, res) => {
  const { code, area, shelf, description, capacity } = req.body;
  if (!code) return res.status(400).json(new apiResponse(400, null, 'Rack code required'));

  const Rack = getRackModel(req.db);
  const rack = await Rack.create({ code: code.toUpperCase(), area, shelf, description, capacity: Number(capacity) || 20 });
  return res.status(201).json(new apiResponse(201, rack, 'Rack created'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET + POST /api/franchise/inventory/adjustments
// ────────────────────────────────────────────────────────────────────────────
export const getStockAdjustments = asyncHandler(async (req, res) => {
  await seedAdjustments(req.db);
  const { page = 1, limit = 20 } = req.query;
  const SA   = getStockAdjustmentModel(req.db);
  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    SA.find().sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    SA.countDocuments(),
  ]);

  const result = items.map(i => ({
    _id:     i._id,
    adjNo:   i.adjNo,
    date:    new Date(i.createdAt).toISOString().split('T')[0],
    medicine: i.medicine,
    type:    i.type,
    qty:     i.qty,
    reason:  i.reason,
    status:  i.status,
    by:      i.by,
  }));

  return res.status(200).json(new apiResponse(200, {
    adjustments: result, total,
    totalPages: Math.ceil(total / Number(limit)),
  }, 'Adjustments fetched'));
});

export const createStockAdjustment = asyncHandler(async (req, res) => {
  const { medicine, batch, type, qty, reason } = req.body;
  if (!medicine || !qty || !reason) return res.status(400).json(new apiResponse(400, null, 'Medicine, qty and reason required'));

  const SA       = getStockAdjustmentModel(req.db);
  const Medicine = getMedicineModel(req.db);

  const count  = await SA.countDocuments();
  const adjNo  = `ADJ-${String(count + 302).padStart(3, '0')}`;

  const adj = await SA.create({ adjNo, medicine, batch, type, qty: Number(qty), reason, status: 'pending', by: 'Admin' });

  return res.status(201).json(new apiResponse(201, { _id: adj._id, adjNo: adj.adjNo }, 'Adjustment submitted for approval'));
});

export const approveStockAdjustment = asyncHandler(async (req, res) => {
  const SA       = getStockAdjustmentModel(req.db);
  const Medicine = getMedicineModel(req.db);

  const adj = await SA.findByIdAndUpdate(req.params.id, { status: 'completed', approvedBy: 'Admin' }, { new: true });
  if (!adj) return res.status(404).json(new apiResponse(404, null, 'Adjustment not found'));

  // Apply the stock change
  if (adj.medicine) {
    await Medicine.findOneAndUpdate(
      { name: new RegExp(adj.medicine, 'i'), isActive: true },
      { $inc: { currentStock: Number(adj.qty) } }
    );
  }

  return res.status(200).json(new apiResponse(200, { _id: adj._id, status: adj.status }, 'Adjustment approved and stock updated'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET + POST /api/franchise/inventory/audit
// ────────────────────────────────────────────────────────────────────────────
export const getInventoryAudits = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const Audit = getInventoryAuditModel(req.db);
  const skip  = (Number(page) - 1) * Number(limit);

  // Seed dummy audit
  const count = await Audit.countDocuments();
  if (count === 0) {
    await Audit.insertMany([
      { auditNo: 'AUD-001', startedAt: new Date(Date.now() - 7 * 86400000), completedAt: new Date(Date.now() - 6 * 86400000), items: [], status: 'completed', notes: 'Monthly audit', by: 'Admin' },
      { auditNo: 'AUD-002', startedAt: new Date(Date.now() - 1 * 86400000), items: [], status: 'in_progress', notes: 'Weekly audit', by: 'Pharmacist' },
    ]);
  }

  const [audits, total] = await Promise.all([
    Audit.find().sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Audit.countDocuments(),
  ]);

  const result = audits.map(a => ({
    _id:         a._id,
    auditNo:     a.auditNo,
    startedAt:   new Date(a.startedAt).toLocaleDateString('en-IN'),
    completedAt: a.completedAt ? new Date(a.completedAt).toLocaleDateString('en-IN') : '—',
    items:       a.items?.length || 0,
    status:      a.status,
    notes:       a.notes,
    by:          a.by,
  }));

  return res.status(200).json(new apiResponse(200, {
    audits: result, total,
    totalPages: Math.ceil(total / Number(limit)),
  }, 'Audits fetched'));
});

export const createInventoryAudit = asyncHandler(async (req, res) => {
  const { notes } = req.body;
  const Audit   = getInventoryAuditModel(req.db);
  const count   = await Audit.countDocuments();
  const auditNo = `AUD-${String(count + 1).padStart(3, '0')}`;

  const audit = await Audit.create({ auditNo, notes, status: 'in_progress', by: 'Admin' });
  return res.status(201).json(new apiResponse(201, { _id: audit._id, auditNo: audit.auditNo }, 'Audit started'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET + POST /api/franchise/inventory/physical-verification
// ────────────────────────────────────────────────────────────────────────────
export const getPhysicalVerification = asyncHandler(async (req, res) => {
  const Audit = getInventoryAuditModel(req.db);
  const items = await Audit.find({ status: 'completed' }).sort({ completedAt: -1 }).limit(20).lean();

  return res.status(200).json(new apiResponse(200, items.map(a => ({
    _id:     a._id,
    auditNo: a.auditNo,
    date:    new Date(a.startedAt).toLocaleDateString('en-IN'),
    items:   a.items?.length || 0,
    status:  a.status,
    by:      a.by,
  })), 'Physical verifications fetched'));
});

export const submitPhysicalVerification = asyncHandler(async (req, res) => {
  const { items, notes } = req.body;
  const Audit = getInventoryAuditModel(req.db);
  const count = await Audit.countDocuments();
  const auditNo = `PV-${String(count + 1).padStart(3, '0')}`;

  const audit = await Audit.create({
    auditNo, items, notes, status: 'completed', completedAt: new Date(), by: 'Admin',
  });

  return res.status(201).json(new apiResponse(201, { _id: audit._id, auditNo }, 'Physical verification submitted'));
});
