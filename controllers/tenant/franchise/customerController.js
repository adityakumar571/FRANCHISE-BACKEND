/* eslint-disable */
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getCustomerModel } from '../../../models/tenant/franchise/Customer.model.js';
import { getSaleInvoiceModel } from '../../../models/tenant/franchise/SaleInvoice.model.js';

const TIER_COLORS = { Regular:'#6b7280', Silver:'#94a3b8', Gold:'#d97706', Platinum:'#7c3aed', Diamond:'#0891b2' };

// Seed customers
const seedCustomers = async (db) => {
  const Customer = getCustomerModel(db);
  if (await Customer.countDocuments() > 1) return;
  await Customer.insertMany([
    { name:'Rahul Sharma',   customerId:'CUS001', phone:'9876543210', email:'rahul@email.com',  tier:'Gold',     walletBalance:1258, loyaltyPoints:450, totalPurchase:145650, dueAmount:0,    isActive:true },
    { name:'Priya Verma',    customerId:'CUS002', phone:'9876543211', email:'priya@email.com',  tier:'Silver',   walletBalance:500,  loyaltyPoints:280, totalPurchase:89000,  dueAmount:250,  isActive:true },
    { name:'Amit Kumar',     customerId:'CUS003', phone:'9876543212', email:'amit@email.com',   tier:'Regular',  walletBalance:800,  loyaltyPoints:120, totalPurchase:42400,  dueAmount:0,    isActive:true },
    { name:'Sunita Singh',   customerId:'CUS004', phone:'9876543213', email:'sunita@email.com', tier:'Platinum', walletBalance:3500, loyaltyPoints:1200,totalPurchase:285000, dueAmount:0,    isActive:true },
    { name:'Deepak Joshi',   customerId:'CUS005', phone:'9876543214', email:'deepak@email.com', tier:'Regular',  walletBalance:200,  loyaltyPoints:60,  totalPurchase:15600,  dueAmount:120,  isActive:true },
    { name:'Neha Singh',     customerId:'CUS006', phone:'9001234567', email:'neha@email.com',   tier:'Diamond',  walletBalance:8000, loyaltyPoints:3500,totalPurchase:520000, dueAmount:0,    isActive:true },
    { name:'Vikram Patel',   customerId:'CUS007', phone:'9800012308', email:'vikram@email.com', tier:'Gold',     walletBalance:2100, loyaltyPoints:680, totalPurchase:185000, dueAmount:500,  isActive:false },
    { name:'Anjali Verma',   customerId:'CUS008', phone:'9800012309', email:'anjali@email.com', tier:'Silver',   walletBalance:350,  loyaltyPoints:190, totalPurchase:62000,  dueAmount:0,    isActive:true },
  ]);
};

// ── GET /api/franchise/customers
export const getCustomers = asyncHandler(async (req, res) => {
  await seedCustomers(req.db);
  const { search = '', status = '', tier = '', page = 1, limit = 20 } = req.query;
  const Customer = getCustomerModel(req.db);

  const filter = {};
  if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { phone: new RegExp(search, 'i') }, { customerId: new RegExp(search, 'i') }];
  if (status === 'Active')   filter.isActive = true;
  if (status === 'Inactive') filter.isActive = false;
  if (tier && tier !== 'All') filter.tier = tier;

  const skip = (Number(page) - 1) * Number(limit);
  const [customers, total] = await Promise.all([
    Customer.find(filter).sort({ totalPurchase: -1 }).skip(skip).limit(Number(limit)).lean(),
    Customer.countDocuments(filter),
  ]);

  const kpi = {
    total:    await Customer.countDocuments(),
    active:   await Customer.countDocuments({ isActive: true }),
    inactive: await Customer.countDocuments({ isActive: false }),
    totalDue: (await Customer.aggregate([{ $group: { _id: null, t: { $sum: '$dueAmount' } } }]))[0]?.t || 0,
  };

  return res.status(200).json(new apiResponse(200, {
    customers: customers.map(c => ({
      _id: c._id, id: c.customerId, name: c.name, phone: c.phone, email: c.email,
      tier: c.tier, tierColor: TIER_COLORS[c.tier] || '#6b7280',
      totalPurchase: `₹${(c.totalPurchase || 0).toLocaleString('en-IN')}`,
      due: c.dueAmount > 0 ? `₹${c.dueAmount.toLocaleString('en-IN')}` : '₹0',
      walletBalance: c.walletBalance,
      loyaltyPoints: c.loyaltyPoints,
      status: c.isActive ? 'Active' : 'Inactive',
    })),
    total, totalPages: Math.ceil(total / Number(limit)), kpi,
  }, 'Customers fetched'));
});

// ── POST /api/franchise/customers
export const createCustomer = asyncHandler(async (req, res) => {
  const Customer = getCustomerModel(req.db);
  const count    = await Customer.countDocuments();
  const cust     = await Customer.create({ ...req.body, customerId: `CUS${String(count + 1).padStart(3, '0')}` });
  return res.status(201).json(new apiResponse(201, cust, 'Customer created'));
});

