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
import Supplier from '../../../models/Supplier.model.js'; // ← GLOBAL Supplier Model (where medicines are stored)

// ────────────────────────────────────────────────────────────────────────────
// Seed Supplier Data
// ────────────────────────────────────────────────────────────────────────────
const seedSupplierData = async (db) => {
  return; // ❌ PRODUCTION: Seeding disabled - franchises add their own suppliers
  
  const Supplier = getSupplierModel(db);
  const count = await Supplier.countDocuments();
  if (count > 0) return;

  await Supplier.insertMany([
    { supplierCode: 'SUP001', supplierName: 'Medico Agencies', contactPerson: 'Rajesh Kumar', phone: '9876543210', email: 'rajesh@medicoagencies.com', address: '123, Medical Complex, Delhi - 110001', gstNo: '07AAAAA1234A1Z5', dlNo: 'DL-20-2024-00123', creditDays: 30, creditLimit: 500000, outstanding: 0, status: 'Active' },
    { supplierCode: 'SUP002', supplierName: 'PharmaDist Pvt Ltd', contactPerson: 'Amit Sharma', phone: '9876543211', email: 'amit@pharmadist.com', address: '456, Pharma Hub, Mumbai - 400001', gstNo: '27BBBBB5678B2Z6', dlNo: 'MH-22-2024-00456', creditDays: 45, creditLimit: 750000, outstanding: 0, status: 'Active' },
    { supplierCode: 'SUP003', supplierName: 'SunPharma Dist', contactPerson: 'Priya Singh', phone: '9876543212', email: 'priya@sunpharma.com', address: '789, Sun Tower, Bengaluru - 560001', gstNo: '29CCCCC9012C3Z7', dlNo: 'KA-25-2024-00789', creditDays: 30, creditLimit: 600000, outstanding: 0, status: 'Active' },
    { supplierCode: 'SUP004', supplierName: 'Apex Distributors', contactPerson: 'Vikram Reddy', phone: '9876543213', email: 'vikram@apexdist.com', address: '321, Apex Plaza, Hyderabad - 500001', gstNo: '36DDDDD3456D4Z8', dlNo: 'TS-28-2024-00321', creditDays: 60, creditLimit: 400000, outstanding: 0, status: 'Active' },
    { supplierCode: 'SUP005', supplierName: 'HealthCare Suppliers', contactPerson: 'Sneha Patel', phone: '9876543214', email: 'sneha@healthcare.com', address: '654, Health Center, Pune - 411001', gstNo: '27EEEEE6789E5Z9', dlNo: 'MH-30-2024-00654', creditDays: 30, creditLimit: 350000, outstanding: 0, status: 'Active' },
    { supplierCode: 'SUP006', supplierName: 'Cipla Distributors', contactPerson: 'Ravi Verma', phone: '9876543215', email: 'ravi@cipladist.com', address: '987, Cipla Tower, Ahmedabad - 380001', gstNo: '24FFFFF0123F6Z0', dlNo: 'GJ-32-2024-00987', creditDays: 45, creditLimit: 800000, outstanding: 0, status: 'Active' },
    { supplierCode: 'SUP007', supplierName: 'Dr Reddys Supplies', contactPerson: 'Anjali Nair', phone: '9876543216', email: 'anjali@drreddys.com', address: '147, Reddy Complex, Chennai - 600001', gstNo: '33GGGGG4567G7Z1', dlNo: 'TN-35-2024-00147', creditDays: 30, creditLimit: 550000, outstanding: 0, status: 'Active' },
    { supplierCode: 'SUP008', supplierName: 'Lupin Agencies', contactPerson: 'Karan Joshi', phone: '9876543217', email: 'karan@lupinagencies.com', address: '258, Lupin Plaza, Kolkata - 700001', gstNo: '19HHHHH7890H8Z2', dlNo: 'WB-38-2024-00258', creditDays: 60, creditLimit: 700000, outstanding: 0, status: 'Active' },
    { supplierCode: 'SUP009', supplierName: 'Torrent Pharma Dist', contactPerson: 'Neha Gupta', phone: '9876543218', email: 'neha@torrentdist.com', address: '369, Torrent Tower, Jaipur - 302001', gstNo: '08IIIII2345I9Z3', dlNo: 'RJ-40-2024-00369', creditDays: 30, creditLimit: 450000, outstanding: 0, status: 'Active' },
    { supplierCode: 'SUP010', supplierName: 'Zydus Healthcare', contactPerson: 'Arjun Mehta', phone: '9876543219', email: 'arjun@zydus.com', address: '741, Zydus Center, Surat - 395001', gstNo: '24JJJJJ5678J0Z4', dlNo: 'GJ-42-2024-00741', creditDays: 45, creditLimit: 650000, outstanding: 0, status: 'Active' },
    { supplierCode: 'SUP011', supplierName: 'Alkem Labs Dist', contactPerson: 'Pooja Kapoor', phone: '9876543220', email: 'pooja@alkemdist.com', address: '852, Alkem Hub, Chandigarh - 160001', gstNo: '04KKKKK8901K1Z5', dlNo: 'CH-45-2024-00852', creditDays: 30, creditLimit: 500000, outstanding: 0, status: 'Active' },
    { supplierCode: 'SUP012', supplierName: 'Glenmark Suppliers', contactPerson: 'Rohit Bansal', phone: '9876543221', email: 'rohit@glenmark.com', address: '963, Glenmark Plaza, Indore - 452001', gstNo: '23LLLLL1234L2Z6', dlNo: 'MP-48-2024-00963', creditDays: 60, creditLimit: 600000, outstanding: 0, status: 'Active' },
  ]);
};

