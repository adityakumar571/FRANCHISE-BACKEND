/* eslint-disable */
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getSupplierModel } from '../../../models/tenant/franchise/Supplier.model.js';
import { getPurchaseInvoiceModel } from '../../../models/tenant/franchise/PurchaseInvoice.model.js';

// Seed dummy suppliers if needed
const seedSuppliers = async (db) => {
  const Supplier = getSupplierModel(db);
  if (await Supplier.countDocuments() > 0) return;
  await Supplier.insertMany([
    { name: 'Gupta Pharma',            supplierCode: 'SUP001', phone: '9800012301', email: 'gupta@pharma.com', city: 'Delhi',     state: 'Delhi',    isVerified: true,  rating: 4.8, isActive: true, outstandingBalance: 25430 },
    { name: 'R.K. Distributors',       supplierCode: 'SUP002', phone: '9800012302', email: 'rk@dist.com',     city: 'Mumbai',    state: 'Maharashtra', isVerified: true,  rating: 4.6, isActive: true, outstandingBalance: 18750 },
    { name: 'Medico Agency',           supplierCode: 'SUP003', phone: '9800012303', email: 'medico@agency.com',city: 'Kolkata',   state: 'West Bengal', isVerified: true,  rating: 4.5, isActive: true, outstandingBalance: 15600 },
    { name: 'Health Distributor',      supplierCode: 'SUP004', phone: '9800012304', email: 'health@dist.com', city: 'Chennai',   state: 'Tamil Nadu',  isVerified: true,  rating: 4.3, isActive: true, outstandingBalance: 12350 },
    { name: 'Shree Pharma',            supplierCode: 'SUP005', phone: '9800012305', email: 'shree@pharma.com',city: 'Pune',      state: 'Maharashtra', isVerified: false, rating: 4.2, isActive: true, outstandingBalance: 9800 },
    { name: 'MedPlus Pharma',          supplierCode: 'SUP006', phone: '9800012306', email: 'medplus@ph.com',  city: 'Hyderabad', state: 'Telangana',   isVerified: true,  rating: 4.7, isActive: true, outstandingBalance: 0 },
    { name: 'HealthCare Distributors', supplierCode: 'SUP007', phone: '9800012307', email: 'hcdistr@hc.com',  city: 'Bangalore', state: 'Karnataka',   isVerified: true,  rating: 4.4, isActive: false,outstandingBalance: 3200 },
  ]);
};

// ── GET /api/franchise/suppliers
export const getSuppliers = asyncHandler(async (req, res) => {
  await seedSuppliers(req.db);
  const { search = '', status = '', page = 1, limit = 20 } = req.query;
  const Supplier = getSupplierModel(req.db);

  const filter = {};
  if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { phone: new RegExp(search, 'i') }, { supplierCode: new RegExp(search, 'i') }];
  if (status === 'Active')   filter.isActive = true;
  if (status === 'Inactive') filter.isActive = false;

  const skip = (Number(page) - 1) * Number(limit);
  const [suppliers, total] = await Promise.all([
    Supplier.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Supplier.countDocuments(filter),
  ]);

  const totalActive   = await Supplier.countDocuments({ isActive: true });
  const totalInactive = await Supplier.countDocuments({ isActive: false });
  const totalPayable  = await Supplier.aggregate([{ $group: { _id: null, total: { $sum: '$outstandingBalance' } } }]);

  return res.status(200).json(new apiResponse(200, {
    suppliers: suppliers.map(s => ({
      _id: s._id, id: s.supplierCode, name: s.name, phone: s.phone, email: s.email,
      city: s.city, state: s.state, isVerified: s.isVerified, rating: s.rating,
      status: s.isActive ? 'Active' : 'Inactive',
      outstanding: s.outstandingBalance,
    })),
    total,
    totalPages: Math.ceil(total / Number(limit)),
    kpi: {
      total:      await Supplier.countDocuments(),
      active:     totalActive,
      inactive:   totalInactive,
      totalPayable: totalPayable[0]?.total || 0,
    },
  }, 'Suppliers fetched'));
});

