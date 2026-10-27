/* eslint-disable */
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getMedicineModel } from '../../../models/tenant/franchise/Medicine.model.js';
import { getMedicineBatchModel } from '../../../models/tenant/franchise/MedicineBatch.model.js';
import { getSaleInvoiceModel } from '../../../models/tenant/franchise/SaleInvoice.model.js';
import { getPurchaseInvoiceModel } from '../../../models/tenant/franchise/PurchaseInvoice.model.js';

// ────────────────────────────────────────────────────────────────────────────
// Seed dummy data if collections are empty (development helper)
// ⚠️ DISABLED FOR PRODUCTION - Only for development/testing
// ────────────────────────────────────────────────────────────────────────────
const seedDummyData = async (db) => {
  // ❌ SEEDING DISABLED - Franchises start with empty database
  return;
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/dashboard/summary
// Returns KPI cards data for today
// ────────────────────────────────────────────────────────────────────────────
export const getDashboardSummary = asyncHandler(async (req, res) => {
  await seedDummyData(req.db);

  const SaleInvoice = getSaleInvoiceModel(req.db);
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);
  const Medicine = getMedicineModel(req.db);

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const yesterStart = new Date(todayStart.getTime() - 86400000);
  const yesterEnd   = new Date(todayEnd.getTime()   - 86400000);

  const [todaySales, yesterSales, todayPurchase, yesterPurchase, lowStockCount, totalMeds] = await Promise.all([
    SaleInvoice.aggregate([
      { $match: { invoiceDate: { $gte: todayStart, $lte: todayEnd }, status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, totalAmt: { $sum: '$totalAmt' }, count: { $sum: 1 } } },
    ]),
    SaleInvoice.aggregate([
      { $match: { invoiceDate: { $gte: yesterStart, $lte: yesterEnd }, status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, totalAmt: { $sum: '$totalAmt' } } },
    ]),
    PurchaseInvoice.aggregate([
      { $match: { billDate: { $gte: todayStart, $lte: todayEnd }, status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, totalAmt: { $sum: '$totalAmt' } } },
    ]),
    PurchaseInvoice.aggregate([
      { $match: { billDate: { $gte: yesterStart, $lte: yesterEnd }, status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, totalAmt: { $sum: '$totalAmt' } } },
    ]),
    Medicine.countDocuments({ $expr: { $lte: ['$currentStock', '$reorderLevel'] }, isActive: true }),
    Medicine.aggregate([{ $match: { isActive: true } }, { $group: { _id: null, stockValue: { $sum: { $multiply: ['$currentStock', '$purchasePrice'] } } } }]),
  ]);

  const todaySalesAmt   = todaySales[0]?.totalAmt || 0;
  const yesterSalesAmt  = yesterSales[0]?.totalAmt || 0;
  const todayOrderCount = todaySales[0]?.count || 0;
  const todayPurchaseAmt = todayPurchase[0]?.totalAmt || 0;
  const yesterPurchaseAmt = yesterPurchase[0]?.totalAmt || 0;
  const grossProfit     = todaySalesAmt - todayPurchaseAmt;
  const stockValue      = totalMeds[0]?.stockValue || 0;

  const pctChange = (curr, prev) => {
    if (!prev) return null;
    return +((((curr - prev) / prev) * 100).toFixed(1));
  };

  return res.status(200).json(new apiResponse(200, {
    todaySales:    { amount: todaySalesAmt,   change: pctChange(todaySalesAmt, yesterSalesAmt), up: todaySalesAmt >= yesterSalesAmt },
    todayPurchase: { amount: todayPurchaseAmt, change: pctChange(todayPurchaseAmt, yesterPurchaseAmt), up: null },
    grossProfit:   { amount: grossProfit,      change: null, up: grossProfit > 0 },
    totalOrders:   { count: todayOrderCount,   change: null },
    stockValue:    { amount: stockValue },
    lowStockItems: { count: lowStockCount },
  }, 'Dashboard summary fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/dashboard/live-rates?medicine=
// ⚠️ DEPRECATED: This endpoint uses TENANT-SPECIFIC suppliers (wrong!)
// ✅ USE INSTEAD: /api/franchise-suppliers/medicines/compare/:name (main supplier API)
// Returns wholesale supplier comparison (static for now — will be dynamic)
// ────────────────────────────────────────────────────────────────────────────
export const getDashboardLiveRates = asyncHandler(async (req, res) => {
  const medicine = req.query.medicine || 'Clavm 625 Tablet';
  const Medicine = getMedicineModel(req.db);
  const { getSupplierModel } = await import('../../../models/tenant/franchise/Supplier.model.js');
  const Supplier = getSupplierModel(req.db);

  const med = await Medicine.findOne({ name: new RegExp(medicine, 'i') }).lean();
  const suppliers = await Supplier.find({ isActive: true }).limit(5).lean();

  const rates = suppliers.map((s, i) => ({
    rank: i + 1,
    supplierId: s._id,
    name: s.name,
    verified: s.isVerified,
    rating: s.rating,
    basic: +(((med?.purchasePrice || 65) + i * 1.0).toFixed(2)),
    scheme: ['10+1', 'No Scheme', '5+1', '10+2', 'No Scheme'][i] || 'No Scheme',
    gst: +(((med?.gstPercent || 12) * ((med?.purchasePrice || 65) + i) / 100).toFixed(2)),
    other: 0,
    effective: +(((med?.purchasePrice || 65) + i * 1.0).toFixed(2)),
    best: i === 0,
    stock: [120, 85, 200, 60, 150][i] || 50,
    delivery: ['Same Day', 'Same Day', 'Next Day', 'Same Day', 'Next Day'][i] || 'Next Day',
  }));

  return res.status(200).json(new apiResponse(200, {
    medicine: {
      name: med?.name || medicine,
      salt: med?.salt || '',
      packSize: med?.packSize || '',
      mrp: med?.mrp || 0,
      lastPurchaseRate: med?.purchasePrice || 0,
      bestRateToday: rates[0]?.basic || 0,
      availableWholesalers: rates.length,
    },
    rates,
    updatedAt: new Date().toISOString(),
  }, 'Live rates fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/dashboard/price-trend?medicine=&days=7
// ────────────────────────────────────────────────────────────────────────────
export const getDashboardPriceTrend = asyncHandler(async (req, res) => {
  const medicine = req.query.medicine || 'Clavm 625 Tablet';
  const days = parseInt(req.query.days) || 7;
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findOne({ name: new RegExp(medicine, 'i') }).lean();
  const basePrice = med?.purchasePrice || 65;

  const trend = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    trend.push({
      date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      price: +(basePrice + (Math.random() * 4 - 2)).toFixed(2),
    });
  }

  return res.status(200).json(new apiResponse(200, {
    medicine: med?.name || medicine,
    trend,
    avgYesterday: +(basePrice + 2).toFixed(2),
    avg7Days:     +(basePrice + 1.2).toFixed(2),
    avg30Days:    +(basePrice + 3.1).toFixed(2),
    bestToday:    basePrice,
  }, 'Price trend fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/dashboard/rate-alerts
// ────────────────────────────────────────────────────────────────────────────
export const getDashboardRateAlerts = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const meds = await Medicine.find({ isActive: true }).limit(5).lean();

  const alerts = meds.map((m, i) => ({
    medicineId: m._id,
    name: m.name,
    rate: `₹${m.purchasePrice.toFixed(2)}`,
    note: [
      `Rate decreased by ₹${(Math.random() * 3 + 1).toFixed(2)}`,
      'Best rate available',
      `Rate decreased by ₹${(Math.random() * 5 + 3).toFixed(2)}`,
      'Stock low with suppliers',
      `New scheme ${['10+2', '5+1', '10+1'][i % 3]} available`,
    ][i % 5],
  }));

  return res.status(200).json(new apiResponse(200, alerts, 'Rate alerts fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/dashboard/top-moving?period=month&limit=5
// ────────────────────────────────────────────────────────────────────────────
export const getDashboardTopMoving = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const startDate = new Date();
  startDate.setDate(1); startDate.setHours(0, 0, 0, 0);

  const top = await SaleInvoice.aggregate([
    { $match: { invoiceDate: { $gte: startDate }, status: { $ne: 'Cancelled' } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.medicineId', name: { $first: '$items.medicineName' }, qty: { $sum: '$items.qty' }, sales: { $sum: '$items.amount' } } },
    { $sort: { qty: -1 } },
    { $limit: limit },
  ]);

  const result = top.map((t, i) => ({
    rank: i + 1,
    medicineId: t._id,
    name: t.name || 'Unknown',
    qty: t.qty,
    sales: `₹${t.sales.toLocaleString('en-IN')}`,
  }));

  return res.status(200).json(new apiResponse(200, result, 'Top moving items fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/dashboard/expiry-alerts?days=60
// ────────────────────────────────────────────────────────────────────────────
export const getDashboardExpiryAlerts = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 60;
  const MedicineBatch = getMedicineBatchModel(req.db);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  const batches = await MedicineBatch.find({
    expiryDate: { $lte: cutoff, $gte: new Date() },
    qty: { $gt: 0 },
    isActive: true,
  })
    .populate('medicineId', 'name')
    .sort({ expiryDate: 1 })
    .limit(10)
    .lean();

  const now = new Date();
  const result = batches.map((b) => {
    const daysLeft = Math.ceil((new Date(b.expiryDate) - now) / 86400000);
    return {
      batchId: b._id,
      name: b.medicineId?.name || 'Unknown',
      expiry: `${daysLeft} Days`,
      qty: `${b.qty} Strip`,
      urgent: daysLeft <= 30,
    };
  });

  return res.status(200).json(new apiResponse(200, result, 'Expiry alerts fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/sales/recent?limit=5
// ────────────────────────────────────────────────────────────────────────────
export const getRecentSales = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const invoices = await SaleInvoice.find({ status: { $ne: 'Cancelled' } })
    .sort({ invoiceDate: -1 })
    .limit(limit)
    .lean();

  const result = invoices.map((inv) => ({
    _id: inv._id,
    inv: inv.invoiceNo,
    customer: inv.customerName,
    amount: `₹${inv.totalAmt.toLocaleString('en-IN')}`,
    mode: inv.paymentMode,
    time: new Date(inv.invoiceDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
  }));

  return res.status(200).json(new apiResponse(200, result, 'Recent sales fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/purchase/recent?limit=5
// ────────────────────────────────────────────────────────────────────────────
export const getRecentPurchases = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);

  const invoices = await PurchaseInvoice.find({ status: { $ne: 'Cancelled' } })
    .sort({ billDate: -1 })
    .limit(limit)
    .lean();

  const result = invoices.map((inv) => ({
    _id: inv._id,
    billNo: inv.billNo,
    supplier: inv.supplierName,
    amount: `₹${inv.totalAmt.toLocaleString('en-IN')}`,
    date: new Date(inv.billDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    status: inv.status,
  }));

  return res.status(200).json(new apiResponse(200, result, 'Recent purchases fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/inventory/low-stock?limit=5
// ────────────────────────────────────────────────────────────────────────────
export const getLowStockItems = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  const Medicine = getMedicineModel(req.db);

  const items = await Medicine.find({
    $expr: { $lte: ['$currentStock', '$reorderLevel'] },
    isActive: true,
  })
    .sort({ currentStock: 1 })
    .limit(limit)
    .lean();

  const result = items.map((m) => ({
    _id: m._id,
    name: m.name,
    left: m.currentStock <= 0 ? 'Out of Stock!' : `Only ${m.currentStock} strips left${m.currentStock <= 5 ? ' — Critical' : ''}`,
    color: m.currentStock <= 5 ? '#e11d48' : '#dc2626',
    currentStock: m.currentStock,
    reorderLevel: m.reorderLevel,
  }));

  return res.status(200).json(new apiResponse(200, result, 'Low stock items fetched'));
});
