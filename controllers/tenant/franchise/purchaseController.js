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
import { getRackConfigModel } from '../../../models/tenant/franchise/RackConfig.model.js';
import { getRackAssignmentModel } from '../../../models/tenant/franchise/RackAssignment.model.js';
import Supplier from '../../../models/Supplier.model.js'; // ← GLOBAL Supplier Model (where medicines are stored)



// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/purchase/dashboard?date=
// Purchase dashboard KPIs, chart, payment breakdown
// ────────────────────────────────────────────────────────────────────────────
export const getPurchaseDashboard = asyncHandler(async (req, res) => {
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);

  const dateParam = req.query.date;
  let start, end;
  if (dateParam) {
    start = new Date(dateParam); start.setHours(0, 0, 0, 0);
    end = new Date(dateParam); end.setHours(23, 59, 59, 999);
  } else {
    start = new Date(); start.setHours(0, 0, 0, 0);
    end = new Date(); end.setHours(23, 59, 59, 999);
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
    const hEnd = new Date(start); hEnd.setHours(h + 2, 59, 59, 999);
    const hAgg = await PurchaseInvoice.aggregate([
      { $match: { billDate: { $gte: hStart, $lte: hEnd } } },
      { $group: { _id: null, total: { $sum: '$totalAmt' } } },
    ]);
    hourlyData.push({ t: `${String(h).padStart(2, '0')}:00`, v: hAgg[0]?.total || 0 });
  }

  const formattedInvoices = invoices.map(inv => ({
    _id: inv._id,
    no: inv.billNo,
    date: new Date(inv.billDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    supplier: inv.supplierName,
    mode: inv.paymentMode,
    items: inv.items?.length || 0,
    gross: inv.subtotal,
    disc: inv.discountAmt,
    tax: inv.gstAmt,
    net: inv.totalAmt,
    status: inv.status,
  }));

  return res.status(200).json(new apiResponse(200, {
    kpi: {
      totalPurchase: kpi.totalPurchase,
      totalItems: kpi.items,
      totalDiscount: kpi.totalDiscount,
      totalTax: kpi.totalTax,
      netPurchase,
      totalPaid: kpi.totalPaid,
      invoiceCount: kpi.count,
    },
    paymentPie,
    hourlyData,
    invoices: formattedInvoices,
    topItems: topItems.map((t, i) => ({ rank: i + 1, name: t.name, qty: t.qty, amount: t.amount })),
    supplierSummary: {
      totalSuppliers: new Set(invoices.map(i => i.supplierName)).size,
      newSuppliers: 0,
      totalPurchase: kpi.totalPurchase,
      totalDiscount: kpi.totalDiscount,
      totalTax: kpi.totalTax,
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
  if (supplier) filter.supplierName = new RegExp(supplier, 'i');
  if (payment_mode) filter.paymentMode = payment_mode;

  const skip = (Number(page) - 1) * Number(limit);
  const [invoices, total] = await Promise.all([
    PurchaseInvoice.find(filter).sort({ billDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    PurchaseInvoice.countDocuments(filter),
  ]);

  const result = invoices.map(inv => ({
    _id: inv._id,
    no: inv.billNo,
    date: new Date(inv.billDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    supplier: inv.supplierName,
    verified: false,
    mode: inv.paymentMode,
    items: inv.items?.length || 0,
    gross: inv.subtotal || 0,
    disc: inv.discountAmt || 0,
    tax: inv.gstAmt || 0,
    net: inv.totalAmt,
    status: inv.status,
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
    _id: o._id,
    poNo: o.poNo,
    supplier: o.supplier,
    items: o.items?.length || 0,
    totalAmount: o.totalAmount || 0,
    status: o.status || 'pending',
    createdAt: formatDate(o.createdAt),
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
  const poNo = `PO-${String(count + 2402).padStart(4, '0')}`;

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
  const { page = 1, limit = 20, search = '', supplier = '', status = '', from = '', to = '' } = req.query;
  const GRN = getGRNModel(req.db);

  const filter = {};
  if (search) filter.$or = [{ grnNo: new RegExp(search, 'i') }, { supplier: new RegExp(search, 'i') }, { invoiceNo: new RegExp(search, 'i') }];
  if (supplier) filter.supplier = new RegExp(supplier, 'i');
  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) { const d = new Date(from); d.setHours(0, 0, 0, 0); filter.createdAt.$gte = d; }
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); filter.createdAt.$lte = d; }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [grns, total] = await Promise.all([
    GRN.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    GRN.countDocuments(filter),
  ]);

  const result = grns.map(g => ({
    _id: g._id,
    grnNo: g.grnNo,
    poRef: g.poRef || '—',
    supplier: g.supplier,
    invoiceNo: g.invoiceNo || '—',
    items: g.items || [],
    itemCount: g.items?.length || 0,
    status: g.status,
    date: new Date(g.createdAt).toISOString().split('T')[0],
    createdAt: new Date(g.createdAt).toISOString(),
  }));

  return res.status(200).json(new apiResponse(200, {
    grns: result, total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
  }, 'GRNs fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/purchase/grn/quick-create — Auto create GRN from PO
// (No items data needed - auto-loads from PO)
// ────────────────────────────────────────────────────────────────────────────
export const quickCreateGRN = asyncHandler(async (req, res) => {
  const { poId } = req.body
  if (!poId) return res.status(400).json(new apiResponse(400, null, 'PO ID required'))

  const GRN = getGRNModel(req.db)
  const PurchaseOrder = getPurchaseOrderModel(req.db)

  // Fetch PO
  const po = await PurchaseOrder.findById(poId)
  if (!po) return res.status(404).json(new apiResponse(404, null, 'PO not found'))

  // Create GRN with all PO items (status: pending_assignment)
  const count = await GRN.countDocuments()
  const grnNo = `GRN-${String(count + 1051).padStart(4, '0')}`

  const grnData = {
    grnNo,
    supplierId: po.supplierId,
    supplier: po.supplier,
    poRef: po.poNo,
    poId: po._id,
    items: (po.items || []).map(item => ({
      medicineId: item.medicineId,
      medicineName: item.medicineName,
      poOrderedQty: item.orderedQty || 0,
      grnReceivedQty: item.orderedQty || 0,  // Default: receive all
      grnRejectedQty: 0,
      batchNo: '',  // ← Empty - staff will fill during assignment
      expiryDate: null,  // ← Empty - staff will fill during assignment
      qcStatus: 'pending',
      ptr: item.ptr,
      mrp: item.mrp,
    })),
    status: 'pending_assignment',  // ← New status: waiting for counter/rack assignment
    receivedDate: new Date(),
  }

  const grn = await GRN.create(grnData)

  console.log(`✅ Quick GRN Created: ${grn.grnNo} with ${grn.items.length} items (pending assignment)`)

  return res.status(201).json(new apiResponse(201, {
    _id: grn._id,
    grnNo: grn.grnNo,
    itemCount: grn.items.length,
    status: grn.status,
    message: 'GRN created. Now assign counter/rack for each medicine.',
  }, 'Quick GRN created'))
})

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/franchise/purchase/grn/:id/assign-all — Bulk assign medicines to positions
// Completes the GRN assignment
// ────────────────────────────────────────────────────────────────────────────
export const assignMedicinesToRacks = asyncHandler(async (req, res) => {
  const { assignments } = req.body  // [{ itemIndex, medicineId, batchNo, expiryDate, counterId, rackId, shelf, row, column }, ...]
  const grnId = req.params.id

  if (!assignments || !Array.isArray(assignments)) {
    return res.status(400).json(new apiResponse(400, null, 'Assignments array required'))
  }

  const GRN = getGRNModel(req.db)
  const RackAssignment = getRackAssignmentModel(req.db)
  const Medicine = getMedicineModel(req.db)
  const PurchaseOrder = getPurchaseOrderModel(req.db)

  // Validate and extract franchiseId
  let franchiseId = req.params?.franchiseId || req.user?.franchiseId || req.user?._id || req.user?.id;
  if (!franchiseId) {
    console.error('❌ franchiseId is undefined/null in assignMedicinesToRacks');
    return res.status(400).json(new apiResponse(400, null, 'Franchise ID is required'));
  }
  franchiseId = franchiseId.toString ? franchiseId.toString() : String(franchiseId);

  // Fetch GRN
  const grn = await GRN.findById(grnId)
  if (!grn) return res.status(404).json(new apiResponse(404, null, 'GRN not found'))

  // Update GRN items with batch/expiry + create RackAssignments
  const updatedItems = [...grn.items]
  const rackAssignmentsToCreate = []

  for (const assign of assignments) {
    const { itemIndex, medicineId, batchNo, expiryDate, counterId, rackId, shelf, row, column } = assign

    if (itemIndex < 0 || itemIndex >= updatedItems.length) continue

    const item = updatedItems[itemIndex]

    // Update GRN item with batch/expiry
    item.batchNo = batchNo
    item.expiryDate = expiryDate
    item.qcStatus = 'assigned'

    // Prepare RackAssignment
    const position = `${counterId}>${rackId}>${shelf}-${row}-${column}`
    rackAssignmentsToCreate.push({
      franchiseId,  // Use validated franchiseId
      medicineId,
      medicineName: item.medicineName,
      batchNo,
      counterId,
      rackId,
      shelf,
      row,
      column,
      position,
      assignedVia: 'manual',
      assignedBy: req.user?._id,
      grnId: grn._id,
      isActive: true,
    })
  }

  // Save updated GRN
  grn.items = updatedItems
  grn.status = 'assigned'
  await grn.save()

  // Create RackAssignments (bulk)
  if (rackAssignmentsToCreate.length > 0) {
    await RackAssignment.insertMany(rackAssignmentsToCreate, { ordered: false })
  }

  // Update Medicine stock + batches
  for (const item of grn.items) {
    if (!item.medicineName || item.grnReceivedQty <= 0) continue

    const med = await Medicine.findOne({
      name: new RegExp(`^${item.medicineName}$`, 'i'),
      isActive: true,
    })
    if (!med) continue

    const newBatch = {
      batchNo: item.batchNo,
      expiryDate: new Date(item.expiryDate),
      quantity: item.grnReceivedQty,
      availableQty: item.grnReceivedQty,
      mrp: item.mrp || 0,
      purchasePrice: item.ptr || 0,
      supplierName: grn.supplier,
      purchaseDate: new Date(),
      isActive: true,
    }

    const existingBatchIndex = med.batches.findIndex(
      b => b.batchNo === item.batchNo && new Date(b.expiryDate).getTime() === new Date(item.expiryDate).getTime()
    )

    if (existingBatchIndex !== -1) {
      med.batches[existingBatchIndex].quantity += item.grnReceivedQty
      med.batches[existingBatchIndex].availableQty += item.grnReceivedQty
    } else {
      med.batches.push(newBatch)
    }

    const calculatedStock = med.batches.reduce((sum, batch) => {
      const qty = batch.availableQty !== undefined ? batch.availableQty : batch.quantity
      return sum + (batch.isActive !== false ? qty : 0)
    }, 0)

    med.currentStock = calculatedStock
    await med.save()
  }

  // Update PO status if linked
  if (grn.poId) {
    const po = await PurchaseOrder.findById(grn.poId)
    if (po) {
      po.status = 'received'
      po.totalReceivedQty = (po.items || []).reduce((s, it) => s + (it.orderedQty || 0), 0)
      po.completionPct = 100
      po.lastGRNDate = new Date()
      if (!po.grns) po.grns = []
      if (!po.grns.includes(grn._id)) po.grns.push(grn._id)
      await po.save()
    }
  }

  console.log(`✅ GRN ${grn.grnNo} assigned: ${rackAssignmentsToCreate.length} medicines positioned`)

  return res.status(200).json(new apiResponse(200, {
    grnNo: grn.grnNo,
    status: grn.status,
    assignedCount: rackAssignmentsToCreate.length,
  }, 'All medicines assigned'))
})

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/purchase/grn/simple — Create simple GRN (qty only, no batch/expiry)
// Batch, expiry, PTR, MRP filled in later via QuickGRNAssignment screen
// ────────────────────────────────────────────────────────────────────────────
export const createSimpleGRN = asyncHandler(async (req, res) => {
  const { supplierId, supplier, poId, poRef, invoiceNo, invoiceDate, items } = req.body;

  if (!supplier || !items?.length) {
    return res.status(400).json(new apiResponse(400, null, 'Supplier and items required'));
  }

  const GRN = getGRNModel(req.db);
  const count = await GRN.countDocuments();
  const grnNo = `GRN-${String(count + 1051).padStart(4, '0')}`;

  // Create GRN with items (batch/expiry not filled yet)
  const grnData = {
    grnNo,
    supplierId: supplierId || '',
    supplier,
    poRef: poRef || '',
    poId: poId || undefined,
    invoiceNo: invoiceNo.trim(),
    invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
    items: items.map(it => ({
      medicineId: it.medicineId,
      medicineName: it.medicineName,
      category: it.category || 'Generic',
      grnReceivedQty: Number(it.grnReceivedQty) || 0,
      // ← Batch, expiry, PTR, MRP will be filled later
      batchNo: '',
      expiryDate: null,
      ptr: 0,
      mrp: 0,
      qcStatus: 'pending',
    })),
    status: 'pending_assignment', // ← GRN created but waiting for batch/rack assignment
    createdAt: new Date(),
  };

  const grn = await GRN.create(grnData);

  console.log(`✅ Simple GRN created: ${grn.grnNo} with ${grn.items.length} items (pending assignment)`);

  return res.status(201).json(new apiResponse(201, {
    _id: grn._id,
    grnNo: grn.grnNo,
    status: grn.status,
    itemCount: grn.items.length,
  }, 'GRN created! Proceed to batch/rack assignment'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/purchase/grn/:grnId/complete — Complete GRN assignment + update stock
// (Called after batch, expiry, and rack assignments are filled in QuickGRNAssignment)
// ────────────────────────────────────────────────────────────────────────────
export const completeGRNAssignment = asyncHandler(async (req, res) => {
  const { grnId } = req.params;
  const { items } = req.body; // Updated items with batch, expiry, ptr, mrp, rack assignments

  if (!grnId || !items?.length) {
    return res.status(400).json(new apiResponse(400, null, 'GRN ID and items required'));
  }

  const GRN = getGRNModel(req.db);
  const Medicine = getMedicineModel(req.db);
  const MedicineBatch = getMedicineBatchModel(req.db);
  const RackAssignment = getRackAssignmentModel(req.db);
  const PurchaseOrder = getPurchaseOrderModel(req.db);

  // Validate and extract franchiseId
  let franchiseId = req.params?.franchiseId || req.user?.franchiseId || req.user?._id || req.user?.id;
  if (!franchiseId) {
    console.error('❌ franchiseId is undefined/null in completeGRNAssignment');
    return res.status(400).json(new apiResponse(400, null, 'Franchise ID is required'));
  }
  franchiseId = franchiseId.toString ? franchiseId.toString() : String(franchiseId);

  // Fetch existing GRN
  const grn = await GRN.findById(grnId);
  if (!grn) return res.status(404).json(new apiResponse(404, null, 'GRN not found'));

  // Update GRN items with batch/expiry/pricing details
  grn.items = items.map(it => ({
    ...it,
    batchNo: it.batchNo || '',
    expiryDate: it.expiryDate ? new Date(it.expiryDate) : null,
    ptr: Number(it.ptr) || 0,
    mrp: Number(it.mrp) || 0,
    qcStatus: it.qcStatus || 'passed',
  }));

  grn.status = 'completed'; // ← Mark as completed
  await grn.save();

  // Update medicines stock + batches
  for (const item of grn.items) {
    if (!item.medicineName || item.grnReceivedQty <= 0) continue;

    const med = await Medicine.findOne({
      name: new RegExp(`^${item.medicineName}$`, 'i'),
      isActive: true,
    });
    if (!med) continue;

    const expiryDate = item.expiryDate || new Date(Date.now() + 365 * 86400000);
    const newBatch = {
      batchNo: item.batchNo || `GRN-${Date.now()}`,
      expiryDate,
      quantity: item.grnReceivedQty,
      availableQty: item.grnReceivedQty,
      mrp: item.mrp || 0,
      purchasePrice: item.ptr || 0,
      supplierId: grn.supplierId,
      supplierName: grn.supplier,
      purchaseDate: new Date(),
      isActive: true,
    };

    // Check if batch already exists
    const existingBatchIndex = med.batches.findIndex(
      b => b.batchNo === item.batchNo && new Date(b.expiryDate).getTime() === expiryDate.getTime()
    );

    if (existingBatchIndex !== -1) {
      med.batches[existingBatchIndex].quantity += item.grnReceivedQty;
      med.batches[existingBatchIndex].availableQty += item.grnReceivedQty;
    } else {
      med.batches.push(newBatch);
    }

    // Recalculate stock
    const calculatedStock = med.batches.reduce((sum, batch) => {
      const qty = batch.availableQty !== undefined ? batch.availableQty : batch.quantity;
      return sum + (batch.isActive !== false ? qty : 0);
    }, 0);

    med.currentStock = calculatedStock;
    await med.save();

    // Create rack assignments if provided
    if (item.counterId && item.rackId) {
      await RackAssignment.create({
        franchiseId,  // Use validated franchiseId variable from function scope
        medicineId: item.medicineId,
        medicineName: item.medicineName,
        batchNo: item.batchNo,
        counterId: item.counterId,
        rackId: item.rackId,
        shelf: item.shelf || 1,
        row: item.row || 'A',
        column: item.column || 1,
        position: `${item.counterId}>${item.rackId}>${item.shelf || 1}-${item.row || 'A'}-${item.column || 1}`,
        assignedVia: 'grn',
        assignedBy: req.user?._id,
        grnId: grn._id,
        isActive: true,
      });
    }

    // Write to batch ledger
    if (item.batchNo) {
      await MedicineBatch.create({
        medicineId: med._id,
        batchNo: item.batchNo,
        expiryDate,
        qty: item.grnReceivedQty,
        purchasePrice: item.ptr || 0,
        mrp: item.mrp || 0,
        supplierId: grn.supplierId,
        grnId: grn._id,
      }).catch(() => null); // Ignore if batch ledger fails
    }
  }

  // Update linked PO if exists
  if (grn.poId) {
    const po = await PurchaseOrder.findById(grn.poId);
    if (po) {
      po.status = 'received';
      po.completionPct = 100;
      po.lastGRNDate = new Date();
      if (!po.grns) po.grns = [];
      if (!po.grns.includes(grn._id)) po.grns.push(grn._id);
      await po.save();
    }
  }

  console.log(`✅ GRN ${grn.grnNo} completed: stock updated, batch tracked, rack assigned`);

  return res.status(200).json(new apiResponse(200, {
    grnNo: grn.grnNo,
    status: grn.status,
  }, 'GRN completed and stock updated'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/purchase/grn  — Create GRN + update stock + UPDATE PO STATUS
// ────────────────────────────────────────────────────────────────────────────
export const createGRN = asyncHandler(async (req, res) => {
  const { supplierId, supplier, poId, poRef, invoiceNo, invoiceDate, items } = req.body;

  if (!supplier || !items?.length) return res.status(400).json(new apiResponse(400, null, 'Supplier and items required'));

  // Batch/Expiry validation (MANDATORY)
  const missingBatchOrExpiry = items.some(item => !item.batchNo || !item.expiryDate);
  if (missingBatchOrExpiry) {
    return res.status(400).json(new apiResponse(400, null, 'Batch number and expiry date are mandatory for all items'));
  }

  const GRN = getGRNModel(req.db);
  const Medicine = getMedicineModel(req.db);
  const MedicineBatch = getMedicineBatchModel(req.db);
  const PurchaseOrder = getPurchaseOrderModel(req.db);

  // Import helper functions
  const {
    updatePOItemQuantities,
    calculatePOTotals,
    determinePOStatus,
    isBackordered,
    generateBackorderNote
  } = await import('../../../utils/poStatusHelper.js').then(m => ({
    updatePOItemQuantities: m.updatePOItemQuantities,
    calculatePOTotals: m.calculatePOTotals,
    determinePOStatus: m.determinePOStatus,
    isBackordered: m.isBackordered,
    generateBackorderNote: m.generateBackorderNote,
  }));

  const count = await GRN.countDocuments();
  const grnNo = `GRN-${String(count + 1051).padStart(4, '0')}`;

  // Use grnReceivedQty (not qty) for amount calculation
  const totalAmt = items.reduce((s, i) => s + ((i.grnReceivedQty || i.qty || 0) * (i.ptr || 0)), 0);

  const grnData = {
    grnNo,
    supplierId,
    supplier,
    poRef,
    poId: poId || undefined,
    invoiceNo,
    invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
    items,
    totalAmount: totalAmt,
    status: 'completed',
  };

  const grn = await GRN.create(grnData);

  // ────────────────────────────────────────────────────────────────────────────
  // UPDATE PO STATUS IF PO LINKED
  // ────────────────────────────────────────────────────────────────────────────
  if (poId) {
    const po = await PurchaseOrder.findById(poId);
    if (po) {
      // Update PO items with received/rejected quantities
      const updatedItems = updatePOItemQuantities(po.items, items);

      // Calculate totals
      const totals = calculatePOTotals(updatedItems);

      // Determine backorder status
      const backordered = isBackordered(po.createdAt, po.lastGRNDate, totals.completionPct);

      // Determine new status
      let newStatus = determinePOStatus(totals.completionPct, po.lastGRNDate, backordered);

      // Update PO
      po.items = updatedItems;
      po.totalOrderedQty = totals.totalOrderedQty;
      po.totalReceivedQty = totals.totalReceivedQty;
      po.totalRejectedQty = totals.totalRejectedQty;
      po.completionPct = totals.completionPct;
      po.status = newStatus;
      po.lastGRNDate = new Date();
      po.backorderStatus = backordered ? 'delayed' : 'none';
      po.backorderNote = generateBackorderNote(updatedItems, supplier);

      // Add GRN reference
      if (!po.grns) po.grns = [];
      po.grns.push(grn._id);

      await po.save();

      console.log(`✅ PO Updated: ${po.poNo} → Status: ${newStatus} (${totals.completionPct}% received)`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // UPDATE MEDICINE STOCK + BATCHES
  // ────────────────────────────────────────────────────────────────────────────
  for (const item of items) {
    if (!item.medicineName) continue;

    console.log(`📦 Processing medicine: ${item.medicineName}, Qty: ${item.grnReceivedQty}`);

    // Use grnReceivedQty (not rejected) for stock addition
    const totalQty = Number(item.grnReceivedQty || item.qty || 0);
    if (totalQty <= 0) continue; // Skip if no qty received

    const expiryDate = item.expiryDate
      ? new Date(item.expiryDate)
      : new Date(Date.now() + 365 * 86400000);

    // ✅ IMPROVED: Find medicine by ID first, then by name
    let med = null;

    // Try 1: Search by medicineId
    if (item.medicineId) {
      med = await Medicine.findById(item.medicineId);
    }

    // Try 2: Search by name (both active and inactive)
    if (!med) {
      med = await Medicine.findOne(
        { name: new RegExp(`^${item.medicineName}$`, 'i') }
      );
    }

    // Try 3: Create new medicine if not found
    if (!med) {
      console.log(`📝 Creating new medicine: ${item.medicineName}`);
      med = await Medicine.create({
        name: item.medicineName,
        salt: item.salt || '',
        category: item.category || 'Generic',
        mrp: Number(item.mrp) || 0,
        purchasePrice: Number(item.ptr) || 0,
        currentStock: 0,
        reorderLevel: 20,
        isActive: true,
        batches: [],
      });
    }

    // Activate medicine if it was inactive
    if (!med.isActive) {
      med.isActive = true;
      console.log(`♻️ Reactivated medicine: ${med.name}`);
    }

    // Build the new batch object
    const newBatch = {
      batchNo: item.batchNo || `GRN-${Date.now()}`,
      expiryDate,
      quantity: totalQty,
      availableQty: totalQty,
      mrp: Number(item.mrp) || 0,
      purchasePrice: Number(item.ptr) || 0,
      supplierId: supplierId || '',
      supplierName: supplier || '',
      purchaseDate: new Date(),
      isActive: true,
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
    console.log(`✅ Medicine saved: ${med.name}, Stock: ${med.currentStock}`);

    // Also write to MedicineBatch collection for ledger/reporting
    if (item.batchNo) {
      await MedicineBatch.create({
        medicineId: med._id,
        batchNo: item.batchNo,
        expiryDate,
        qty: totalQty,
        purchasePrice: Number(item.ptr) || 0,
        mrp: Number(item.mrp) || 0,
        supplierId,
        grnId: grn._id,
      }).catch(err => console.warn('⚠️ MedicineBatch creation skipped:', err.message));
    }
  }

  console.log(`✅ GRN ${grnNo} created successfully with ${items.length} medicines`);

  return res.status(201).json(new apiResponse(201, {
    _id: grn._id,
    grnNo: grnNo,
    status: grn.status,
    itemCount: items.length,
    message: 'GRN created and medicine stock updated!',
  }, 'GRN created successfully'));
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
  const { page = 1, limit = 20, search = '', supplier = '', status = '', from = '', to = '' } = req.query;
  const PurchaseReturn = getPurchaseReturnModel(req.db);

  const filter = {};
  if (search) filter.$or = [{ returnNo: new RegExp(search, 'i') }, { supplier: new RegExp(search, 'i') }, { grnRef: new RegExp(search, 'i') }];
  if (supplier) filter.supplier = new RegExp(supplier, 'i');
  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) { const d = new Date(from); d.setHours(0, 0, 0, 0); filter.createdAt.$gte = d; }
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); filter.createdAt.$lte = d; }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [returns, total] = await Promise.all([
    PurchaseReturn.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    PurchaseReturn.countDocuments(filter),
  ]);

  const result = returns.map(r => ({
    _id: r._id,
    returnNo: r.returnNo,
    grnRef: r.grnRef,
    supplier: r.supplier,
    reason: r.items?.[0]?.reason || '—',
    items: r.items?.length || 0,
    status: r.status,
    date: new Date(r.createdAt).toISOString().split('T')[0],
  }));

  return res.status(200).json(new apiResponse(200, {
    returns: result, total,
    totalPages: Math.ceil(total / Number(limit)),
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
  const Medicine = getMedicineModel(req.db);
  const MedicineBatch = getMedicineBatchModel(req.db);

  const count = await PurchaseReturn.countDocuments();
  const returnNo = `PR-${String(count + 102).padStart(3, '0')}`;
  const totalAmt = items.reduce((s, i) => s + (Number(i.qty) * Number(i.ptr || 0)), 0);

  const ret = await PurchaseReturn.create({
    returnNo, supplierId, supplier, grnRef, items,
    totalAmt, status: 'pending', notes,
  });

  // Process returned items - reduce from batches
  for (const item of items) {
    if (!item.medicineName || !item.medicineId) continue;

    const medicine = await Medicine.findById(item.medicineId);
    if (!medicine) continue;

    const returnQty = Number(item.qty || 0);
    if (returnQty <= 0) continue;

    // Find the batch with the matching batchNo to reduce quantity
    if (item.batchNo && medicine.batches.length > 0) {
      const batch = medicine.batches.find(b => b.batchNo === item.batchNo);
      if (batch) {
        // Reduce availableQty from this specific batch
        const newAvailableQty = Math.max(0, (batch.availableQty || batch.quantity || 0) - returnQty);

        // Update batch
        await Medicine.findByIdAndUpdate(
          item.medicineId,
          {
            $set: {
              'batches.$[elem].availableQty': newAvailableQty,
            },
          },
          { arrayFilters: [{ 'elem.batchNo': item.batchNo }] }
        );

        // Update MedicineBatch ledger if it exists
        await MedicineBatch.findOneAndUpdate(
          { medicineId: item.medicineId, batchNo: item.batchNo, isActive: true },
          { $inc: { qty: -returnQty } }
        );
      }
    } else {
      // If no batch specified, reduce from any active batch (FIFO - reduce from first)
      const activeBatch = medicine.batches.find(b => b.isActive && (b.availableQty || b.quantity) > 0);
      if (activeBatch) {
        const newAvailableQty = Math.max(0, (activeBatch.availableQty || activeBatch.quantity || 0) - returnQty);

        await Medicine.findByIdAndUpdate(
          item.medicineId,
          {
            $set: {
              'batches.$[elem].availableQty': newAvailableQty,
            },
          },
          { arrayFilters: [{ 'elem._id': activeBatch._id }] }
        );

        await MedicineBatch.findOneAndUpdate(
          { medicineId: item.medicineId, batchNo: activeBatch.batchNo, isActive: true },
          { $inc: { qty: -returnQty } }
        );
      }
    }

    // Update medicine currentStock via pre-hook (it sums up all batch availableQty)
    await Medicine.findByIdAndUpdate(item.medicineId, { $inc: { currentStock: -returnQty } });
  }

  return res.status(201).json(new apiResponse(201, { _id: ret._id, returnNo: ret.returnNo }, 'Purchase return submitted'));
});

// ── GET /api/franchise/purchase/supplier-ledger?supplierId=&from=&to=&page=&limit=
// Returns all suppliers with GRN and Purchase Returns transactions
export const getPurchaseSupplierLedger = asyncHandler(async (req, res) => {
  const { supplierId, from, to, page = 1, limit = 20 } = req.query;
  const GRN = getGRNModel(req.db);
  const PurchaseReturn = getPurchaseReturnModel(req.db);
  const Supplier = getSupplierModel(req.db);

  const filter = {};
  if (supplierId) filter.supplier = new RegExp(supplierId, 'i');
  if (from || to) {
    filter.createdAt = {};
    if (from) { const d = new Date(from); d.setHours(0, 0, 0, 0); filter.createdAt.$gte = d; }
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); filter.createdAt.$lte = d; }
  }

  // Get all unique suppliers from GRN
  const suppliersData = await GRN.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$supplier',
        totalPurchase: { $sum: '$totalAmt' },
        grnCount: { $sum: 1 },
        lastGRN: { $max: '$createdAt' }
      }
    },
    { $sort: { lastGRN: -1 } }
  ]);

  // Get returns per supplier
  const returnsData = await PurchaseReturn.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$supplier',
        totalReturns: { $sum: '$totalAmt' },
        returnCount: { $sum: 1 }
      }
    }
  ]);

  const returnsMap = {};
  returnsData.forEach(r => {
    returnsMap[r._id] = { totalReturns: r.totalReturns, returnCount: r.returnCount };
  });

  // Build supplier summary
  const suppliers = suppliersData.map(s => {
    const returns = returnsMap[s._id] || { totalReturns: 0, returnCount: 0 };
    const outstanding = s.totalPurchase - returns.totalReturns;
    return {
      supplier: s._id,
      totalPurchase: s.totalPurchase,
      totalReturns: returns.totalReturns,
      outstanding: Math.max(0, outstanding),
      grnCount: s.grnCount,
      returnCount: returns.returnCount,
      lastTxn: s.lastGRN,
    };
  });

  const total = suppliers.length;
  const skip = (Number(page) - 1) * Number(limit);
  const paginatedSuppliers = suppliers.slice(skip, skip + Number(limit));

  // Get detailed transactions for selected supplier (if provided)
  let ledgerEntries = [];
  if (supplierId) {
    const grnTransactions = await GRN.find({ supplier: new RegExp(supplierId, 'i') }).sort({ createdAt: -1 }).lean();
    const returnTransactions = await PurchaseReturn.find({ supplier: new RegExp(supplierId, 'i') }).sort({ createdAt: -1 }).lean();

    ledgerEntries = [
      ...grnTransactions.map(g => ({
        date: new Date(g.createdAt).toISOString().split('T')[0],
        type: 'Purchase',
        refNo: g.grnNo,
        debit: g.totalAmt,
        credit: 0,
        balance: 0,
        _id: g._id,
      })),
      ...returnTransactions.map(r => ({
        date: new Date(r.createdAt).toISOString().split('T')[0],
        type: 'Return',
        refNo: r.returnNo,
        debit: 0,
        credit: r.totalAmt,
        balance: 0,
        _id: r._id,
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate running balance
    let balance = 0;
    ledgerEntries.forEach(entry => {
      balance += (entry.debit || 0) - (entry.credit || 0);
      entry.balance = balance;
    });
  }

  return res.status(200).json(new apiResponse(200, {
    suppliers: paginatedSuppliers,
    total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
    ledger: ledgerEntries,
    summary: {
      totalSuppliers: total,
      totalOutstanding: suppliers.reduce((s, sup) => s + sup.outstanding, 0),
      totalPurchase: suppliers.reduce((s, sup) => s + sup.totalPurchase, 0),
      totalReturns: suppliers.reduce((s, sup) => s + sup.totalReturns, 0),
    }
  }, 'Supplier ledger fetched'));
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
  const Supplier = getSupplierModel(req.db);
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);

  // Get all active suppliers
  const suppliers = await Supplier.find({ isActive: true }).lean();

  // Calculate outstanding for each supplier from purchase invoices
  const summary = await Promise.all(
    suppliers.map(async (s) => {
      const agg = await PurchaseInvoice.aggregate([
        { $match: { supplierId: s._id, status: { $nin: ['Cancelled', 'Returned'] } } },
        {
          $group: {
            _id: null,
            totalPurchase: { $sum: '$totalAmt' },
            totalPaid: { $sum: '$paidAmt' },
          }
        },
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


// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/purchase/supplier/:supplierId/medicines
// Get all medicines from a specific supplier (for bulk PO creation)
// ────────────────────────────────────────────────────────────────────────────
export const getSupplierMedicines = asyncHandler(async (req, res) => {
  const { supplierId } = req.params;

  // Fetch supplier from global Supplier model (where medicines are stored)
  const supplier = await Supplier.findById(supplierId).lean();

  if (!supplier) {
    return res.status(404).json(new apiResponse(404, null, 'Supplier not found'));
  }

  if (!supplier.medicines || supplier.medicines.length === 0) {
    return res.status(200).json(new apiResponse(200, { medicines: [] }, 'Supplier has no medicines'));
  }

  // Format medicines for frontend
  const medicines = supplier.medicines
    .filter(m => m.isAvailable && m.stock > 0) // Only available medicines with stock
    .map(m => ({
      _id: m._id,
      name: m.name,
      genericName: m.genericName || '',
      manufacturer: m.manufacturer || '',
      category: m.category,
      strength: m.strength || '',
      packSize: m.packSize || '',
      batchNumber: m.batchNumber,
      expiryDate: m.expiryDate,
      mrp: m.mrp,
      supplierPrice: m.supplierPrice, // Supplier's selling price to franchise
      discount: m.discount || 0,
      stock: m.stock,
      minStock: m.minStock || 0,
      description: m.description || '',
    }));

  return res.status(200).json(new apiResponse(200, {
    supplierId: supplier._id,
    supplierName: supplier.companyName,
    medicines,
    totalMedicines: medicines.length,
  }, 'Supplier medicines fetched successfully'));
});
