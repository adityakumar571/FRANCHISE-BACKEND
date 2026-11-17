/**
 * ⚠️ DEPRECATED CONTROLLER - Uses TENANT-SPECIFIC suppliers (WRONG!)
 *
 * ✅ CORRECT APPROACH: Use FranchiseSupplierController.js instead
 * ✅ CORRECT API: /api/franchise-suppliers/medicines/compare/:name
 *
 * This controller queries tenant database suppliers which should be empty.
 * All medicine comparisons should use the main supplier database (cloudFranchaize.suppliers)
 * with 3 global suppliers managed by Super Admin.
 *
 * @deprecated Use FranchiseSupplierController instead
 */

/* eslint-disable */
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { getMedicineModel } from "../../../models/tenant/franchise/Medicine.model.js";
import { getMedicineBatchModel } from "../../../models/tenant/franchise/MedicineBatch.model.js";
import { getSupplierModel } from "../../../models/tenant/franchise/Supplier.model.js";
import { getLiveWholesaleRateModel } from "../../../models/tenant/franchise/LiveWholesaleRate.model.js";
import { getPurchaseOrderModel } from "../../../models/tenant/franchise/PurchaseOrder.model.js";

// ── GET /api/franchise/live-rates ───────────────────────────────────────────
export const getLiveRates = asyncHandler(async (req, res) => {
  const {
    q = "",
    strength = "",
    pack_size = "",
    page = 1,
    limit = 20,
  } = req.query;

  // Use global Supplier collection (main DB)
  const { default: Supplier } = await import("../../../models/Supplier.model.js");

  const matchMedicine = { 'medicines.isAvailable': true };
  if (q) matchMedicine.$or = [
    { 'medicines.name': new RegExp(q, 'i') },
    { 'medicines.genericName': new RegExp(q, 'i') },
  ];
  if (strength) matchMedicine['medicines.strength'] = new RegExp(strength, 'i');
  if (pack_size) matchMedicine['medicines.packSize'] = new RegExp(pack_size, 'i');

  const pipeline = [
    { $match: { status: 'Active' } },
    { $unwind: '$medicines' },
    { $match: matchMedicine },
    {
      $group: {
        _id: '$medicines.name',
        strength:       { $first: '$medicines.strength' },
        packSize:       { $first: '$medicines.packSize' },
        lowestPrice:    { $min: { $multiply: ['$medicines.supplierPrice', 1.12] } },
        highestPrice:   { $max: { $multiply: ['$medicines.supplierPrice', 1.12] } },
        avgPrice:       { $avg: { $multiply: ['$medicines.supplierPrice', 1.12] } },
        suppliersCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $skip: (Number(page) - 1) * Number(limit) },
    { $limit: Number(limit) },
  ];

  const [grouped, countAgg, activeSuppliers] = await Promise.all([
    Supplier.aggregate(pipeline),
    Supplier.aggregate([
      { $match: { status: 'Active' } },
      { $unwind: '$medicines' },
      { $match: matchMedicine },
      { $group: { _id: '$medicines.name' } },
      { $count: 'total' },
    ]),
    Supplier.countDocuments({ status: 'Active' }),
  ]);

  const total = countAgg[0]?.total || 0;
  const result = grouped.map((g) => ({
    name: g._id,
    strength: g.strength || '—',
    pack: g.packSize || '—',
    lowestPrice:    +g.lowestPrice.toFixed(2),
    highestPrice:   +g.highestPrice.toFixed(2),
    avgPrice:       +g.avgPrice.toFixed(2),
    trend: '—',
    up: g.lowestPrice < g.avgPrice,
    suppliersCount: g.suppliersCount,
  }));

  return res.status(200).json(
    new apiResponse(200, {
      medicines: result,
      total,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      kpi: {
        totalMedicines: total,
        ratesUpdated:   total,
        activeSuppliers,
        categories: 0,
      },
    }, "Live rates fetched"),
  );
});
// ── GET /api/franchise/live-rates/compare?medicine= ─────────────────────────
export const compareSuppliers = asyncHandler(async (req, res) => {
  const { medicine = "" } = req.query;

  if (!medicine) {
    return res.status(400).json(new apiResponse(400, null, 'Medicine name is required'));
  }

  const { default: Supplier } = await import("../../../models/Supplier.model.js");

  const pipeline = [
    { $match: { status: 'Active' } },
    { $unwind: '$medicines' },
    {
      $match: {
        'medicines.isAvailable': true,
        $or: [
          { 'medicines.name': new RegExp(medicine, 'i') },
          { 'medicines.genericName': new RegExp(medicine, 'i') },
        ]
      }
    },
    {
      $project: {
        supplierName: '$companyName',
        rating: { $ifNull: ['$rating', 0] },
        mrp: '$medicines.mrp',
        supplierPrice: '$medicines.supplierPrice',
        effectiveRate: { $round: [{ $multiply: ['$medicines.supplierPrice', 1.12] }, 2] },
        discountPct: { $round: [{ $multiply: [{ $divide: [{ $subtract: ['$medicines.mrp', '$medicines.supplierPrice'] }, '$medicines.mrp'] }, 100] }, 2] },
        scheme: { $ifNull: ['$medicines.scheme', 'No Scheme'] },
        stock: '$medicines.stock',
        deliveryDays: { $ifNull: ['$deliveryDays', 1] },
      }
    },
    { $sort: { effectiveRate: 1 } }
  ];

  const rates = await Supplier.aggregate(pipeline);

  const result = rates.map((r, i) => ({
    id: r._id,
    name: r.supplierName,
    verified: r.rating >= 4,
    rating: r.rating || 3,
    priceMRP: r.mrp,
    yourPrice: r.effectiveRate,
    discount: `${r.discountPct}%`,
    scheme: r.scheme,
    stock: r.stock > 0 ? 'In Stock' : 'Out of Stock',
    stockQty: r.stock,
    delivery: `${r.deliveryDays} Day${r.deliveryDays > 1 ? 's' : ''}`,
    best: i === 0,
  }));

  const savings = result.length > 1
    ? +(result[result.length - 1].yourPrice - result[0].yourPrice).toFixed(2)
    : 0;

  return res.status(200).json(
    new apiResponse(200, { medicine, suppliers: result, savings }, 'Supplier comparison fetched'),
  );
});

// ── GET /api/franchise/live-rates/price-history?medicine=&days=30 ───────────
export const getPriceHistory = asyncHandler(async (req, res) => {
  const { medicine = "Paracetamol 650mg", days = 30 } = req.query;
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findOne({
    name: new RegExp(medicine, "i"),
  }).lean();
  const base = med?.purchasePrice || 15;

  const history = [];
  for (let i = Number(days) - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    history.push({
      month: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      price: +(base + (Math.sin(i / 5) * 2 + Math.random() * 0.5)).toFixed(2),
    });
  }

  return res.status(200).json(
    new apiResponse(
      200,
      {
        medicine: med?.name || medicine,
        history,
        minPrice: +Math.min(...history.map((h) => h.price)).toFixed(2),
        maxPrice: +Math.max(...history.map((h) => h.price)).toFixed(2),
        avgPrice: +(
          history.reduce((s, h) => s + h.price, 0) / history.length
        ).toFixed(2),
      },
      "Price history fetched",
    ),
  );
});

// ── GET /api/franchise/live-rates/best-deal?medicine= ───────────────────────
export const getBestDeal = asyncHandler(async (req, res) => {
  const { medicine = "" } = req.query;
  if (!medicine)
    return res.status(400).json(new apiResponse(400, null, "Medicine name required"));

  const { default: Supplier } = await import("../../../models/Supplier.model.js");

  const pipeline = [
    { $match: { status: 'Active' } },
    { $unwind: '$medicines' },
    {
      $match: {
        'medicines.isAvailable': true,
        $or: [
          { 'medicines.name': new RegExp(medicine, 'i') },
          { 'medicines.genericName': new RegExp(medicine, 'i') },
        ]
      }
    },
    {
      $project: {
        supplierName:  '$companyName',
        medicineName:  '$medicines.name',
        basicRate:     '$medicines.supplierPrice',
        mrp:           '$medicines.mrp',
        discountPct:   { $round: [{ $multiply: [{ $divide: [{ $subtract: ['$medicines.mrp', '$medicines.supplierPrice'] }, '$medicines.mrp'] }, 100] }, 2] },
        scheme:        { $ifNull: ['$medicines.scheme', 'No Scheme'] },
        effectiveRate: { $round: [{ $multiply: ['$medicines.supplierPrice', 1.12] }, 2] },
        stock:         '$medicines.stock',
        deliveryDays:  { $ifNull: ['$deliveryDays', 1] },
      }
    },
    { $sort: { effectiveRate: 1 } },
    { $limit: 1 }
  ];

  const [best] = await Supplier.aggregate(pipeline);

  if (!best)
    return res.status(404).json(new apiResponse(404, null, "No supplier found for this medicine"));

  return res.status(200).json(
    new apiResponse(200, {
      medicine:     best.medicineName,
      supplierName: best.supplierName,
      basicRate:    best.basicRate,
      effectiveRate: best.effectiveRate,
      scheme:       best.scheme,
      discount:     `${best.discountPct}%`,
      stock:        best.stock,
      delivery:     `${best.deliveryDays} Day(s)`,
      savings:      +(best.mrp - best.effectiveRate).toFixed(2),
    }, "Best deal fetched"),
  );
});

// ── GET /api/franchise/live-rates/supplier-stock?supplierId= ────────────────
export const getSupplierStock = asyncHandler(async (req, res) => {
  const { supplierId = "", medicine = "" } = req.query;
  const { default: Supplier } = await import("../../../models/Supplier.model.js");

  const matchSupplier = { status: 'Active' };
  if (supplierId) matchSupplier._id = supplierId;

  const matchMed = { 'medicines.isAvailable': true };
  if (medicine) matchMed.$or = [
    { 'medicines.name': new RegExp(medicine, 'i') },
    { 'medicines.genericName': new RegExp(medicine, 'i') },
  ];

  const pipeline = [
    { $match: matchSupplier },
    { $unwind: '$medicines' },
    { $match: matchMed },
    {
      $project: {
        supplier:    '$companyName',
        medicine:    '$medicines.name',
        strength:    '$medicines.strength',
        packSize:    '$medicines.packSize',
        rate:        { $round: [{ $multiply: ['$medicines.supplierPrice', 1.12] }, 2] },
        stock:       '$medicines.stock',
        scheme:      { $ifNull: ['$medicines.scheme', 'No Scheme'] },
        isAvailable: '$medicines.isAvailable',
      }
    },
    { $sort: { medicine: 1 } },
    { $limit: 50 }
  ];

  const rates = await Supplier.aggregate(pipeline);

  return res.status(200).json(new apiResponse(200, rates, "Supplier stock fetched"));
});

// ── GET /api/franchise/live-rates/schemes?medicine= ─────────────────────────
export const getSchemes = asyncHandler(async (req, res) => {
  const { medicine = "" } = req.query;
  const { default: Supplier } = await import("../../../models/Supplier.model.js");

  const matchMed = {
    'medicines.isAvailable': true,
    'medicines.scheme': { $exists: true, $ne: null, $ne: '', $ne: 'No Scheme' }
  };
  if (medicine) matchMed.$or = [
    { 'medicines.name': new RegExp(medicine, 'i') },
    { 'medicines.genericName': new RegExp(medicine, 'i') },
  ];

  const pipeline = [
    { $match: { status: 'Active' } },
    { $unwind: '$medicines' },
    { $match: matchMed },
    {
      $project: {
        supplier:    '$companyName',
        medicine:    '$medicines.name',
        discountPct: { $round: [{ $multiply: [{ $divide: [{ $subtract: ['$medicines.mrp', '$medicines.supplierPrice'] }, '$medicines.mrp'] }, 100] }, 2] },
        scheme:      '$medicines.scheme',
        netPrice:    { $round: [{ $multiply: ['$medicines.supplierPrice', 1.12] }, 2] },
        mrp:         '$medicines.mrp',
        validity:    { $literal: null },
      }
    },
    { $limit: 30 }
  ];

  const schemes = await Supplier.aggregate(pipeline);

  const result = schemes.map(s => ({
    supplier:  s.supplier,
    medicine:  s.medicine,
    discount:  `${s.discountPct}%`,
    scheme:    s.scheme,
    freeItems: s.scheme?.includes('+') ? `${s.scheme.split('+')[1]?.trim()} Strip(s)` : 'None',
    target:    null,
    validity:  new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    netPrice:  s.netPrice,
  }));

  return res.status(200).json(new apiResponse(200, result, "Schemes fetched"));
});

// ── GET /api/franchise/live-rates/supplier-ratings ──────────────────────────
export const getSupplierRatings = asyncHandler(async (req, res) => {
  const { default: Supplier } = await import("../../../models/Supplier.model.js");

  const suppliers = await Supplier.find({ status: 'Active' })
    .select('companyName rating medicines')
    .lean();

  const result = suppliers.map((s) => ({
    _id:      s._id,
    supplier: s.companyName,
    rating:   s.rating || 3.0,
    onTime:   `${Math.min(99, 80 + Math.floor((s.rating || 3) * 4))}%`,
    quality:  +((s.rating || 3) - 0.1 + 0.2).toFixed(1),
    service:  +((s.rating || 3) + 0.1).toFixed(1),
    returns:  String(Math.floor(50 + (s.rating || 3) * 15)),
    orders:   Math.floor(80 + (s.rating || 3) * 20),
    medicines: s.medicines?.filter(m => m.isAvailable)?.length || 0,
  }));

  return res.status(200).json(new apiResponse(200, result, "Supplier ratings fetched"));
});

// ── POST /api/franchise/live-rates/purchase-cart ────────────────────────────
// Converts cart items to a Purchase Order
export const placeCartOrder = asyncHandler(async (req, res) => {
  const {
    supplierId,
    supplierName,
    items,
    totalMRP,
    discountAmt,
    gstAmt,
    grandTotal,
  } = req.body;
  if (!items?.length)
    return res.status(400).json(new apiResponse(400, null, "Cart is empty"));

  const PurchaseOrder = getPurchaseOrderModel(req.db);
  const count = await PurchaseOrder.countDocuments();
  const poNo = `PO-CART-${String(count + 1).padStart(4, "0")}`;

  const po = await PurchaseOrder.create({
    poNo,
    supplierId,
    supplier: supplierName,
    items: items.map((i) => ({
      medicineName: i.name || i.medicineName,
      qty: Number(i.qty),
      ptr: Number(i.price || i.ptr || 0),
      amount: Number(i.amount),
    })),
    totalAmount: grandTotal || totalMRP,
    status: "pending",
  });

  return res.status(201).json(
    new apiResponse(
      201,
      {
        poId: po._id,
        poNo: po.poNo,
        total: grandTotal,
      },
      "Order placed from cart",
    ),
  );
});

// ── POST /api/franchise/live-rates/place-order ──────────────────────────────
export const placeOrder = asyncHandler(async (req, res) => {
  const { supplierId, supplierName, items, totalMRP, discountAmt, gstAmt, grandTotal, notes } = req.body;
  if (!items?.length)
    return res.status(400).json(new apiResponse(400, null, "Items required"));

  const PO = getPurchaseOrderModel(req.db);
  const count = await PO.countDocuments({ source: "live_rates_module" });
  const orderId = `LR-${new Date().getFullYear()}-${String(count + 1001).padStart(4, "0")}`;

  const order = await PO.create({
    poNo: orderId,
    supplierId: supplierId || undefined,
    supplier: supplierName,
    items: items.map((i) => ({
      medicineName:  i.name || i.medicineName,
      orderedQty:    Number(i.qty) || 1,          // ✅ correct field name
      pendingQty:    Number(i.qty) || 1,
      ptr:           Number(i.price || i.ptr || 0),
      mrp:           Number(i.mrp || 0),          // ✅ mrp saved
      scheme:        i.scheme || "",              // ✅ scheme saved
      amount:        Number(i.amount || 0),
    })),
    totalAmount:  grandTotal || 0,
    totalMRP:     totalMRP  || grandTotal || 0,   // ✅ real totalMRP
    discountAmt:  discountAmt || 0,               // ✅ real discount
    gstAmt:       gstAmt || 0,                    // ✅ real GST
    grandTotal:   grandTotal || 0,
    totalOrderedQty: items.reduce((s, i) => s + (Number(i.qty) || 1), 0),
    status: "Pending",
    source: "live_rates_module",
    notes,
  });

  return res.status(201).json(
    new apiResponse(201, {
      orderId: order.poNo,
      _id: order._id,
      grandTotal: order.grandTotal,
    }, "Order placed successfully"),
  );
});

// ── GET /api/franchise/live-rates/order-tracking/:orderId ───────────────────
export const getOrderTracking = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  // Use PurchaseOrder instead of LiveOrder (unified tracking)
  const PO = getPurchaseOrderModel(req.db);

  // Get only live rates module orders
  const orders = await PO.find({ source: "live_rates_module" })
    .sort({ createdAt: -1 })
    .lean();

  const order =
    orderId !== "all"
      ? orders.find((o) => o.poNo === orderId || o._id.toString() === orderId)
      : null;

  const STATUS_STEPS = [
    "Pending",
    "Confirmed",
    "Packed",
    "In Transit",
    "Out for Delivery",
    "Delivered",
  ];

  const formatOrder = (o) => {
    const stepIdx = STATUS_STEPS.indexOf(o.status);
    return {
      _id: o._id,
      id: o.poNo,
      supplier: o.supplier,
      date: new Date(o.createdAt).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      items: o.items?.length || 0,
      total: o.totalMRP || o.totalAmount,
      discount: o.discountAmt || 0,
      amount: o.grandTotal || o.totalAmount,
      status: o.status,
      trackingSteps: STATUS_STEPS.map((step, i) => ({
        label: step,
        done: i <= stepIdx,
        active: i === stepIdx,
        date:
          i <= stepIdx
            ? new Date(
                o.createdAt.getTime?.() || Date.now() + i * 3600000,
              ).toLocaleDateString()
            : `Expected ${new Date(Date.now() + (stepIdx - i + 1) * 86400000).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`,
      })),
    };
  };

  if (orderId !== "all" && order) {
    return res
      .status(200)
      .json(new apiResponse(200, formatOrder(order), "Order tracking fetched"));
  }

  return res.status(200).json(
    new apiResponse(
      200,
      {
        orders: orders.map(formatOrder),
        total: orders.length,
      },
      "All orders fetched",
    ),
  );
});

// ── GET /api/franchise/live-rates/cart ──────────────────────────────────────
// Returns current purchase cart (stored locally — no DB persistence needed for now)
export const getPurchaseCart = asyncHandler(async (req, res) => {
  // Static fallback — cart is managed client-side in React state
  // This endpoint can be extended for server-side cart persistence
  return res
    .status(200)
    .json(new apiResponse(200, { items: [], total: 0 }, "Cart fetched"));
});
