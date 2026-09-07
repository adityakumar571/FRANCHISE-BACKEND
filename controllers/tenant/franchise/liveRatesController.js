/* eslint-disable */
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getMedicineModel } from '../../../models/tenant/franchise/Medicine.model.js';
import { getMedicineBatchModel } from '../../../models/tenant/franchise/MedicineBatch.model.js';
import { getSupplierModel } from '../../../models/tenant/franchise/Supplier.model.js';
import { getLiveWholesaleRateModel } from '../../../models/tenant/franchise/LiveWholesaleRate.model.js';
import { getLiveOrderModel } from '../../../models/tenant/franchise/LiveOrder.model.js';
import { getPurchaseOrderModel } from '../../../models/tenant/franchise/PurchaseOrder.model.js';

// ── Seed live rates ──────────────────────────────────────────────────────────
const seedLiveRates = async (db) => {
  const LWR = getLiveWholesaleRateModel(db);
  if (await LWR.countDocuments() > 0) return;
  const Medicine = getMedicineModel(db);
  const Supplier  = getSupplierModel(db);
  const meds = await Medicine.find({ isActive: true }).limit(8).lean();
  const sups = await Supplier.find({ isActive: true }).limit(5).lean();
  if (!meds.length || !sups.length) return;

  const schemes = ['10+1', '5+1', '10+2', 'No Scheme', '6+1'];
  const deliveries = [1, 1, 2, 3, 2];
  const docs = [];
  for (const med of meds) {
    for (let i = 0; i < Math.min(sups.length, 4); i++) {
      const s = sups[i];
      const base = +(med.purchasePrice * (1 + i * 0.03)).toFixed(2);
      const gst  = +(base * med.gstPercent / 100).toFixed(2);
      docs.push({
        medicineId:    med._id,
        medicineName:  med.name,
        strength:      med.strength || '',
        packSize:      med.packSize || '',
        supplierId:    s._id,
        supplierName:  s.name,
        basicRate:     base,
        mrp:           med.mrp,
        discountPct:   [12, 10, 8, 6][i] || 5,
        scheme:        schemes[i],
        gstPct:        med.gstPercent,
        effectiveRate: +(base + gst).toFixed(2),
        stock:         [120, 85, 200, 60][i] || 50,
        deliveryDays:  deliveries[i],
        isActive:      true,
      });
    }
  }
  await LWR.insertMany(docs);
};

const seedLiveOrders = async (db) => {
  const LO = getLiveOrderModel(db);
  if (await LO.countDocuments() > 0) return;
  const Supplier = getSupplierModel(db);
  const sups = await Supplier.find().limit(4).lean();
  if (!sups.length) return;
  await LO.insertMany([
    { orderId: 'PO-2025-5862', supplierName: sups[0]?.name || 'Medico Agency',          items: [{medicineName:'Paracetamol 650mg',qty:50,price:15.95,amount:680}],  totalMRP:3000, discountAmt:300, gstAmt:120, grandTotal:2820, status:'In Transit',   createdAt: new Date(Date.now()-1*86400000) },
    { orderId: 'PO-2025-5841', supplierName: sups[1]?.name || 'Life Care Distributors', items: [{medicineName:'Azithral 500 Tablet',qty:30,price:43,amount:1161.8}], totalMRP:5600, discountAmt:450, gstAmt:200, grandTotal:5350, status:'Delivered',    createdAt: new Date(Date.now()-3*86400000) },
    { orderId: 'PO-2025-5820', supplierName: sups[2]?.name || 'Apollo Pharma',          items: [{medicineName:'Amoxicillin 500mg',qty:10,price:28,amount:492.8}],   totalMRP:1200, discountAmt:120, gstAmt:80,  grandTotal:1160, status:'Pending',      createdAt: new Date(Date.now()-6*86400000) },
    { orderId: 'PO-2025-5801', supplierName: sups[3]?.name || 'Sunrise Pharmaceuticals',items: [{medicineName:'Metformin 500mg',qty:100,price:8,amount:800}],        totalMRP:8900, discountAmt:700, gstAmt:350, grandTotal:8550, status:'Delivered',    createdAt: new Date(Date.now()-11*86400000) },
  ]);
};

