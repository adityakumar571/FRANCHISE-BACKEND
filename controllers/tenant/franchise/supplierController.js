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
  const { page = 1, limit = 20, from = '', to = '' } = req.query;
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);

  const filter = { supplierId: req.params.id };
  if (from || to) {
    filter.billDate = {};
    if (from) { const d = new Date(from); d.setHours(0, 0, 0, 0);       filter.billDate.$gte = d; }
    if (to)   { const d = new Date(to);   d.setHours(23, 59, 59, 999);  filter.billDate.$lte = d; }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [invoices, total] = await Promise.all([
    PurchaseInvoice.find(filter).sort({ billDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    PurchaseInvoice.countDocuments(filter),
  ]);

  const result = invoices.map(inv => ({
    date:    new Date(inv.billDate).toLocaleDateString('en-IN'),
    voucher: inv.billNo,
    debit:   inv.totalAmt,
    credit:  inv.paidAmt,
    balance: inv.dueAmt,
    status:  inv.status,
  }));

  return res.status(200).json(new apiResponse(200, {
    entries:    result,
    total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
  }, 'Ledger fetched'));
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

// ── GET /api/franchise/suppliers/:id/payments   (path alias for /payment-history)
// Frontend calls /payments — backend had /payment-history — this fixes the mismatch
export const getSupplierPayments = asyncHandler(async (req, res) => {
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);
  const { page = 1, limit = 20 } = req.query;
  const paid = await PurchaseInvoice.find({ supplierId: req.params.id, paidAmt: { $gt: 0 } })
    .sort({ billDate: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();
  const total = await PurchaseInvoice.countDocuments({ supplierId: req.params.id, paidAmt: { $gt: 0 } });
  return res.status(200).json(new apiResponse(200, {
    payments: paid.map(i => ({
      _id:     i._id,
      date:    new Date(i.billDate).toLocaleDateString('en-IN'),
      voucher: i.billNo,
      amount:  i.paidAmt,
      mode:    i.paymentMode || 'Cash',
      status:  i.status,
      notes:   i.notes || '',
    })),
    total,
    totalPages: Math.ceil(total / Number(limit)),
  }, 'Payments fetched'));
});

// ── POST /api/franchise/suppliers/:id/payments   (path alias for /payment)
export const recordSupplierPayment = asyncHandler(async (req, res) => {
  const { amount, mode = 'Cash', notes = '', referenceNo = '' } = req.body;
  if (!amount || Number(amount) <= 0) {
    return res.status(400).json(new apiResponse(400, null, 'Valid amount required'));
  }
  const Supplier = getSupplierModel(req.db);
  const supplier = await Supplier.findByIdAndUpdate(
    req.params.id,
    { $inc: { outstandingBalance: -Number(amount) } },
    { new: true }
  );
  if (!supplier) return res.status(404).json(new apiResponse(404, null, 'Supplier not found'));
  return res.status(200).json(new apiResponse(200, {
    paid:        Number(amount),
    mode,
    notes,
    referenceNo,
    newOutstanding: supplier.outstandingBalance,
  }, `Payment of ₹${amount} recorded`));
});

// ── POST /api/franchise/suppliers/:id/login-as - Direct login to supplier portal
export const supplierDirectLogin = asyncHandler(async (req, res) => {
  const Supplier = getSupplierModel(req.db);
  const supplier = await Supplier.findById(req.params.id).lean();
  
  if (!supplier) {
    return res.status(404).json(new apiResponse(404, null, 'Supplier not found'));
  }

  // Generate JWT token for supplier
  const jwt = (await import('jsonwebtoken')).default;
  const token = jwt.sign(
    {
      supplierId: supplier._id,
      supplierCode: supplier.supplierCode,
      name: supplier.name,
      email: supplier.email,
      tenantId: req.tenant?._id,
      type: 'supplier',
    },
    process.env.JWT_SECRET || 'fallback-secret-key',
    { expiresIn: '24h' }
  );

  const responseData = {
    token,
    supplier: {
      _id: supplier._id,
      name: supplier.name,
      supplierCode: supplier.supplierCode,
      email: supplier.email,
    },
  };

  console.log('Supplier Login Response:', responseData);

  return res.status(200).json(new apiResponse(200, responseData, 'Direct login token generated'));
});

// ── POST /api/franchise/suppliers/login - Supplier password-based login
export const supplierLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json(new apiResponse(400, null, 'Email and password are required'));
  }

  const Supplier = getSupplierModel(req.db);
  
  // Find supplier by email and get password field
  const supplier = await Supplier.findOne({ email: email.toLowerCase() }).select('+password');
  
  if (!supplier) {
    return res.status(401).json(new apiResponse(401, null, 'Invalid email or password'));
  }

  // Check if supplier is active
  if (!supplier.isActive) {
    return res.status(403).json(new apiResponse(403, null, 'Your account is inactive. Please contact admin.'));
  }

  // If no password set, set supplierCode as password on first login
  if (!supplier.password && supplier.supplierCode) {
    supplier.password = supplier.supplierCode;
    await supplier.save();
  }

  // Compare password
  const isPasswordValid = await supplier.comparePassword(password);
  
  if (!isPasswordValid) {
    return res.status(401).json(new apiResponse(401, null, 'Invalid email or password'));
  }

  // Update last login
  supplier.lastLogin = new Date();
  if (supplier.isFirstLogin) {
    supplier.isFirstLogin = false;
  }
  await supplier.save();

  // Generate JWT token
  const jwt = (await import('jsonwebtoken')).default;
  const token = jwt.sign(
    {
      supplierId: supplier._id,
      supplierCode: supplier.supplierCode,
      name: supplier.name,
      email: supplier.email,
      tenantId: req.tenant?._id,
      tenantSubdomain: req.tenant?.subdomain,
      type: 'supplier',
    },
    process.env.JWT_SECRET || 'fallback-secret-key',
    { expiresIn: '7d' }
  );

  const responseData = {
    token,
    supplier: {
      _id: supplier._id,
      name: supplier.name,
      supplierCode: supplier.supplierCode,
      email: supplier.email,
      isFirstLogin: supplier.isFirstLogin,
      tenantName: req.tenant?.name || req.tenant?.subdomain,
      tenantId: req.tenant?._id,
    },
  };

  return res.status(200).json(new apiResponse(200, responseData, 'Login successful'));
});

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIER ORDER MANAGEMENT APIs
// ═══════════════════════════════════════════════════════════════════════════

// Import SupplierOrder model dynamically
const getSupplierOrderModel = (db) => {
  return db.model('SupplierOrder') || require('../../../models/tenant/franchise/SupplierOrder.model.js');
};

// ── GET /api/franchise/suppliers/orders - Get all orders for logged-in supplier
export const getSupplierOrders = asyncHandler(async (req, res) => {
  const { status, franchiseId, fromDate, toDate, orderType, page = 1, limit = 20 } = req.query;
  const supplierId = req.user?.supplierId || req.query.supplierId; // From JWT or query

  if (!supplierId) {
    return res.status(400).json(new apiResponse(400, null, 'Supplier ID is required'));
  }

  const SupplierOrder = getSupplierOrderModel(req.db);

  // Build filter
  const filter = { supplierId };
  if (status) filter.status = status;
  if (franchiseId) filter.franchiseId = franchiseId;
  if (orderType) filter.orderType = orderType;
  
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) {
      const d = new Date(fromDate);
      d.setHours(0, 0, 0, 0);
      filter.createdAt.$gte = d;
    }
    if (toDate) {
      const d = new Date(toDate);
      d.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = d;
    }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total] = await Promise.all([
    SupplierOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    SupplierOrder.countDocuments(filter),
  ]);

  // Get order statistics
  const stats = await SupplierOrder.aggregate([
    { $match: { supplierId: require('mongoose').Types.ObjectId(supplierId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' },
      },
    },
  ]);

  const orderStats = {
    total: await SupplierOrder.countDocuments({ supplierId }),
    pending: stats.find(s => s._id === 'pending')?.count || 0,
    confirmed: stats.find(s => s._id === 'confirmed')?.count || 0,
    processing: stats.find(s => s._id === 'processing')?.count || 0,
    dispatched: stats.find(s => s._id === 'dispatched')?.count || 0,
    delivered: stats.find(s => s._id === 'delivered')?.count || 0,
    cancelled: stats.find(s => s._id === 'cancelled')?.count || 0,
    totalRevenue: stats.reduce((sum, s) => sum + (s.totalAmount || 0), 0),
  };

  return res.status(200).json(new apiResponse(200, {
    orders,
    total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
    stats: orderStats,
  }, 'Orders fetched successfully'));
});