// ── PUT /api/franchise/customers/:id
export const updateCustomer = asyncHandler(async (req, res) => {
  const Customer = getCustomerModel(req.db);
  const cust     = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!cust) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  return res.status(200).json(new apiResponse(200, cust, 'Customer updated'));
});

// ── GET /api/franchise/customers/:id
export const getCustomerById = asyncHandler(async (req, res) => {
  const Customer = getCustomerModel(req.db);
  const cust     = await Customer.findById(req.params.id).lean();
  if (!cust) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  return res.status(200).json(new apiResponse(200, cust, 'Customer fetched'));
});

// ── DELETE /api/franchise/customers/:id
export const deleteCustomer = asyncHandler(async (req, res) => {
  const Customer = getCustomerModel(req.db);
  await Customer.findByIdAndDelete(req.params.id);
  return res.status(200).json(new apiResponse(200, null, 'Customer deleted'));
});

// ── GET /api/franchise/customers/:id/purchases
export const getCustomerPurchases = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const SaleInvoice = getSaleInvoiceModel(req.db);
  const [invoices, total] = await Promise.all([
    SaleInvoice.find({ customerId: req.params.id }).sort({ invoiceDate: -1 }).skip((Number(page)-1)*Number(limit)).limit(Number(limit)).lean(),
    SaleInvoice.countDocuments({ customerId: req.params.id }),
  ]);
  return res.status(200).json(new apiResponse(200, {
    purchases: invoices.map(i => ({
      _id: i._id, invoiceNo: i.invoiceNo,
      date: new Date(i.invoiceDate).toLocaleDateString('en-IN'),
      items: i.items?.length || 0, total: i.totalAmt,
      mode: i.paymentMode, status: i.status,
    })),
    total, totalPages: Math.ceil(total / Number(limit)),
  }, 'Purchases fetched'));
});

// ── GET /api/franchise/customers/:id/wallet
export const getCustomerWallet = asyncHandler(async (req, res) => {
  const Customer = getCustomerModel(req.db);
  const cust = await Customer.findById(req.params.id).lean();
  const MOCK_TX = [
    { date: new Date(Date.now()-1*86400000).toLocaleDateString('en-IN'), type: 'Credit', amount: 500,  desc: 'Wallet top-up',    balance: cust?.walletBalance || 0 },
    { date: new Date(Date.now()-3*86400000).toLocaleDateString('en-IN'), type: 'Debit',  amount: -250, desc: 'Medicine purchase', balance: (cust?.walletBalance||0) - 500 },
    { date: new Date(Date.now()-7*86400000).toLocaleDateString('en-IN'), type: 'Credit', amount: 1000, desc: 'Wallet top-up',    balance: (cust?.walletBalance||0) - 500 + 250 },
  ];
  return res.status(200).json(new apiResponse(200, { balance: cust?.walletBalance || 0, transactions: MOCK_TX }, 'Wallet fetched'));
});

// ── POST /api/franchise/customers/:id/wallet/topup
export const walletTopup = asyncHandler(async (req, res) => {
  const { amount } = req.body;
  const Customer = getCustomerModel(req.db);
  const cust = await Customer.findByIdAndUpdate(req.params.id, { $inc: { walletBalance: Number(amount) } }, { new: true });
  return res.status(200).json(new apiResponse(200, { balance: cust?.walletBalance }, 'Wallet topped up'));
});

// ── GET /api/franchise/customers/:id/loyalty
export const getLoyalty = asyncHandler(async (req, res) => {
  const Customer = getCustomerModel(req.db);
  const cust = await Customer.findById(req.params.id).lean();
  const MOCK_HIST = [
    { date: new Date(Date.now()-2*86400000).toLocaleDateString('en-IN'), type: 'Earned',   points: 45,   desc: 'Medicine purchase' },
    { date: new Date(Date.now()-5*86400000).toLocaleDateString('en-IN'), type: 'Redeemed', points: -100, desc: 'Discount used' },
    { date: new Date(Date.now()-10*86400000).toLocaleDateString('en-IN'),type: 'Earned',   points: 120,  desc: 'Medicine purchase' },
  ];
  return res.status(200).json(new apiResponse(200, { points: cust?.loyaltyPoints || 0, history: MOCK_HIST }, 'Loyalty data fetched'));
});

// ── POST /api/franchise/customers/:id/loyalty/redeem
export const redeemLoyalty = asyncHandler(async (req, res) => {
  const { points } = req.body;
  const Customer   = getCustomerModel(req.db);
  const cust = await Customer.findById(req.params.id);
  if (!cust) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  if (cust.loyaltyPoints < points) return res.status(400).json(new apiResponse(400, null, 'Insufficient points'));
  cust.loyaltyPoints -= Number(points);
  await cust.save();
  return res.status(200).json(new apiResponse(200, { remainingPoints: cust.loyaltyPoints }, 'Points redeemed'));
});