// ── GET /api/franchise/live-rates ───────────────────────────────────────────
export const getLiveRates = asyncHandler(async (req, res) => {
  await seedLiveRates(req.db);
  const { q = '', strength = '', pack_size = '', page = 1, limit = 20 } = req.query;
  const LWR = getLiveWholesaleRateModel(req.db);

  const filter = { isActive: true };
  if (q)         filter.medicineName = new RegExp(q, 'i');
  if (strength)  filter.strength     = new RegExp(strength, 'i');
  if (pack_size) filter.packSize     = new RegExp(pack_size, 'i');

  const skip = (Number(page) - 1) * Number(limit);
  const pipeline = [
    { $match: filter },
    { $group: {
      _id: '$medicineName',
      strength:     { $first: '$strength' },
      packSize:     { $first: '$packSize' },
      lowestPrice:  { $min: '$effectiveRate' },
      highestPrice: { $max: '$effectiveRate' },
      avgPrice:     { $avg: '$effectiveRate' },
      suppliersCount: { $sum: 1 },
    }},
    { $sort: { _id: 1 } },
    { $skip: skip },
    { $limit: Number(limit) },
  ];

  const [grouped, countAgg] = await Promise.all([
    LWR.aggregate(pipeline),
    LWR.aggregate([{ $match: filter }, { $group: { _id: '$medicineName' } }, { $count: 'total' }]),
  ]);

  const total = countAgg[0]?.total || 0;
  const result = grouped.map(g => ({
    name:         g._id,
    strength:     g.strength,
    pack:         g.packSize,
    lowestPrice:  +g.lowestPrice.toFixed(2),
    highestPrice: +g.highestPrice.toFixed(2),
    avgPrice:     +g.avgPrice.toFixed(2),
    trend:        Math.random() > 0.5 ? `+${(Math.random()*3+0.5).toFixed(1)}%` : `-${(Math.random()*2+0.3).toFixed(1)}%`,
    up:           Math.random() > 0.4,
    suppliersCount: g.suppliersCount,
  }));

  return res.status(200).json(new apiResponse(200, {
    medicines: result, total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
    kpi: {
      totalMedicines:  await LWR.distinct('medicineName').then(a => a.length),
      ratesUpdated:    await LWR.countDocuments({ isActive: true }),
      activeSuppliers: await LWR.distinct('supplierName').then(a => a.length),
      categories:      24,
    },
  }, 'Live rates fetched'));
});

// ── GET /api/franchise/live-rates/compare?medicine= ─────────────────────────
export const compareSuppliers = asyncHandler(async (req, res) => {
  await seedLiveRates(req.db);
  const { medicine = '' } = req.query;
  const LWR = getLiveWholesaleRateModel(req.db);

  const rates = await LWR.find({ medicineName: new RegExp(medicine, 'i'), isActive: true })
    .populate('supplierId', 'isVerified rating')
    .sort({ effectiveRate: 1 })
    .lean();

  const result = rates.map((r, i) => ({
    id:           r._id,
    supplierId:   r.supplierId?._id,
    name:         r.supplierName,
    verified:     r.supplierId?.isVerified || false,
    rating:       r.supplierId?.rating || 4.0,
    priceMRP:     r.mrp,
    yourPrice:    r.effectiveRate,
    discount:     `${r.discountPct}%`,
    scheme:       r.scheme,
    stock:        r.stock > 0 ? 'In Stock' : 'Out of Stock',
    stockQty:     r.stock,
    delivery:     `${r.deliveryDays} Day${r.deliveryDays > 1 ? 's' : ''}`,
    best:         i === 0,
  }));

  const savings = result.length > 1 ? +(result[result.length - 1].yourPrice - result[0].yourPrice).toFixed(2) : 0;

  return res.status(200).json(new apiResponse(200, { medicine, suppliers: result, savings }, 'Supplier comparison fetched'));
});

// ── GET /api/franchise/live-rates/price-history?medicine=&days=30 ───────────
export const getPriceHistory = asyncHandler(async (req, res) => {
  const { medicine = 'Paracetamol 650mg', days = 30 } = req.query;
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findOne({ name: new RegExp(medicine, 'i') }).lean();
  const base = med?.purchasePrice || 15;

  const history = [];
  for (let i = Number(days) - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    history.push({
      month: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      price: +(base + (Math.sin(i / 5) * 2 + Math.random() * 0.5)).toFixed(2),
    });
  }

  return res.status(200).json(new apiResponse(200, {
    medicine: med?.name || medicine,
    history,
    minPrice: +(Math.min(...history.map(h => h.price))).toFixed(2),
    maxPrice: +(Math.max(...history.map(h => h.price))).toFixed(2),
    avgPrice: +(history.reduce((s, h) => s + h.price, 0) / history.length).toFixed(2),
  }, 'Price history fetched'));
});