// ── GET /api/franchise/suppliers/orders/:id - Get order details
export const getSupplierOrderById = asyncHandler(async (req, res) => {
  const SupplierOrder = getSupplierOrderModel(req.db);
  const order = await SupplierOrder.findById(req.params.id).lean();

  if (!order) {
    return res.status(404).json(new apiResponse(404, null, 'Order not found'));
  }

  // Verify supplier has access to this order
  const supplierId = req.user?.supplierId || req.query.supplierId;
  if (supplierId && order.supplierId.toString() !== supplierId.toString()) {
    return res.status(403).json(new apiResponse(403, null, 'Access denied'));
  }

  return res.status(200).json(new apiResponse(200, order, 'Order details fetched'));
});

// ── PUT /api/franchise/suppliers/orders/:id/status - Update order status
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, remarks, trackingNumber, courierName } = req.body;
  const supplierId = req.user?.supplierId;

  if (!status) {
    return res.status(400).json(new apiResponse(400, null, 'Status is required'));
  }

  const validStatuses = ['pending', 'confirmed', 'processing', 'dispatched', 'delivered', 'cancelled', 'rejected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json(new apiResponse(400, null, 'Invalid status'));
  }

  const SupplierOrder = getSupplierOrderModel(req.db);
  const order = await SupplierOrder.findById(req.params.id);

  if (!order) {
    return res.status(404).json(new apiResponse(404, null, 'Order not found'));
  }

  // Verify supplier owns this order
  if (supplierId && order.supplierId.toString() !== supplierId.toString()) {
    return res.status(403).json(new apiResponse(403, null, 'Access denied'));
  }

  // Update order
  order.status = status;
  order.updatedBy = req.user?.name || 'Supplier';
  if (remarks) order.supplierRemarks = remarks;
  if (trackingNumber) order.trackingNumber = trackingNumber;
  if (courierName) order.courierName = courierName;

  // Set dates based on status
  if (status === 'dispatched' && !order.dispatchDate) {
    order.dispatchDate = new Date();
  }
  if (status === 'delivered' && !order.actualDeliveryDate) {
    order.actualDeliveryDate = new Date();
  }
  if (status === 'cancelled' && req.body.cancellationReason) {
    order.cancellationReason = req.body.cancellationReason;
  }

  await order.save();

  return res.status(200).json(new apiResponse(200, order, `Order ${status} successfully`));
});

