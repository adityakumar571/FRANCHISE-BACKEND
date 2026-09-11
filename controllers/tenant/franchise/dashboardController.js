/* eslint-disable */
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getMedicineModel } from '../../../models/tenant/franchise/Medicine.model.js';
import { getMedicineBatchModel } from '../../../models/tenant/franchise/MedicineBatch.model.js';
import { getSaleInvoiceModel } from '../../../models/tenant/franchise/SaleInvoice.model.js';
import { getPurchaseInvoiceModel } from '../../../models/tenant/franchise/PurchaseInvoice.model.js';

// ────────────────────────────────────────────────────────────────────────────
// Seed dummy data if collections are empty (development helper)
// ────────────────────────────────────────────────────────────────────────────
const seedDummyData = async (db) => {
  const Medicine = getMedicineModel(db);
  const MedicineBatch = getMedicineBatchModel(db);
  const SaleInvoice = getSaleInvoiceModel(db);
  const PurchaseInvoice = getPurchaseInvoiceModel(db);
  const { getSupplierModel } = await import('../../../models/tenant/franchise/Supplier.model.js');
  const Supplier = getSupplierModel(db);
  const { getCustomerModel } = await import('../../../models/tenant/franchise/Customer.model.js');
  const Customer = getCustomerModel(db);

  const medCount = await Medicine.countDocuments();
  if (medCount > 0) return; // Already seeded

  // ── Suppliers ──
  const suppliers = await Supplier.insertMany([
    { name: 'Gupta Pharma',           supplierCode: 'SUP001', phone: '9800012301', city: 'Delhi',   isVerified: true,  rating: 4.8, isActive: true },
    { name: 'R.K. Distributors',      supplierCode: 'SUP002', phone: '9800012302', city: 'Mumbai',  isVerified: true,  rating: 4.6, isActive: true },
    { name: 'Medico Agency',          supplierCode: 'SUP003', phone: '9800012303', city: 'Kolkata', isVerified: true,  rating: 4.5, isActive: true },
    { name: 'Health Distributor',     supplierCode: 'SUP004', phone: '9800012304', city: 'Chennai', isVerified: true,  rating: 4.3, isActive: true },
    { name: 'Shree Pharma',           supplierCode: 'SUP005', phone: '9800012305', city: 'Pune',    isVerified: false, rating: 4.2, isActive: true },
    { name: 'MedPlus Pharma',         supplierCode: 'SUP006', phone: '9800012306', city: 'Hyderabad', isVerified: true, rating: 4.7, isActive: true },
    { name: 'HealthCare Distributors',supplierCode: 'SUP007', phone: '9800012307', city: 'Bangalore', isVerified: true, rating: 4.4, isActive: true },
  ]);

  // ── Customers ──
  const customers = await Customer.insertMany([
    { name: 'Walk-in Customer', customerId: 'CUS000', phone: '0000000000', tier: 'Regular', isActive: true },
    { name: 'Rahul Sharma',     customerId: 'CUS001', phone: '9876543210', email: 'rahul@email.com', tier: 'Gold',     totalPurchase: 45600, isActive: true },
    { name: 'Priya Verma',      customerId: 'CUS002', phone: '9876543211', email: 'priya@email.com', tier: 'Silver',   totalPurchase: 28900, isActive: true },
    { name: 'Amit Kumar',       customerId: 'CUS003', phone: '9876543212', email: 'amit@email.com',  tier: 'Regular',  totalPurchase: 12400, isActive: true },
    { name: 'Sunita Singh',     customerId: 'CUS004', phone: '9876543213', email: 'sunita@email.com',tier: 'Platinum', totalPurchase: 85000, isActive: true },
    { name: 'Deepak Joshi',     customerId: 'CUS005', phone: '9876543214', tier: 'Regular',  totalPurchase: 5600,  isActive: true },
  ]);

  // ── Medicines ──
  const meds = await Medicine.insertMany([
    { name: 'Clavm 625 Tablet',     genericName: 'Amoxicillin + Clavulanic Acid', salt: 'Amoxicillin 500mg + Clavulanic Acid 125mg', strength: '625mg',  formulation: 'Tablet',  category: 'Antibiotic',     company: 'GSK',         packSize: 'Strip of 10', mrp: 210.00, purchasePrice: 63.00, gstPercent: 12, currentStock: 180, reorderLevel: 20, barcode: '8901234560001', isActive: true },
    { name: 'Dolo 650 Tablet',      genericName: 'Paracetamol',                    salt: 'Paracetamol 650mg',                          strength: '650mg',  formulation: 'Tablet',  category: 'Analgesic',      company: 'Micro Labs',   packSize: 'Strip of 15', mrp: 32.50,  purchasePrice: 17.20, gstPercent: 5,  currentStock: 12,  reorderLevel: 50, barcode: '8901234560002', isActive: true },
    { name: 'Calpol 650 Tablet',    genericName: 'Paracetamol',                    salt: 'Paracetamol 650mg',                          strength: '650mg',  formulation: 'Tablet',  category: 'Analgesic',      company: 'GSK',         packSize: 'Strip of 15', mrp: 30.00,  purchasePrice: 16.00, gstPercent: 5,  currentStock: 95,  reorderLevel: 30, barcode: '8901234560003', isActive: true },
    { name: 'Azithral 500 Tablet',  genericName: 'Azithromycin',                   salt: 'Azithromycin 500mg',                         strength: '500mg',  formulation: 'Tablet',  category: 'Antibiotic',     company: 'Alembic',     packSize: 'Strip of 3',  mrp: 85.00,  purchasePrice: 45.00, gstPercent: 12, currentStock: 8,   reorderLevel: 15, barcode: '8901234560004', isActive: true },
    { name: 'Pantop DSR Capsule',   genericName: 'Pantoprazole + Domperidone',     salt: 'Pantoprazole 40mg + Domperidone 10mg',       strength: '40mg',   formulation: 'Capsule', category: 'GI',             company: 'Aristo',      packSize: 'Strip of 10', mrp: 125.00, purchasePrice: 42.00, gstPercent: 12, currentStock: 65,  reorderLevel: 20, barcode: '8901234560005', isActive: true },
    { name: 'Augmentin 625',        genericName: 'Amoxicillin + Clavulanic Acid',  salt: 'Amoxicillin 500mg + Clavulanic Acid 125mg', strength: '625mg',  formulation: 'Tablet',  category: 'Antibiotic',     company: 'GSK',         packSize: 'Strip of 10', mrp: 225.00, purchasePrice: 68.00, gstPercent: 12, currentStock: 120, reorderLevel: 20, barcode: '8901234560006', isActive: true },
    { name: 'Monocef 200',          genericName: 'Cefpodoxime',                    salt: 'Cefpodoxime 200mg',                          strength: '200mg',  formulation: 'Tablet',  category: 'Antibiotic',     company: 'Aristo',      packSize: 'Strip of 10', mrp: 195.00, purchasePrice: 82.00, gstPercent: 12, currentStock: 85,  reorderLevel: 15, barcode: '8901234560007', isActive: true },
    { name: 'Zincovit Tablet',      genericName: 'Multivitamin + Zinc',            salt: 'Zinc 10mg + Vitamins',                       strength: '10mg',   formulation: 'Tablet',  category: 'Vitamin',        company: 'Apex',        packSize: 'Strip of 15', mrp: 145.00, purchasePrice: 60.00, gstPercent: 5,  currentStock: 75,  reorderLevel: 20, barcode: '8901234560008', isActive: true },
    { name: 'Vitamin D3 60000 IU',  genericName: 'Cholecalciferol',                salt: 'Vitamin D3 60000 IU',                        strength: '60000IU',formulation: 'Capsule', category: 'Vitamin',        company: 'Cadila',      packSize: 'Strip of 4',  mrp: 72.00,  purchasePrice: 28.00, gstPercent: 5,  currentStock: 5,   reorderLevel: 20, barcode: '8901234560009', isActive: true },
    { name: 'Amoxicillin 500mg',    genericName: 'Amoxicillin',                    salt: 'Amoxicillin 500mg',                          strength: '500mg',  formulation: 'Capsule', category: 'Antibiotic',     company: 'Cipla',       packSize: 'Strip of 10', mrp: 65.00,  purchasePrice: 25.00, gstPercent: 12, currentStock: 7,   reorderLevel: 30, barcode: '8901234560010', isActive: true },
    { name: 'Pan-D Tablet',         genericName: 'Pantoprazole + Domperidone',     salt: 'Pantoprazole 40mg + Domperidone 10mg',       strength: '40mg',   formulation: 'Tablet',  category: 'GI',             company: 'Alkem',       packSize: 'Strip of 10', mrp: 92.00,  purchasePrice: 35.00, gstPercent: 12, currentStock: 45,  reorderLevel: 25, barcode: '8901234560011', isActive: true },
    { name: 'Crocin 650 Tablet',    genericName: 'Paracetamol',                    salt: 'Paracetamol 650mg',                          strength: '650mg',  formulation: 'Tablet',  category: 'Analgesic',      company: 'GSK',         packSize: 'Strip of 15', mrp: 32.00,  purchasePrice: 18.60, gstPercent: 5,  currentStock: 110, reorderLevel: 50, barcode: '8901234560012', isActive: true },
    { name: 'Pantoprazole 40mg',    genericName: 'Pantoprazole',                   salt: 'Pantoprazole 40mg',                          strength: '40mg',   formulation: 'Tablet',  category: 'GI',             company: 'Cipla',       packSize: 'Strip of 10', mrp: 55.00,  purchasePrice: 20.00, gstPercent: 12, currentStock: 12,  reorderLevel: 30, barcode: '8901234560013', isActive: true },
    { name: 'Metformin 500mg',      genericName: 'Metformin',                      salt: 'Metformin 500mg',                            strength: '500mg',  formulation: 'Tablet',  category: 'Antidiabetic',   company: 'USV',         packSize: 'Strip of 10', mrp: 22.00,  purchasePrice: 8.00,  gstPercent: 5,  currentStock: 220, reorderLevel: 40, barcode: '8901234560014', isActive: true },
    { name: 'Atorvastatin 10mg',    genericName: 'Atorvastatin',                   salt: 'Atorvastatin 10mg',                          strength: '10mg',   formulation: 'Tablet',  category: 'Cardiac',        company: 'Pfizer',      packSize: 'Strip of 10', mrp: 45.00,  purchasePrice: 15.00, gstPercent: 12, currentStock: 185, reorderLevel: 30, barcode: '8901234560015', isActive: true },
    { name: 'Omeprazole 20mg',      genericName: 'Omeprazole',                     salt: 'Omeprazole 20mg',                            strength: '20mg',   formulation: 'Capsule', category: 'GI',             company: 'Sun Pharma',  packSize: 'Strip of 10', mrp: 35.00,  purchasePrice: 12.00, gstPercent: 12, currentStock: 155, reorderLevel: 40, barcode: '8901234560016', isActive: true },
  ]);

  // ── Medicine Batches ──
  const now = new Date();
  const d = (days) => new Date(now.getTime() + days * 86400000);
  await MedicineBatch.insertMany([
    { medicineId: meds[0]._id, batchNo: 'B240001', expiryDate: d(240), qty: 100, purchasePrice: 63, mrp: 210, supplierId: suppliers[0]._id, rackLabel: 'A-1' },
    { medicineId: meds[0]._id, batchNo: 'B240002', expiryDate: d(365), qty: 80,  purchasePrice: 63, mrp: 210, supplierId: suppliers[1]._id, rackLabel: 'A-1' },
    { medicineId: meds[1]._id, batchNo: 'B240010', expiryDate: d(180), qty: 12,  purchasePrice: 17.2, mrp: 32.5, supplierId: suppliers[0]._id, rackLabel: 'A-2' },
    { medicineId: meds[2]._id, batchNo: 'B240011', expiryDate: d(300), qty: 95,  purchasePrice: 16, mrp: 30, supplierId: suppliers[2]._id, rackLabel: 'A-2' },
    { medicineId: meds[3]._id, batchNo: 'B240012', expiryDate: d(90),  qty: 8,   purchasePrice: 45, mrp: 85, supplierId: suppliers[0]._id, rackLabel: 'B-1' },
    { medicineId: meds[5]._id, batchNo: 'B240020', expiryDate: d(25),  qty: 120, purchasePrice: 68, mrp: 225, supplierId: suppliers[0]._id, rackLabel: 'A-3' },
    { medicineId: meds[6]._id, batchNo: 'B240021', expiryDate: d(32),  qty: 85,  purchasePrice: 82, mrp: 195, supplierId: suppliers[2]._id, rackLabel: 'B-2' },
    { medicineId: meds[7]._id, batchNo: 'B240022', expiryDate: d(40),  qty: 75,  purchasePrice: 60, mrp: 145, supplierId: suppliers[3]._id, rackLabel: 'C-1' },
    { medicineId: meds[8]._id, batchNo: 'B240023', expiryDate: d(45),  qty: 5,   purchasePrice: 28, mrp: 72,  supplierId: suppliers[1]._id, rackLabel: 'C-2' },
    { medicineId: meds[2]._id, batchNo: 'B240024', expiryDate: d(60),  qty: 140, purchasePrice: 16, mrp: 30, supplierId: suppliers[0]._id,  rackLabel: 'A-2' },
  ]);

  // ── Sale Invoices (last 7 days) ──
  const saleItems = [
    [{ medicineId: meds[0]._id, medicineName: 'Clavm 625 Tablet', batchNo: 'B240001', qty: 2, mrp: 210, discountPct: 5, gstPct: 12, amount: 399 }],
    [{ medicineId: meds[1]._id, medicineName: 'Dolo 650 Tablet',  batchNo: 'B240010', qty: 3, mrp: 32.5, discountPct: 0, gstPct: 5,  amount: 97.5 }],
    [{ medicineId: meds[4]._id, medicineName: 'Pantop DSR Capsule', batchNo: 'B240002', qty: 1, mrp: 125, discountPct: 0, gstPct: 12, amount: 125 }],
    [{ medicineId: meds[2]._id, medicineName: 'Calpol 650 Tablet', batchNo: 'B240011', qty: 4, mrp: 30, discountPct: 0, gstPct: 5, amount: 120 }],
    [{ medicineId: meds[0]._id, medicineName: 'Clavm 625 Tablet', batchNo: 'B240001', qty: 3, mrp: 210, discountPct: 5, gstPct: 12, amount: 598 }],
  ];
  const payModes = ['Cash', 'UPI', 'Card', 'Cash', 'UPI'];
  const customerNames = ['Walk-in Customer', 'Rahul Sharma', 'Priya Verma', 'Walk-in Customer', 'Amit Kumar'];
  for (let i = 0; i < 5; i++) {
    const totalAmt = saleItems[i].reduce((s, it) => s + it.amount, 0);
    await SaleInvoice.create({
      invoiceNo: `INV-2025-${1520 + i}`,
      invoiceDate: new Date(now.getTime() - (4 - i) * 3600000 * 3),
      customerId: customers[i]?._id,
      customerName: customerNames[i],
      items: saleItems[i],
      subtotal: totalAmt,
      discountAmt: 0,
      gstAmt: +(totalAmt * 0.05).toFixed(2),
      roundOff: 0,
      totalAmt: +(totalAmt * 1.05).toFixed(2),
      paymentMode: payModes[i],
      paidAmt: +(totalAmt * 1.05).toFixed(2),
      dueAmt: 0,
      cashierName: 'Admin',
      status: 'Completed',
    });
  }

  // ── Purchase Invoices ──
  const purItems = [
    [{ medicineId: meds[0]._id, medicineName: 'Clavm 625 Tablet', batchNo: 'B240001', qty: 50, freeQty: 5, ptr: 63, mrp: 210, gstPct: 12, amount: 3150 }],
    [{ medicineId: meds[1]._id, medicineName: 'Dolo 650 Tablet',  batchNo: 'B240010', qty: 100,freeQty: 0, ptr: 17.2, mrp: 32.5, gstPct: 5, amount: 1720 }],
    [{ medicineId: meds[4]._id, medicineName: 'Pantop DSR Capsule', batchNo: 'B240002', qty: 40, freeQty: 4, ptr: 42, mrp: 125, gstPct: 12, amount: 1680 }],
    [{ medicineId: meds[2]._id, medicineName: 'Calpol 650 Tablet', batchNo: 'B240011', qty: 80, freeQty: 0, ptr: 16, mrp: 30, gstPct: 5, amount: 1280 }],
  ];
  const purDates = [d(-1), d(-2), d(-2), d(-3)];
  const purSuppliers = [suppliers[0], suppliers[5], suppliers[6], suppliers[2]];
  const purBillNos = ['PUR-2025-125', 'PUR-2025-124', 'PUR-2025-123', 'PUR-2025-122'];
  const purStatus = ['Paid', 'Paid', 'Paid', 'Due'];
  for (let i = 0; i < 4; i++) {
    const totalAmt = purItems[i].reduce((s, it) => s + it.amount, 0);
    await PurchaseInvoice.create({
      billNo: purBillNos[i],
      billDate: purDates[i],
      supplierId: purSuppliers[i]._id,
      supplierName: purSuppliers[i].name,
      items: purItems[i],
      subtotal: totalAmt,
      discountAmt: 0,
      gstAmt: +(totalAmt * 0.12).toFixed(2),
      totalAmt: +(totalAmt * 1.12).toFixed(2),
      paymentMode: purStatus[i] === 'Paid' ? 'Cash' : 'Credit',
      paidAmt: purStatus[i] === 'Paid' ? +(totalAmt * 1.12).toFixed(2) : 0,
      dueAmt: purStatus[i] === 'Paid' ? 0 : +(totalAmt * 1.12).toFixed(2),
      status: purStatus[i],
    });
  }
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