// ── GET /api/franchise/live-rates/best-deal?medicine= ───────────────────────
export const getBestDeal = asyncHandler(async (req, res) => {
  await seedLiveRates(req.db);
  const { medicine = '' } = req.query;
  const LWR = getLiveWholesaleRateModel(req.db);

  const best = await LWR.findOne({ medicineName: new RegExp(medicine, 'i'), isActive: true })
    .sort({ effectiveRate: 1 }).lean();

  if (!best) return res.status(404).json(new apiResponse(404, null, 'No rates found'));

  return res.status(200).json(new apiResponse(200, {
    medicine:     best.medicineName,
    supplierName: best.supplierName,
    basicRate:    best.basicRate,
    effectiveRate:best.effectiveRate,
    scheme:       best.scheme,
    discount:     `${best.discountPct}%`,
    stock:        best.stock,
    delivery:     `${best.deliveryDays} Day(s)`,
    savings:      +(best.mrp - best.effectiveRate).toFixed(2),
  }, 'Best deal fetched'));
});

// ── GET /api/franchise/live-rates/supplier-stock?supplierId= ────────────────
export const getSupplierStock = asyncHandler(async (req, res) => {
  await seedLiveRates(req.db);
  const { supplierId = '' } = req.query;
  const LWR = getLiveWholesaleRateModel(req.db);

  const filter = { isActive: true };
  if (supplierId) filter.supplierId = supplierId;
  const rates = await LWR.find(filter).limit(30).lean();

  return res.status(200).json(new apiResponse(200, rates.map(r => ({
    medicine: r.medicineName, strength: r.strength, packSize: r.packSize,
    rate: r.effectiveRate, stock: r.stock, scheme: r.scheme,
  })), 'Supplier stock fetched'));
});

// ── GET /api/franchise/live-rates/schemes?medicine= ─────────────────────────
export const getSchemes = asyncHandler(async (req, res) => {
  await seedLiveRates(req.db);
  const { medicine = '' } = req.query;
  const LWR = getLiveWholesaleRateModel(req.db);
  const filter = { isActive: true, scheme: { $ne: 'No Scheme' } };
  if (medicine) filter.medicineName = new RegExp(medicine, 'i');

  const rates = await LWR.find(filter).limit(20).lean();
  const result = rates.map(r => ({
    supplier:    r.supplierName,
    medicine:    r.medicineName,
    discount:    `${r.discountPct}%`,
    scheme:      r.scheme,
    freeItems:   r.scheme?.includes('+') ? `${r.scheme.split('+')[1]} Strip(s)` : 'None',
    target:      null,
    validity:    new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    netPrice:    +(r.effectiveRate * (1 - r.discountPct / 100)).toFixed(2),
  }));

  return res.status(200).json(new apiResponse(200, result, 'Schemes fetched'));
});

// ── GET /api/franchise/live-rates/supplier-ratings ──────────────────────────
export const getSupplierRatings = asyncHandler(async (req, res) => {
  const Supplier = getSupplierModel(req.db);
  const suppliers = await Supplier.find({ isActive: true }).lean();

  const result = suppliers.map(s => ({
    _id:      s._id,
    supplier: s.name,
    rating:   s.rating || 4.0,
    onTime:   `${85 + Math.floor(s.rating * 2)}%`,
    quality:  +((s.rating - 0.1 + Math.random() * 0.2).toFixed(1)),
    service:  +((s.rating + Math.random() * 0.2 - 0.1).toFixed(1)),
    returns:  String(Math.floor(60 + s.rating * 20)),
    orders:   Math.floor(100 + s.rating * 30),
  }));

  return res.status(200).json(new apiResponse(200, result, 'Supplier ratings fetched'));
});