// ── GET /api/franchise/suppliers/orders/analytics - Get order analytics
export const getSupplierOrderAnalytics = asyncHandler(async (req, res) => {
  const supplierId = req.user?.supplierId || req.query.supplierId;
  const { period = '30days' } = req.query; // 7days, 30days, 90days, 1year

  if (!supplierId) {
    return res.status(400).json(new apiResponse(400, null, 'Supplier ID is required'));
  }

  const SupplierOrder = getSupplierOrderModel(req.db);

  // Calculate date range
  const now = new Date();
  let startDate = new Date();
  switch (period) {
    case '7days':
      startDate.setDate(now.getDate() - 7);
      break;
    case '30days':
      startDate.setDate(now.getDate() - 30);
      break;
    case '90days':
      startDate.setDate(now.getDate() - 90);
      break;
    case '1year':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      startDate.setDate(now.getDate() - 30);
  }

  // Franchise-wise orders
  const franchiseOrders = await SupplierOrder.aggregate([
    {
      $match: {
        supplierId: require('mongoose').Types.ObjectId(supplierId),
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$franchiseId',
        franchiseName: { $first: '$franchiseName' },
        franchiseCode: { $first: '$franchiseCode' },
        totalOrders: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' },
      },
    },
    { $sort: { totalAmount: -1 } },
  ]);

  // Product-wise sales
  const productSales = await SupplierOrder.aggregate([
    {
      $match: {
        supplierId: require('mongoose').Types.ObjectId(supplierId),
        createdAt: { $gte: startDate },
      },
    },
    { $unwind: '$products' },
    {
      $group: {
        _id: '$products.productName',
        totalQuantity: { $sum: '$products.quantity' },
        totalRevenue: { $sum: '$products.totalPrice' },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: 10 },
  ]);

  // Daily order trends
  const dailyTrends = await SupplierOrder.aggregate([
    {
      $match: {
        supplierId: require('mongoose').Types.ObjectId(supplierId),
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        orders: { $sum: 1 },
        revenue: { $sum: '$totalAmount' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Order type distribution
  const orderTypeDistribution = await SupplierOrder.aggregate([
    {
      $match: {
        supplierId: require('mongoose').Types.ObjectId(supplierId),
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$orderType',
        count: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' },
      },
    },
  ]);

  // Overall stats
  const overallStats = await SupplierOrder.aggregate([
    {
      $match: {
        supplierId: require('mongoose').Types.ObjectId(supplierId),
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$totalAmount' },
        avgOrderValue: { $avg: '$totalAmount' },
      },
    },
  ]);

  return res.status(200).json(new apiResponse(200, {
    period,
    startDate,
    endDate: now,
    overallStats: overallStats[0] || { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0 },
    franchiseOrders,
    productSales,
    dailyTrends,
    orderTypeDistribution,
  }, 'Analytics fetched successfully'));
});

// ── POST /api/franchise/suppliers/orders - Create new order (for testing/franchise side)
export const createSupplierOrder = asyncHandler(async (req, res) => {
  const SupplierOrder = getSupplierOrderModel(req.db);
  const order = await SupplierOrder.create(req.body);
  return res.status(201).json(new apiResponse(201, order, 'Order created successfully'));
});

// ── GET /api/franchise/suppliers/dashboard/stats - Dashboard statistics
export const getSupplierDashboardStats = asyncHandler(async (req, res) => {
  const supplierId = req.user?.supplierId || req.query.supplierId;

  if (!supplierId) {
    return res.status(400).json(new apiResponse(400, null, 'Supplier ID is required'));
  }

  const SupplierOrder = getSupplierOrderModel(req.db);

  // Get current month stats
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const [currentMonthStats, lastMonthStats, recentOrders, statusCounts] = await Promise.all([
    SupplierOrder.aggregate([
      {
        $match: {
          supplierId: require('mongoose').Types.ObjectId(supplierId),
          createdAt: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
        },
      },
    ]),
    SupplierOrder.aggregate([
      {
        $match: {
          supplierId: require('mongoose').Types.ObjectId(supplierId),
          createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
        },
      },
    ]),
    SupplierOrder.find({ supplierId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    SupplierOrder.aggregate([
      { $match: { supplierId: require('mongoose').Types.ObjectId(supplierId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const current = currentMonthStats[0] || { totalOrders: 0, totalRevenue: 0 };
  const last = lastMonthStats[0] || { totalOrders: 0, totalRevenue: 0 };

  const orderGrowth = last.totalOrders > 0
    ? ((current.totalOrders - last.totalOrders) / last.totalOrders * 100).toFixed(1)
    : 0;
  
  const revenueGrowth = last.totalRevenue > 0
    ? ((current.totalRevenue - last.totalRevenue) / last.totalRevenue * 100).toFixed(1)
    : 0;

  const stats = {};
  statusCounts.forEach(s => {
    stats[s._id] = s.count;
  });

  return res.status(200).json(new apiResponse(200, {
    currentMonth: {
      orders: current.totalOrders,
      revenue: current.totalRevenue,
    },
    growth: {
      orders: orderGrowth,
      revenue: revenueGrowth,
    },
    pending: stats.pending || 0,
    confirmed: stats.confirmed || 0,
    processing: stats.processing || 0,
    dispatched: stats.dispatched || 0,
    delivered: stats.delivered || 0,
    recentOrders,
  }, 'Dashboard stats fetched'));
});