// ────────────────────────────────────────────────────────────────────────────
// Seed dummy Purchase Orders and GRNs
// ────────────────────────────────────────────────────────────────────────────
const seedPurchaseData = async (db) => {
  return; // ❌ PRODUCTION: Seeding disabled - franchises create real purchases
  
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
  await seedSupplierData(req.db);
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
  
  // Fetch orders without sorting first (avoid sort errors on undefined dates)
  const [orders, total] = await Promise.all([
    PurchaseOrder.find(filter).skip(skip).limit(Number(limit)).lean(),
    PurchaseOrder.countDocuments(filter),
  ]);

  // Sort in-memory to handle missing dates
  orders.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
  });

  // Safe date formatting helper
  const formatDate = (date) => {
    if (!date) return '—';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '—'; // Invalid date
      return d.toISOString().split('T')[0];
    } catch (e) {
      return '—';
    }
  };

  const result = orders.map(o => ({
    _id:          o._id,
    poNo:         o.poNo,
    supplier:     o.supplier,
    items:        o.items?.length || 0,
    totalAmount:  o.totalAmount || 0,
    status:       o.status || 'pending',
    createdAt:    formatDate(o.createdAt),
    expectedDate: formatDate(o.expectedDate),
  }));

  return res.status(200).json(new apiResponse(200, {
    orders: result, total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
  }, 'Purchase orders fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/purchase/orders - Create new Purchase Order
// ────────────────────────────────────────────────────────────────────────────
export const createPurchaseOrder = asyncHandler(async (req, res) => {
  const { supplierId, supplierName, items, expectedDeliveryDate, notes } = req.body;
  
  console.log('📦 Received PO creation request:', { supplierId, supplierName, itemsCount: items?.length });
  
  if (!supplierName || !items?.length) {
    return res.status(400).json(new apiResponse(400, null, 'Supplier name and items are required'));
  }

  const PurchaseOrder = getPurchaseOrderModel(req.db);
  
  // Generate PO number
  const count = await PurchaseOrder.countDocuments();
  const poNo  = `PO-${String(count + 2402).padStart(4, '0')}`;
  
  // Calculate total amount from items
  const totalAmount = items.reduce((sum, item) => {
    const itemTotal = (item.quantity || 0) * (item.purchasePrice || 0);
    return sum + itemTotal;
  }, 0);

  // Create the purchase order
  const po = await PurchaseOrder.create({ 
    poNo, 
    supplierId, 
    supplier: supplierName,
    items: items.map(item => ({
      medicineId: item.medicineId,
      medicineName: item.medicineName,
      salt: item.salt,
      formulation: item.formulation,
      qty: item.quantity,
      ptr: item.purchasePrice,
      mrp: item.mrp,
      scheme: item.scheme,
      batchNo: item.batchNo,
      expiryDate: item.expiryDate,
      amount: (item.quantity || 0) * (item.purchasePrice || 0)
    })),
    totalAmount, 
    expectedDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : undefined, 
    notes, 
    status: 'pending' 
  });
  
  console.log('✅ PO created:', { _id: po._id, poNo: po.poNo });
  
  return res.status(201).json(new apiResponse(201, { 
    _id: po._id, 
    poNo: po.poNo,
    totalAmount: po.totalAmount,
    status: po.status
  }, 'Purchase order created successfully'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/purchase-orders/:id
// ────────────────────────────────────────────────────────────────────────────
export const getPurchaseOrderById = asyncHandler(async (req, res) => {
  const PurchaseOrder = getPurchaseOrderModel(req.db);
  const po = await PurchaseOrder.findById(req.params.id).lean();
  if (!po) return res.status(404).json(new apiResponse(404, null, 'Purchase order not found'));
  
  // Safe date formatting
  const formatDate = (date) => {
    if (!date) return null;
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().split('T')[0];
    } catch (e) {
      return null;
    }
  };

  // Format response with safe dates
  const formattedPO = {
    ...po,
    createdAt: formatDate(po.createdAt),
    expectedDate: formatDate(po.expectedDate),
    updatedAt: formatDate(po.updatedAt),
  };

  return res.status(200).json(new apiResponse(200, formattedPO, 'Purchase order fetched'));
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
// GET /api/franchise/grn?page=&limit=&search=&supplier=&status=&from=&to=
// ────────────────────────────────────────────────────────────────────────────
export const getGRNList = asyncHandler(async (req, res) => {
  await seedPurchaseData(req.db);
  const { page = 1, limit = 20, search = '', supplier = '', status = '', from = '', to = '' } = req.query;
  const GRN = getGRNModel(req.db);

  const filter = {};
  if (search)   filter.$or = [{ grnNo: new RegExp(search, 'i') }, { supplier: new RegExp(search, 'i') }, { invoiceNo: new RegExp(search, 'i') }];
  if (supplier) filter.supplier = new RegExp(supplier, 'i');
  if (status)   filter.status   = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) { const d = new Date(from); d.setHours(0, 0, 0, 0);       filter.createdAt.$gte = d; }
    if (to)   { const d = new Date(to);   d.setHours(23, 59, 59, 999);  filter.createdAt.$lte = d; }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [grns, total] = await Promise.all([
    GRN.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    GRN.countDocuments(filter),
  ]);

  const result = grns.map(g => ({
    _id:      g._id,
    grnNo:    g.grnNo,
    poRef:    g.poRef || '—',
    supplier: g.supplier,
    invoiceNo: g.invoiceNo || '—',
    items:    g.items || [],
    itemCount: g.items?.length || 0,
    status:   g.status,
    date:     new Date(g.createdAt).toISOString().split('T')[0],
    createdAt: new Date(g.createdAt).toISOString(),
  }));

  return res.status(200).json(new apiResponse(200, {
    grns: result, total,
    totalPages:  Math.ceil(total / Number(limit)),
    currentPage: Number(page),
  }, 'GRNs fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/grn  — Create GRN + update stock
// ────────────────────────────────────────────────────────────────────────────
export const createGRN = asyncHandler(async (req, res) => {
  const { supplierId, supplier, poRef, invoiceNo, invoiceDate, items } = req.body;
  if (!supplier || !items?.length) return res.status(400).json(new apiResponse(400, null, 'Supplier and items required'));

  const GRN           = getGRNModel(req.db);
  const Medicine      = getMedicineModel(req.db);
  const MedicineBatch = getMedicineBatchModel(req.db);

  const count    = await GRN.countDocuments();
  const grnNo    = `GRN-${String(count + 1051).padStart(4, '0')}`;
  const totalAmt = items.reduce((s, i) => s + (i.qty * i.ptr || 0), 0);

  const grn = await GRN.create({
    grnNo, supplierId, supplier, poRef, invoiceNo,
    invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
    items, totalAmt, status: 'completed',
  });

  // Update medicine stock + push batch into Medicine.batches[] for FIFO/expiry tracking
  for (const item of items) {
    if (!item.medicineName) continue;

    const totalQty = Number(item.qty) + Number(item.freeQty || 0);
    const expiryDate = item.expiry
      ? new Date(`${item.expiry}-01`)
      : new Date(Date.now() + 365 * 86400000);

    // Find medicine by name
    const med = await Medicine.findOne(
      { name: new RegExp(`^${item.medicineName}$`, 'i'), isActive: true }
    );
    if (!med) continue;

    // Build the new batch object (matches BatchSchema embedded in Medicine)
    const newBatch = {
      batchNo:       item.batchNo || `GRN-${Date.now()}`,
      expiryDate,
      quantity:      totalQty,
      availableQty:  totalQty,
      mrp:           Number(item.mrp)  || 0,
      purchasePrice: Number(item.ptr)  || 0,
      supplierId:    supplierId || '',
      supplierName:  supplier   || '',
      purchaseDate:  new Date(),
      isActive:      true,
      rackLocation:  med.rackLocation || {},
    };

    // Check if same batch already exists (prevent duplicates)
    const existingBatchIndex = med.batches.findIndex(
      b => b.batchNo === item.batchNo && 
           new Date(b.expiryDate).getTime() === expiryDate.getTime()
    );

    if (existingBatchIndex !== -1) {
      // If batch exists with same batchNo and expiry, INCREASE quantity instead of duplicating
      med.batches[existingBatchIndex].quantity += totalQty;
      med.batches[existingBatchIndex].availableQty += totalQty;
    } else {
      // New batch - push it
      med.batches.push(newBatch);
    }

    // Manually calculate currentStock from all active batches
    const calculatedStock = med.batches.reduce((sum, batch) => {
      const qty = batch.availableQty !== undefined ? batch.availableQty : batch.quantity;
      return sum + (batch.isActive !== false ? qty : 0);
    }, 0);

    med.currentStock = calculatedStock;
    await med.save(); // Save with calculated stock

    // Also write to MedicineBatch collection for ledger/reporting
    if (item.batchNo) {
      await MedicineBatch.create({
        medicineId:    med._id,
        batchNo:       item.batchNo,
        expiryDate,
        qty:           totalQty,
        purchasePrice: Number(item.ptr) || 0,
        mrp:           Number(item.mrp) || 0,
        supplierId,
        grnId:         grn._id,
        rackLabel:     item.rack || item.rackLabel || '',
        rackLocation:  med.rackLocation || {},
        isActive:      true,
      });
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
// GET /api/franchise/purchase-returns?page=&limit=&search=&supplier=&status=&from=&to=
// ────────────────────────────────────────────────────────────────────────────
export const getPurchaseReturns = asyncHandler(async (req, res) => {
  await seedPurchaseData(req.db);
  const { page = 1, limit = 20, search = '', supplier = '', status = '', from = '', to = '' } = req.query;
  const PurchaseReturn = getPurchaseReturnModel(req.db);

  const filter = {};
  if (search)   filter.$or = [{ returnNo: new RegExp(search, 'i') }, { supplier: new RegExp(search, 'i') }, { grnRef: new RegExp(search, 'i') }];
  if (supplier) filter.supplier = new RegExp(supplier, 'i');
  if (status)   filter.status   = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) { const d = new Date(from); d.setHours(0, 0, 0, 0);       filter.createdAt.$gte = d; }
    if (to)   { const d = new Date(to);   d.setHours(23, 59, 59, 999);  filter.createdAt.$lte = d; }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [returns, total] = await Promise.all([
    PurchaseReturn.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    PurchaseReturn.countDocuments(filter),
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
    totalPages:  Math.ceil(total / Number(limit)),
    currentPage: Number(page),
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
  const totalAmt = items.reduce((s, i) => s + (Number(i.qty) * Number(i.ptr || 0)), 0);

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

// ── GET /api/franchise/purchase/supplier-ledger?supplierId=&from=&to=&page=&limit=
export const getPurchaseSupplierLedger = asyncHandler(async (req, res) => {
  const { supplierId, from, to, page = 1, limit = 20 } = req.query;
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);
  const Supplier        = getSupplierModel(req.db);

  const filter = {};
  if (supplierId) filter.supplierId = supplierId;
  if (from || to) {
    filter.billDate = {};
    if (from) { const d = new Date(from); d.setHours(0,0,0,0);      filter.billDate.$gte = d; }
    if (to)   { const d = new Date(to);   d.setHours(23,59,59,999); filter.billDate.$lte = d; }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [invoices, total] = await Promise.all([
    PurchaseInvoice.find(filter).sort({ billDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    PurchaseInvoice.countDocuments(filter),
  ]);

  // Aggregate totals
  const agg = await PurchaseInvoice.aggregate([
    { $match: filter },
    { $group: { _id: null, totalPurchase: { $sum: '$totalAmt' }, totalPaid: { $sum: '$paidAmt' }, totalDue: { $sum: '$dueAmt' } } },
  ]);

  // Get supplier list for dropdown
  const suppliers = await Supplier.find({ isActive: true }).select('_id name supplierCode').lean();

  return res.status(200).json(new apiResponse(200, {
    entries: invoices.map(inv => ({
      _id:          inv._id,
      date:         new Date(inv.billDate).toLocaleDateString('en-IN'),
      billNo:       inv.billNo,
      supplierName: inv.supplierName || '—',
      totalAmt:     inv.totalAmt,
      paidAmt:      inv.paidAmt || 0,
      dueAmt:       inv.dueAmt  || inv.totalAmt - (inv.paidAmt || 0),
      status:       inv.status,
      paymentMode:  inv.paymentMode || '—',
    })),
    total,
    totalPages:    Math.ceil(total / Number(limit)),
    summary:       agg[0] || { totalPurchase: 0, totalPaid: 0, totalDue: 0 },
    suppliers:     suppliers.map(s => ({ _id: s._id, name: s.name, code: s.supplierCode })),
  }, 'Purchase supplier ledger fetched'));
});

// ── GET /api/franchise/purchase/live-rate?medicine=&supplierId=
// Compare live rates for a medicine across suppliers in purchase context
export const getPurchaseLiveRate = asyncHandler(async (req, res) => {
  const { medicine = '' } = req.query;

  console.log('🔍 Searching medicine:', medicine);

  if (!medicine || medicine.trim().length < 2) {
    return res.status(200).json(new apiResponse(200, { medicines: [], total: 0 }, 'Please provide medicine name'));
  }

  // Find all GLOBAL suppliers who have this medicine (medicines are stored globally, not per-tenant)
  // NOTE: isActive field may be undefined in some suppliers, so we check for both true and undefined
  const suppliers = await Supplier.find({
    $or: [
      { isActive: true },
      { isActive: { $exists: false } }
    ],
    'medicines.name': new RegExp(medicine.trim(), 'i')
  }).lean();

  console.log(`📦 Found ${suppliers.length} suppliers with medicine: ${medicine}`);

  // Group medicines by name and collect supplier rates
  const medicineMap = new Map();

  suppliers.forEach(supplier => {
    // Find matching medicines in this supplier's inventory
    const matchingMeds = supplier.medicines.filter(med => 
      new RegExp(medicine.trim(), 'i').test(med.name)
    );

    matchingMeds.forEach(med => {
      const medKey = med.name.toLowerCase().trim();
      
      if (!medicineMap.has(medKey)) {
        medicineMap.set(medKey, {
          _id: med._id || supplier._id + '-' + med.name,
          name: med.name,
          salt: med.genericName || med.salt || '',
          formulation: med.category || '',
          mrp: med.mrp || 0,
          supplierRates: []
        });
      }

      const medData = medicineMap.get(medKey);
      medData.supplierRates.push({
        supplierId: supplier._id,
        supplierName: supplier.companyName || 'Unknown Supplier',
        purchasePrice: med.supplierPrice || (med.mrp * 0.7),
        mrp: med.mrp,
        qty: med.stock || 0,
        batchNo: med.batchNumber || '',
        expiryDate: med.expiryDate || null,
        discount: med.discount || 0,
        scheme: med.scheme || '',
      });
    });
  });

  // Convert map to array
  const result = Array.from(medicineMap.values());

  console.log(`✅ Returning ${result.length} medicine(s) with supplier rates`);

  return res.status(200).json(new apiResponse(200, { medicines: result, total: result.length }, 'Live rates fetched'));
});

// ── DEBUG: GET /api/franchise/purchase/debug-suppliers
// Check what suppliers exist and their medicines
export const debugSuppliers = asyncHandler(async (req, res) => {
  const allSuppliers = await Supplier.find({}).select('companyName email isActive medicines').lean();
  
  const summary = allSuppliers.map(s => ({
    id: s._id,
    name: s.companyName,
    email: s.email,
    isActive: s.isActive,
    medicineCount: s.medicines?.length || 0,
    medicines: s.medicines?.slice(0, 5).map(m => ({ 
      name: m.name, 
      stock: m.stock,
      supplierPrice: m.supplierPrice,
      mrp: m.mrp 
    })) || []
  }));

  return res.status(200).json(new apiResponse(200, { 
    totalSuppliers: allSuppliers.length,
    activeSuppliers: allSuppliers.filter(s => s.isActive).length,
    suppliers: summary 
  }, 'Debug data'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/purchase/supplier-ledger
// Get all suppliers with outstanding balance summary
// ────────────────────────────────────────────────────────────────────────────
export const getSupplierLedgerSummary = asyncHandler(async (req, res) => {
  await seedSupplierData(req.db);
  const Supplier = getSupplierModel(req.db);
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);

  // Get all active suppliers
  const suppliers = await Supplier.find({ isActive: true }).lean();

  // Calculate outstanding for each supplier from purchase invoices
  const summary = await Promise.all(
    suppliers.map(async (s) => {
      const agg = await PurchaseInvoice.aggregate([
        { $match: { supplierId: s._id, status: { $nin: ['Cancelled', 'Returned'] } } },
        { $group: {
          _id: null,
          totalPurchase: { $sum: '$totalAmt' },
          totalPaid:     { $sum: '$paidAmt' },
        }},
      ]);
      const { totalPurchase = 0, totalPaid = 0 } = agg[0] || {};
      const outstanding = totalPurchase - totalPaid;
      
      return {
        _id: s._id,
        name: s.name,
        contactPerson: s.contactPerson || '',
        phone: s.phone || '',
        outstanding,
        lastPurchase: s.lastPurchaseDate || null,
      };
    })
  );

  // Sort by outstanding desc
  summary.sort((a, b) => b.outstanding - a.outstanding);

  return res.status(200).json(new apiResponse(200, summary, 'Supplier ledger summary fetched'));
});