// ── POST /api/franchise/live-rates/purchase-cart ────────────────────────────
// Converts cart items to a Purchase Order
export const placeCartOrder = asyncHandler(async (req, res) => {
  const { supplierId, supplierName, items, totalMRP, discountAmt, gstAmt, grandTotal } = req.body;
  if (!items?.length) return res.status(400).json(new apiResponse(400, null, 'Cart is empty'));

  const PurchaseOrder = getPurchaseOrderModel(req.db);
  const count = await PurchaseOrder.countDocuments();
  const poNo  = `PO-CART-${String(count + 1).padStart(4, '0')}`;

  const po = await PurchaseOrder.create({
    poNo, supplierId, supplier: supplierName,
    items: items.map(i => ({
      medicineName: i.name || i.medicineName,
      qty:          Number(i.qty),
      ptr:          Number(i.price || i.ptr || 0),
      amount:       Number(i.amount),
    })),
    totalAmount: grandTotal || totalMRP,
    status: 'pending',
  });

  return res.status(201).json(new apiResponse(201, {
    poId:  po._id,
    poNo:  po.poNo,
    total: grandTotal,
  }, 'Order placed from cart'));
});

// ── POST /api/franchise/live-rates/place-order ──────────────────────────────
export const placeOrder = asyncHandler(async (req, res) => {
  const { supplierId, supplierName, items, grandTotal, notes } = req.body;
  if (!items?.length) return res.status(400).json(new apiResponse(400, null, 'Items required'));

  const LO    = getLiveOrderModel(req.db);
  const count = await LO.countDocuments();
  const orderId = `PO-${new Date().getFullYear()}-${String(count + 5901).padStart(4, '0')}`;

  const order = await LO.create({
    orderId, supplierId, supplierName,
    items: items.map(i => ({
      medicineName: i.name || i.medicineName,
      packSize:     i.pack || i.packSize || '',
      qty:          Number(i.qty),
      price:        Number(i.price || 0),
      amount:       Number(i.amount || 0),
    })),
    totalMRP:    grandTotal,
    discountAmt: 0,
    gstAmt:      0,
    grandTotal,
    status: 'Pending', notes,
  });

  return res.status(201).json(new apiResponse(201, {
    orderId:    order.orderId,
    _id:        order._id,
    grandTotal: order.grandTotal,
  }, 'Order placed successfully'));
});

// ── GET /api/franchise/live-rates/order-tracking/:orderId ───────────────────
export const getOrderTracking = asyncHandler(async (req, res) => {
  await seedLiveOrders(req.db);
  const { orderId } = req.params;
  const LO = getLiveOrderModel(req.db);

  const orders = await LO.find().sort({ createdAt: -1 }).lean();

  const order = orderId !== 'all'
    ? orders.find(o => o.orderId === orderId || o._id.toString() === orderId)
    : null;

  const STATUS_STEPS = ['Pending', 'Confirmed', 'Packed', 'In Transit', 'Out for Delivery', 'Delivered'];

  const formatOrder = (o) => {
    const stepIdx = STATUS_STEPS.indexOf(o.status);
    return {
      _id:          o._id,
      id:           o.orderId,
      supplier:     o.supplierName,
      date:         new Date(o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      items:        o.items?.length || 0,
      total:        o.totalMRP,
      discount:     o.discountAmt,
      amount:       o.grandTotal,
      status:       o.status,
      trackingSteps: STATUS_STEPS.map((step, i) => ({
        label:  step,
        done:   i <= stepIdx,
        active: i === stepIdx,
        date:   i <= stepIdx
          ? new Date(o.createdAt.getTime?.() || Date.now() + i * 3600000).toLocaleDateString()
          : `Expected ${new Date(Date.now() + (stepIdx - i + 1) * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`,
      })),
    };
  };

  if (orderId !== 'all' && order) {
    return res.status(200).json(new apiResponse(200, formatOrder(order), 'Order tracking fetched'));
  }

  return res.status(200).json(new apiResponse(200, {
    orders: orders.map(formatOrder),
    total:  orders.length,
  }, 'All orders fetched'));
});

// ── GET /api/franchise/live-rates/cart ──────────────────────────────────────
// Returns current purchase cart (stored locally — no DB persistence needed for now)
export const getPurchaseCart = asyncHandler(async (req, res) => {
  // Static fallback — cart is managed client-side in React state
  // This endpoint can be extended for server-side cart persistence
  return res.status(200).json(new apiResponse(200, { items: [], total: 0 }, 'Cart fetched'));
});