// ── POST /api/franchise/suppliers
export const createSupplier = asyncHandler(async (req, res) => {
  const Supplier = getSupplierModel(req.db);
  const count = await Supplier.countDocuments();
  const supplierCode = `SUP${String(count + 1).padStart(3, '0')}`;
  const sup = await Supplier.create({ ...req.body, supplierCode });
  return res.status(201).json(new apiResponse(201, sup, 'Supplier created'));
});

// ── PUT /api/franchise/suppliers/:id
export const updateSupplier = asyncHandler(async (req, res) => {
  const Supplier = getSupplierModel(req.db);
  const sup = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!sup) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  return res.status(200).json(new apiResponse(200, sup, 'Supplier updated'));
});

// ── GET /api/franchise/suppliers/:id
export const getSupplierById = asyncHandler(async (req, res) => {
  const Supplier = getSupplierModel(req.db);
  const sup = await Supplier.findById(req.params.id).lean();
  if (!sup) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);
  const stats = await PurchaseInvoice.aggregate([
    { $match: { supplierId: sup._id } },
    { $group: { _id: null, total: { $sum: '$totalAmt' }, count: { $sum: 1 } } },
  ]);
  return res.status(200).json(new apiResponse(200, {
    ...sup,
    stats: { totalPurchase: stats[0]?.total || 0, invoiceCount: stats[0]?.count || 0 },
  }, 'Supplier fetched'));
});

// ── GET /api/franchise/suppliers/:id/ledger
export const getSupplierLedger = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);
  const invoices = await PurchaseInvoice.find({ supplierId: req.params.id })
    .sort({ billDate: -1 }).skip((Number(page)-1)*Number(limit)).limit(Number(limit)).lean();
  const result = invoices.map(inv => ({
    date:    new Date(inv.billDate).toLocaleDateString('en-IN'),
    voucher: inv.billNo,
    debit:   inv.totalAmt,
    credit:  inv.paidAmt,
    balance: inv.dueAmt,
    status:  inv.status,
  }));
  return res.status(200).json(new apiResponse(200, result, 'Ledger fetched'));
});

// ── GET /api/franchise/suppliers/:id/outstanding
export const getSupplierOutstanding = asyncHandler(async (req, res) => {
  const Supplier = getSupplierModel(req.db);
  const sup = await Supplier.findById(req.params.id).lean();
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);
  const unpaid = await PurchaseInvoice.find({ supplierId: req.params.id, status: { $in: ['Due', 'Partial'] } }).lean();
  return res.status(200).json(new apiResponse(200, {
    supplierName: sup?.name,
    outstanding:  sup?.outstandingBalance || 0,
    invoices:     unpaid.map(i => ({ billNo: i.billNo, date: new Date(i.billDate).toLocaleDateString('en-IN'), total: i.totalAmt, due: i.dueAmt })),
  }, 'Outstanding fetched'));
});

// ── GET /api/franchise/suppliers/:id/payment-history
export const getPaymentHistory = asyncHandler(async (req, res) => {
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);
  const paid = await PurchaseInvoice.find({ supplierId: req.params.id, paidAmt: { $gt: 0 } })
    .sort({ billDate: -1 }).limit(20).lean();
  return res.status(200).json(new apiResponse(200, paid.map(i => ({
    date: new Date(i.billDate).toLocaleDateString('en-IN'),
    voucher: i.billNo, amount: i.paidAmt, mode: i.paymentMode, status: i.status,
  })), 'Payment history fetched'));
});

// ── POST /api/franchise/suppliers/:id/payment
export const recordPayment = asyncHandler(async (req, res) => {
  const { amount, mode, notes } = req.body;
  if (!amount) return res.status(400).json(new apiResponse(400, null, 'Amount required'));
  const Supplier = getSupplierModel(req.db);
  await Supplier.findByIdAndUpdate(req.params.id, { $inc: { outstandingBalance: -Number(amount) } });
  return res.status(201).json(new apiResponse(201, { amount, mode }, 'Payment recorded'));
});
