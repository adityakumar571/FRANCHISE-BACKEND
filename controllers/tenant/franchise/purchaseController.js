/* eslint-disable */
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getPurchaseInvoiceModel } from '../../../models/tenant/franchise/PurchaseInvoice.model.js';
import { getPurchaseOrderModel } from '../../../models/tenant/franchise/PurchaseOrder.model.js';
import { getGRNModel } from '../../../models/tenant/franchise/GRN.model.js';
import { getPurchaseReturnModel } from '../../../models/tenant/franchise/PurchaseReturn.model.js';
import { getMedicineModel } from '../../../models/tenant/franchise/Medicine.model.js';
import { getMedicineBatchModel } from '../../../models/tenant/franchise/MedicineBatch.model.js';
import { getSupplierModel } from '../../../models/tenant/franchise/Supplier.model.js';

// ────────────────────────────────────────────────────────────────────────────
// Seed dummy Purchase Orders and GRNs
// ────────────────────────────────────────────────────────────────────────────
const seedPurchaseData = async (db) => {
  const PurchaseOrder = getPurchaseOrderModel(db);
  const GRN = getGRNModel(db);
  const PurchaseReturn = getPurchaseReturnModel(db);
  const count = await PurchaseOrder.countDocuments();
  if (count > 0) return;

  await PurchaseOrder.insertMany([
    { poNo: 'PO-2401', supplier: 'Medico Agencies',    items: [{ medicineName: 'Dolo 650 Tablet', qty: 100, ptr: 17, amount: 1700 }, { medicineName: 'Calpol 650 Tablet', qty: 80, ptr: 16, amount: 1280 }],  totalAmount: 24500, status: 'pending',    expectedDate: new Date(Date.now() + 3 * 86400000), createdAt: new Date(Date.now() - 1 * 86400000) },
    { poNo: 'PO-2400', supplier: 'PharmaDist Pvt Ltd', items: [{ medicineName: 'Azithral 500 Tablet', qty: 50, ptr: 45, amount: 2250 }, { medicineName: 'Augmentin 625', qty: 40, ptr: 68, amount: 2720 }],    totalAmount: 18200, status: 'accepted',   expectedDate: new Date(Date.now() + 2 * 86400000), createdAt: new Date(Date.now() - 2 * 86400000) },
    { poNo: 'PO-2399', supplier: 'SunPharma Dist',     items: [{ medicineName: 'Pantop DSR Capsule', qty: 60, ptr: 42, amount: 2520 }, { medicineName: 'Pan-D Tablet', qty: 40, ptr: 35, amount: 1400 }],       totalAmount: 9000,  status: 'dispatched', expectedDate: new Date(Date.now() + 1 * 86400000), createdAt: new Date(Date.now() - 3 * 86400000) },
    { poNo: 'PO-2398', supplier: 'Medico Agencies',    items: [{ medicineName: 'Metformin 500mg', qty: 200, ptr: 8, amount: 1600 }, { medicineName: 'Atorvastatin 10mg', qty: 150, ptr: 15, amount: 2250 }],    totalAmount: 42000, status: 'completed',  expectedDate: new Date(Date.now() - 2 * 86400000), createdAt: new Date(Date.now() - 5 * 86400000) },
    { poNo: 'PO-2397', supplier: 'Apex Distributors',  items: [{ medicineName: 'Omeprazole 20mg', qty: 100, ptr: 12, amount: 1200 }],                                                                             totalAmount: 5600,  status: 'cancelled',  expectedDate: new Date(Date.now() - 4 * 86400000), createdAt: new Date(Date.now() - 8 * 86400000) },
  ]);

  await GRN.insertMany([
    { grnNo: 'GRN-1050', poRef: 'PO-2399', supplier: 'SunPharma Dist',  invoiceNo: 'SP-INV-4421', invoiceDate: new Date(Date.now() - 1 * 86400000), items: [{ medicineName: 'Pantop DSR Capsule', batchNo: 'B240030', expiryDate: new Date(Date.now() + 365 * 86400000), qty: 60, ptr: 42, amount: 2520, rackLabel: 'A-1' }, { medicineName: 'Pan-D Tablet', batchNo: 'B240031', expiryDate: new Date(Date.now() + 300 * 86400000), qty: 40, ptr: 35, amount: 1400, rackLabel: 'A-2' }], totalAmt: 3920, status: 'completed' },
    { grnNo: 'GRN-1049', poRef: 'PO-2398', supplier: 'Medico Agencies', invoiceNo: 'MA-INV-8812', invoiceDate: new Date(Date.now() - 3 * 86400000), items: [{ medicineName: 'Metformin 500mg', batchNo: 'B240032', expiryDate: new Date(Date.now() + 400 * 86400000), qty: 200, ptr: 8, amount: 1600, rackLabel: 'C-1' }, { medicineName: 'Atorvastatin 10mg', batchNo: 'B240033', expiryDate: new Date(Date.now() + 380 * 86400000), qty: 150, ptr: 15, amount: 2250, rackLabel: 'C-2' }], totalAmt: 3850, status: 'completed' },
  ]);

  await PurchaseReturn.insertMany([
    { returnNo: 'PR-101', supplier: 'Medico Agencies', grnRef: 'GRN-1049', items: [{ medicineName: 'Metformin 500mg', batchNo: 'B240032', qty: 10, reason: 'damaged', amount: 80 }, { medicineName: 'Atorvastatin 10mg', batchNo: 'B240033', qty: 5, reason: 'near_expiry', amount: 75 }], totalAmt: 155, status: 'pending' },
    { returnNo: 'PR-100', supplier: 'PharmaDist',      grnRef: 'GRN-1048', items: [{ medicineName: 'Azithral 500 Tablet', batchNo: 'B240012', qty: 3, reason: 'near_expiry', amount: 135 }],                                                                                                                                                                                            totalAmt: 135, status: 'completed' },
  ]);
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/purchase/dashboard?date=
// Purchase dashboard KPIs, chart, payment breakdown
// ────────────────────────────────────────────────────────────────────────────
export const getPurchaseDashboard = asyncHandler(async (req, res) => {
  await seedPurchaseData(req.db);
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);

  const dateParam = req.query.date;
  let start, end;
  if (dateParam) {
    start = new Date(dateParam); start.setHours(0, 0, 0, 0);
    end   = new Date(dateParam); end.setHours(23, 59, 59, 999);
  } else {
    start = new Date(); start.setHours(0, 0, 0, 0);
    end   = new Date(); end.setHours(23, 59, 59, 999);
  }

  const [kpiAgg, paymentAgg, invoices, topItems] = await Promise.all([
    PurchaseInvoice.aggregate([
      { $match: { billDate: { $gte: start, $lte: end }, status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, totalPurchase: { $sum: '$totalAmt' }, totalDiscount: { $sum: '$discountAmt' }, totalTax: { $sum: '$gstAmt' }, totalPaid: { $sum: '$paidAmt' }, count: { $sum: 1 }, items: { $sum: { $size: '$items' } } } },
    ]),
    PurchaseInvoice.aggregate([
      { $match: { billDate: { $gte: start, $lte: end }, status: { $ne: 'Cancelled' } } },
      { $group: { _id: '$paymentMode', total: { $sum: '$totalAmt' } } },
    ]),
    PurchaseInvoice.find({ billDate: { $gte: start, $lte: end }, status: { $ne: 'Cancelled' } })
      .sort({ billDate: -1 }).limit(20).lean(),
    PurchaseInvoice.aggregate([
      { $match: { billDate: { $gte: start, $lte: end } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.medicineId', name: { $first: '$items.medicineName' }, qty: { $sum: '$items.qty' }, amount: { $sum: '$items.amount' } } },
      { $sort: { qty: -1 } }, { $limit: 5 },
    ]),
  ]);

  const kpi = kpiAgg[0] || { totalPurchase: 0, totalDiscount: 0, totalTax: 0, totalPaid: 0, count: 0, items: 0 };
  const netPurchase = kpi.totalPurchase - kpi.totalDiscount + kpi.totalTax;

  const paymentMap = {};
  paymentAgg.forEach(p => { paymentMap[p._id] = p.total; });
  const totalForPie = Object.values(paymentMap).reduce((s, v) => s + v, 0) || 1;
  const paymentPie = Object.entries(paymentMap).map(([name, value]) => ({
    name,
    value,
    pct: `${((value / totalForPie) * 100).toFixed(2)}%`,
    color: { Cash: '#16a34a', UPI: '#7c3aed', Credit: '#d97706', 'Bank Transfer': '#0891b2' }[name] || '#6b7280',
  }));

  // Hourly chart - last 9 hours
  const hourlyData = [];
  for (let h = 0; h < 24; h += 3) {
    const hStart = new Date(start); hStart.setHours(h, 0, 0, 0);
    const hEnd   = new Date(start); hEnd.setHours(h + 2, 59, 59, 999);
    const hAgg = await PurchaseInvoice.aggregate([
      { $match: { billDate: { $gte: hStart, $lte: hEnd } } },
      { $group: { _id: null, total: { $sum: '$totalAmt' } } },
    ]);
    hourlyData.push({ t: `${String(h).padStart(2, '0')}:00`, v: hAgg[0]?.total || 0 });
  }

  const formattedInvoices = invoices.map(inv => ({
    _id:    inv._id,
    no:     inv.billNo,
    date:   new Date(inv.billDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    supplier: inv.supplierName,
    mode:   inv.paymentMode,
    items:  inv.items?.length || 0,
    gross:  inv.subtotal,
    disc:   inv.discountAmt,
    tax:    inv.gstAmt,
    net:    inv.totalAmt,
    status: inv.status,
  }));

  return res.status(200).json(new apiResponse(200, {
    kpi: {
      totalPurchase:  kpi.totalPurchase,
      totalItems:     kpi.items,
      totalDiscount:  kpi.totalDiscount,
      totalTax:       kpi.totalTax,
      netPurchase,
      totalPaid:      kpi.totalPaid,
      invoiceCount:   kpi.count,
    },
    paymentPie,
    hourlyData,
    invoices: formattedInvoices,
    topItems: topItems.map((t, i) => ({ rank: i + 1, name: t.name, qty: t.qty, amount: t.amount })),
    supplierSummary: {
      totalSuppliers: new Set(invoices.map(i => i.supplierName)).size,
      newSuppliers:   0,
      totalPurchase:  kpi.totalPurchase,
      totalDiscount:  kpi.totalDiscount,
      totalTax:       kpi.totalTax,
      netPurchase,
    },
  }, 'Purchase dashboard fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/purchase/invoices?date=&supplier=&payment_mode=&page=
// ────────────────────────────────────────────────────────────────────────────
export const getPurchaseInvoices = asyncHandler(async (req, res) => {
  const { date, supplier = '', payment_mode = '', page = 1, limit = 20 } = req.query;
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);

  const filter = { status: { $ne: 'Cancelled' } };
  if (date) {
    const s = new Date(date); s.setHours(0, 0, 0, 0);
    const e = new Date(date); e.setHours(23, 59, 59, 999);
    filter.billDate = { $gte: s, $lte: e };
  }
  if (supplier)      filter.supplierName = new RegExp(supplier, 'i');
  if (payment_mode)  filter.paymentMode  = payment_mode;

  const skip = (Number(page) - 1) * Number(limit);
  const [invoices, total] = await Promise.all([
    PurchaseInvoice.find(filter).sort({ billDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    PurchaseInvoice.countDocuments(filter),
  ]);

  const result = invoices.map(inv => ({
    _id:     inv._id,
    no:      inv.billNo,
    date:    new Date(inv.billDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    supplier: inv.supplierName,
    verified: false,
    mode:    inv.paymentMode,
    items:   inv.items?.length || 0,
    gross:   inv.subtotal || 0,
    disc:    inv.discountAmt || 0,
    tax:     inv.gstAmt || 0,
    net:     inv.totalAmt,
    status:  inv.status,
  }));

  return res.status(200).json(new apiResponse(200, {
    invoices: result, total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
  }, 'Purchase invoices fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/purchase/top-items?date=
// ────────────────────────────────────────────────────────────────────────────
export const getPurchaseTopItems = asyncHandler(async (req, res) => {
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);
  const dateParam = req.query.date;

  let matchFilter = {};
  if (dateParam) {
    const s = new Date(dateParam); s.setHours(0, 0, 0, 0);
    const e = new Date(dateParam); e.setHours(23, 59, 59, 999);
    matchFilter.billDate = { $gte: s, $lte: e };
  }

  const top = await PurchaseInvoice.aggregate([
    { $match: matchFilter },
    { $unwind: '$items' },
    { $group: { _id: '$items.medicineId', name: { $first: '$items.medicineName' }, qty: { $sum: '$items.qty' }, amount: { $sum: '$items.amount' } } },
    { $sort: { qty: -1 } }, { $limit: 5 },
  ]);

  return res.status(200).json(new apiResponse(200, top.map((t, i) => ({ rank: i + 1, name: t.name, qty: t.qty, amount: t.amount })), 'Top items fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/purchase-orders?search=&status=&page=
// ────────────────────────────────────────────────────────────────────────────
export const getPurchaseOrders = asyncHandler(async (req, res) => {
  await seedPurchaseData(req.db);
  const { search = '', status = '', page = 1, limit = 20 } = req.query;
  const PurchaseOrder = getPurchaseOrderModel(req.db);

  const filter = {};
  if (search) filter.$or = [{ poNo: new RegExp(search, 'i') }, { supplier: new RegExp(search, 'i') }];
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total] = await Promise.all([
    PurchaseOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    PurchaseOrder.countDocuments(filter),
  ]);

  const result = orders.map(o => ({
    _id:          o._id,
    poNo:         o.poNo,
    supplier:     o.supplier,
    items:        o.items?.length || 0,
    totalAmount:  o.totalAmount,
    status:       o.status,
    createdAt:    new Date(o.createdAt).toISOString().split('T')[0],
    expectedDate: o.expectedDate ? new Date(o.expectedDate).toISOString().split('T')[0] : '—',
  }));

  return res.status(200).json(new apiResponse(200, {
    orders: result, total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
  }, 'Purchase orders fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/purchase-orders
// ────────────────────────────────────────────────────────────────────────────
export const createPurchaseOrder = asyncHandler(async (req, res) => {
  const { supplierId, supplier, items, expectedDate, notes } = req.body;
  if (!supplier || !items?.length) return res.status(400).json(new apiResponse(400, null, 'Supplier and items are required'));

  const PurchaseOrder = getPurchaseOrderModel(req.db);
  const count = await PurchaseOrder.countDocuments();
  const poNo  = `PO-${String(count + 2402).padStart(4, '0')}`;
  const totalAmount = items.reduce((s, i) => s + (i.amount || 0), 0);

  const po = await PurchaseOrder.create({ poNo, supplierId, supplier, items, totalAmount, expectedDate, notes, status: 'pending' });
  return res.status(201).json(new apiResponse(201, { _id: po._id, poNo: po.poNo }, 'Purchase order created'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/purchase-orders/:id
// ────────────────────────────────────────────────────────────────────────────
export const getPurchaseOrderById = asyncHandler(async (req, res) => {
  const PurchaseOrder = getPurchaseOrderModel(req.db);
  const po = await PurchaseOrder.findById(req.params.id).lean();
  if (!po) return res.status(404).json(new apiResponse(404, null, 'Purchase order not found'));
  return res.status(200).json(new apiResponse(200, po, 'Purchase order fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/franchise/purchase-orders/:id/status
// ────────────────────────────────────────────────────────────────────────────
export const updatePurchaseOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const PurchaseOrder = getPurchaseOrderModel(req.db);
  const po = await PurchaseOrder.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!po) return res.status(404).json(new apiResponse(404, null, 'Purchase order not found'));
  return res.status(200).json(new apiResponse(200, { _id: po._id, status: po.status }, 'Status updated'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/grn?page=
// ────────────────────────────────────────────────────────────────────────────
export const getGRNList = asyncHandler(async (req, res) => {
  await seedPurchaseData(req.db);
  const { page = 1, limit = 20 } = req.query;
  const GRN = getGRNModel(req.db);

  const skip = (Number(page) - 1) * Number(limit);
  const [grns, total] = await Promise.all([
    GRN.find().sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    GRN.countDocuments(),
  ]);

  const result = grns.map(g => ({
    _id:     g._id,
    grnNo:   g.grnNo,
    poRef:   g.poRef,
    supplier: g.supplier,
    items:   g.items?.length || 0,
    status:  g.status,
    date:    new Date(g.createdAt).toISOString().split('T')[0],
  }));

  return res.status(200).json(new apiResponse(200, {
    grns: result, total,
    totalPages: Math.ceil(total / Number(limit)),
  }, 'GRNs fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/grn  — Create GRN + update stock
// ────────────────────────────────────────────────────────────────────────────
export const createGRN = asyncHandler(async (req, res) => {
  const { supplierId, supplier, poRef, invoiceNo, invoiceDate, items } = req.body;
  if (!supplier || !items?.length) return res.status(400).json(new apiResponse(400, null, 'Supplier and items required'));

  const GRN      = getGRNModel(req.db);
  const Medicine = getMedicineModel(req.db);
  const MedicineBatch = getMedicineBatchModel(req.db);

  const count   = await GRN.countDocuments();
  const grnNo   = `GRN-${String(count + 1051).padStart(4, '0')}`;
  const totalAmt = items.reduce((s, i) => s + (i.qty * i.ptr || 0), 0);

  const grn = await GRN.create({
    grnNo, supplierId, supplier, poRef, invoiceNo,
    invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
    items, totalAmt, status: 'completed',
  });

  // Update medicine stock and create batches
  for (const item of items) {
    if (item.medicineName) {
      const med = await Medicine.findOneAndUpdate(
        { name: new RegExp(item.medicineName, 'i'), isActive: true },
        { $inc: { currentStock: Number(item.qty) + Number(item.freeQty || 0) } },
        { new: true }
      );
      if (med && item.batchNo) {
        await MedicineBatch.create({
          medicineId:    med._id,
          batchNo:       item.batchNo,
          expiryDate:    item.expiry ? new Date(`${item.expiry}-01`) : new Date(Date.now() + 365 * 86400000),
          qty:           Number(item.qty) + Number(item.freeQty || 0),
          purchasePrice: Number(item.ptr) || 0,
          mrp:           Number(item.mrp) || 0,
          supplierId,
          grnId:         grn._id,
          rackLabel:     item.rack || item.rackLabel || '',
          isActive:      true,
        });
      }
    }
  }

  return res.status(201).json(new apiResponse(201, { _id: grn._id, grnNo: grn.grnNo }, 'GRN created and stock updated'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/grn/:id
// ────────────────────────────────────────────────────────────────────────────
export const getGRNById = asyncHandler(async (req, res) => {
  const GRN = getGRNModel(req.db);
  const grn = await GRN.findById(req.params.id).lean();
  if (!grn) return res.status(404).json(new apiResponse(404, null, 'GRN not found'));
  return res.status(200).json(new apiResponse(200, grn, 'GRN fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/purchase-returns?page=
// ────────────────────────────────────────────────────────────────────────────
export const getPurchaseReturns = asyncHandler(async (req, res) => {
  await seedPurchaseData(req.db);
  const { page = 1, limit = 20 } = req.query;
  const PurchaseReturn = getPurchaseReturnModel(req.db);

  const skip = (Number(page) - 1) * Number(limit);
  const [returns, total] = await Promise.all([
    PurchaseReturn.find().sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    PurchaseReturn.countDocuments(),
  ]);

  const result = returns.map(r => ({
    _id:      r._id,
    returnNo: r.returnNo,
    grnRef:   r.grnRef,
    supplier: r.supplier,
    reason:   r.items?.[0]?.reason || '—',
    items:    r.items?.length || 0,
    status:   r.status,
    date:     new Date(r.createdAt).toISOString().split('T')[0],
  }));

  return res.status(200).json(new apiResponse(200, {
    returns: result, total,
    totalPages: Math.ceil(total / Number(limit)),
  }, 'Purchase returns fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/purchase-returns
// ────────────────────────────────────────────────────────────────────────────
export const createPurchaseReturn = asyncHandler(async (req, res) => {
  const { supplierId, supplier, grnRef, items, notes } = req.body;
  if (!supplier || !items?.length) return res.status(400).json(new apiResponse(400, null, 'Supplier and items required'));

  const PurchaseReturn = getPurchaseReturnModel(req.db);
  const Medicine       = getMedicineModel(req.db);

  const count    = await PurchaseReturn.countDocuments();
  const returnNo = `PR-${String(count + 102).padStart(3, '0')}`;
  const totalAmt = items.reduce((s, i) => s + (Number(i.qty) * 0), 0);

  const ret = await PurchaseReturn.create({
    returnNo, supplierId, supplier, grnRef, items,
    totalAmt, status: 'pending', notes,
  });

  // Deduct returned stock
  for (const item of items) {
    if (item.medicineName) {
      await Medicine.findOneAndUpdate(
        { name: new RegExp(item.medicineName, 'i'), isActive: true },
        { $inc: { currentStock: -Number(item.qty) } }
      );
    }
  }

  return res.status(201).json(new apiResponse(201, { _id: ret._id, returnNo: ret.returnNo }, 'Purchase return submitted'));
});