// ── GET /api/franchise/customers/:id/membership
export const getMembership = asyncHandler(async (req, res) => {
  const Customer = getCustomerModel(req.db);
  const cust = await Customer.findById(req.params.id).lean();
  const PLANS = [
    { name: 'Basic', price: 299, benefits: ['5% discount on medicines', '100 loyalty points on joining'], isActive: cust?.tier === 'Regular' },
    { name: 'Silver', price: 599, benefits: ['10% discount', '500 points on joining', 'Priority support'], isActive: cust?.tier === 'Silver' },
    { name: 'Gold',   price: 999, benefits: ['15% discount', '1000 points on joining', 'Free home delivery', 'Priority support'], isActive: cust?.tier === 'Gold' },
  ];
  return res.status(200).json(new apiResponse(200, { currentTier: cust?.tier, plans: PLANS }, 'Membership fetched'));
});

// ── POST /api/franchise/customers/:id/membership
export const enrollMembership = asyncHandler(async (req, res) => {
  const { plan } = req.body;
  const Customer = getCustomerModel(req.db);
  const tierMap  = { Basic: 'Regular', Silver: 'Silver', Gold: 'Gold', Premium: 'Platinum' };
  await Customer.findByIdAndUpdate(req.params.id, { tier: tierMap[plan] || 'Silver' });
  return res.status(200).json(new apiResponse(200, { plan }, 'Membership enrolled'));
});

// ── GET /api/franchise/customers/:id/reminders
export const getReminders = asyncHandler(async (req, res) => {
  const Customer = getCustomerModel(req.db);
  const cust = await Customer.findById(req.params.id).lean();
  const REMINDERS = [
    { _id: 'r1', medicine: 'Metformin 500mg', frequency: 'Daily', time: '08:00 AM', nextDue: new Date(Date.now()+86400000).toLocaleDateString('en-IN'), status: 'Active' },
    { _id: 'r2', medicine: 'Atorvastatin 10mg', frequency: 'Daily', time: '09:00 PM', nextDue: new Date(Date.now()+86400000).toLocaleDateString('en-IN'), status: 'Active' },
    { _id: 'r3', medicine: 'Vitamin D3 60K', frequency: 'Weekly', time: '10:00 AM', nextDue: new Date(Date.now()+7*86400000).toLocaleDateString('en-IN'), status: 'Paused' },
  ];
  return res.status(200).json(new apiResponse(200, REMINDERS, 'Reminders fetched'));
});

// ── POST /api/franchise/customers/:id/reminders
export const addReminder = asyncHandler(async (req, res) => {
  return res.status(201).json(new apiResponse(201, req.body, 'Reminder added'));
});

// ── PUT /api/franchise/customers/:id/reminders/:reminderId
export const updateReminder = asyncHandler(async (req, res) => {
  return res.status(200).json(new apiResponse(200, req.body, 'Reminder updated'));
});

// ── GET /api/franchise/customers/:id/carecoin
export const getCareCoin = asyncHandler(async (req, res) => {
  const Customer = getCustomerModel(req.db);
  const cust = await Customer.findById(req.params.id).lean();
  const MOCK_TX = [
    { date: new Date(Date.now()-1*86400000).toLocaleDateString('en-IN'), type: 'Earned',   coins: 50,  desc: 'Medicine purchase ₹500+' },
    { date: new Date(Date.now()-5*86400000).toLocaleDateString('en-IN'), type: 'Redeemed', coins: -20, desc: 'Discount ₹20' },
  ];
  return res.status(200).json(new apiResponse(200, { coins: cust?.careCoins || 0, transactions: MOCK_TX }, 'CareCoin data fetched'));
});

// ── POST /api/franchise/customers/:id/carecoin/redeem
export const redeemCareCoin = asyncHandler(async (req, res) => {
  const { coins, description = 'CareCoin redemption' } = req.body;
  if (!coins || coins <= 0) return res.status(400).json(new apiResponse(400, null, 'Invalid coins amount'));
  const Customer = getCustomerModel(req.db);
  const customer = await Customer.findById(req.params.id);
  if (!customer) return res.status(404).json(new apiResponse(404, null, 'Customer not found'));
  const careCoins = customer.careCoins || customer.loyaltyPoints || 0;
  if (careCoins < coins) {
    return res.status(400).json(new apiResponse(400, null, `Insufficient CareCoin balance. Available: ${careCoins}`));
  }
  // Deduct coins
  if (customer.careCoins !== undefined) customer.careCoins -= coins;
  else customer.loyaltyPoints = (customer.loyaltyPoints || 0) - coins;
  // Push to transaction history if array exists
  if (Array.isArray(customer.careCoinTransactions)) {
    customer.careCoinTransactions.push({
      type: 'debit', coins, description, date: new Date(),
    });
  }
  await customer.save();
  return res.status(200).json(new apiResponse(200, {
    coinsRedeemed: coins,
    remaining: customer.careCoins ?? customer.loyaltyPoints,
  }, `${coins} CareCoin redeemed successfully`));
});
