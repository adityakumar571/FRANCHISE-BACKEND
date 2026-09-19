/* eslint-disable */
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getMedicineModel } from '../../../models/tenant/franchise/Medicine.model.js';
import { getMedicineBatchModel } from '../../../models/tenant/franchise/MedicineBatch.model.js';
import { getCustomerModel } from '../../../models/tenant/franchise/Customer.model.js';
import { getSaleInvoiceModel } from '../../../models/tenant/franchise/SaleInvoice.model.js';
import { getHoldBillModel } from '../../../models/tenant/franchise/HoldBill.model.js';
import { getDayClosingModel } from '../../../models/tenant/franchise/DayClosing.model.js';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/medicines/search?q=&category=&company=&page=
// Search medicines for POS billing (name/salt/barcode)
// ────────────────────────────────────────────────────────────────────────────
export const searchMedicines = asyncHandler(async (req, res) => {
  const { q = '', category = '', company = '', page = 1, limit = 20 } = req.query;
  const Medicine = getMedicineModel(req.db);
  const MedicineBatch = getMedicineBatchModel(req.db);

  const filter = { isActive: true };
  if (q) filter.$or = [
    { name: new RegExp(q, 'i') },
    { salt: new RegExp(q, 'i') },
    { genericName: new RegExp(q, 'i') },
    { barcode: new RegExp(q, 'i') },
  ];
  if (category) filter.category = new RegExp(category, 'i');
  if (company)  filter.company  = new RegExp(company, 'i');

  const skip = (Number(page) - 1) * Number(limit);
  const [medicines, total] = await Promise.all([
    Medicine.find(filter).skip(skip).limit(Number(limit)).lean(),
    Medicine.countDocuments(filter),
  ]);

  // Attach first active batch info for each medicine
  const result = await Promise.all(medicines.map(async (m) => {
    const batch = await MedicineBatch.findOne({ medicineId: m._id, qty: { $gt: 0 }, isActive: true })
      .sort({ expiryDate: 1 }).lean();
    return {
      id:      m._id,
      name:    m.name,
      salt:    m.salt,
      company: m.company,
      formulation: m.formulation,
      category: m.category,
      packSize: m.packSize,
      mrp:     batch?.mrp   ?? m.mrp,
      stock:   m.currentStock,
      batch:   batch?.batchNo ?? '—',
      exp:     batch?.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' }) : '—',
      gst:     m.gstPercent,
      barcode: m.barcode,
      rackLabel: m.rackLabel,
    };
  }));

  return res.status(200).json(new apiResponse(200, {
    medicines: result, total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
  }, 'Medicines fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/medicines/barcode/:barcode
// Get medicine by barcode/batch number
// ────────────────────────────────────────────────────────────────────────────
export const getMedicineByBarcode = asyncHandler(async (req, res) => {
  const { barcode } = req.params;
  const Medicine = getMedicineModel(req.db);
  const MedicineBatch = getMedicineBatchModel(req.db);

  const medicine = await Medicine.findOne({ barcode, isActive: true }).lean();
  if (!medicine) {
    // Try batch number search
    const batch = await MedicineBatch.findOne({ batchNo: barcode }).populate('medicineId').lean();
    if (!batch || !batch.medicineId) {
      return res.status(404).json(new apiResponse(404, null, 'Medicine not found for this barcode'));
    }
    return res.status(200).json(new apiResponse(200, {
      id:      batch.medicineId._id,
      name:    batch.medicineId.name,
      salt:    batch.medicineId.salt,
      mrp:     batch.mrp,
      stock:   batch.medicineId.currentStock,
      batch:   batch.batchNo,
      exp:     new Date(batch.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' }),
      gst:     batch.medicineId.gstPercent,
    }, 'Medicine found'));
  }

  const batch = await MedicineBatch.findOne({ medicineId: medicine._id, qty: { $gt: 0 }, isActive: true })
    .sort({ expiryDate: 1 }).lean();

  return res.status(200).json(new apiResponse(200, {
    id:      medicine._id,
    name:    medicine.name,
    salt:    medicine.salt,
    company: medicine.company,
    packSize: medicine.packSize,
    mrp:     batch?.mrp ?? medicine.mrp,
    stock:   medicine.currentStock,
    batch:   batch?.batchNo ?? '—',
    exp:     batch?.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' }) : '—',
    gst:     medicine.gstPercent,
    rackLabel: medicine.rackLabel,
  }, 'Medicine found'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/customers/search?q=&page=
// Search customers for POS
// ────────────────────────────────────────────────────────────────────────────
export const searchCustomers = asyncHandler(async (req, res) => {
  const { q = '', page = 1, limit = 20 } = req.query;
  const Customer = getCustomerModel(req.db);

  const filter = { isActive: true };
  if (q) filter.$or = [
    { name: new RegExp(q, 'i') },
    { phone: new RegExp(q, 'i') },
    { customerId: new RegExp(q, 'i') },
  ];

  const skip = (Number(page) - 1) * Number(limit);
  const [customers, total] = await Promise.all([
    Customer.find(filter).sort({ totalPurchase: -1 }).skip(skip).limit(Number(limit)).lean(),
    Customer.countDocuments(filter),
  ]);

  const result = customers.map(c => ({
    id:            c._id,
    customerId:    c.customerId,
    name:          c.name,
    phone:         c.phone,
    email:         c.email,
    orders:        0,
    totalPurchase: `₹${(c.totalPurchase || 0).toLocaleString('en-IN')}`,
    due:           c.dueAmount > 0 ? `₹${c.dueAmount.toLocaleString('en-IN')}` : '₹0',
    credit:        c.walletBalance || 0,
    tier:          c.tier,
  }));

  return res.status(200).json(new apiResponse(200, {
    customers: result, total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
  }, 'Customers fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/pos/customers
// Add new customer from POS
// ────────────────────────────────────────────────────────────────────────────
export const addCustomer = asyncHandler(async (req, res) => {
  const { name, phone, email, address, dob, gender } = req.body;
  if (!name || !phone) return res.status(400).json(new apiResponse(400, null, 'Name and phone are required'));

  const Customer = getCustomerModel(req.db);

  // Auto-generate customer ID
  const count = await Customer.countDocuments();
  const customerId = `CUS${String(count + 1).padStart(3, '0')}`;

  const customer = await Customer.create({ name, phone, email, address, dob, gender, customerId });

  return res.status(201).json(new apiResponse(201, {
    id:         customer._id,
    customerId: customer.customerId,
    name:       customer.name,
    phone:      customer.phone,
  }, 'Customer added successfully'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/hold-bills
// List all active hold bills for today
// ────────────────────────────────────────────────────────────────────────────
export const getHoldBills = asyncHandler(async (req, res) => {
  const HoldBill = getHoldBillModel(req.db);

  // Seed dummy hold bills if empty
  const count = await HoldBill.countDocuments({ isActive: true });
  if (count === 0) {
    await HoldBill.insertMany([
      { holdId: 'HB001', customerName: 'Rahul Sharma', items: [{ medicineName: 'Crocin 650 Tablet', qty: 2, mrp: 16, amount: 32 }, { medicineName: 'Pantoprazole 40mg', qty: 1, mrp: 35, amount: 35 }, { medicineName: 'Vitamin D3 60000 IU', qty: 1, mrp: 72, amount: 72 }], subtotal: 139, totalAmt: 139, note: 'Fever Medicine Bill',    isActive: true },
      { holdId: 'HB002', customerName: 'Priya Verma',  items: [{ medicineName: 'Azithral 500 Tablet', qty: 1, mrp: 85, amount: 85 }, { medicineName: 'Calpol 650 Tablet', qty: 2, mrp: 30, amount: 60 }, { medicineName: 'Omeprazole 20mg', qty: 1, mrp: 35, amount: 35 }, { medicineName: 'Augmentin 625', qty: 1, mrp: 225, amount: 225 }, { medicineName: 'Zincovit Tablet', qty: 2, mrp: 145, amount: 290 }], subtotal: 695, totalAmt: 695, note: "Nid's Medicine Bill",   isActive: true },
      { holdId: 'HB003', customerName: 'Walk-In',      items: [{ medicineName: 'Dolo 650 Tablet', qty: 2, mrp: 32.5, amount: 65 }, { medicineName: 'Pan-D Tablet', qty: 1, mrp: 92, amount: 92 }], subtotal: 157, totalAmt: 157, note: 'Pain Relief Bill',      isActive: true },
      { holdId: 'HB004', customerName: 'Amit Kumar',   items: [{ medicineName: 'Metformin 500mg', qty: 3, mrp: 22, amount: 66 }, { medicineName: 'Atorvastatin 10mg', qty: 2, mrp: 45, amount: 90 }, { medicineName: 'Omeprazole 20mg', qty: 1, mrp: 35, amount: 35 }, { medicineName: 'Vitamin D3 60000 IU', qty: 1, mrp: 72, amount: 72 }, { medicineName: 'Amoxicillin 500mg', qty: 2, mrp: 65, amount: 130 }, { medicineName: 'Pantoprazole 40mg', qty: 1, mrp: 55, amount: 55 }], subtotal: 448, totalAmt: 448, note: 'Diabetes Medicine Bill', isActive: true },
    ]);
  }

  const bills = await HoldBill.find({ isActive: true }).sort({ createdAt: -1 }).lean();

  const result = bills.map(b => ({
    id:           b._id,
    holdId:       b.holdId || b._id.toString().slice(-6).toUpperCase(),
    name:         b.customerName,
    items:        b.items?.length || 0,
    amount:       b.totalAmt,
    time:         new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    note:         b.note,
  }));

  return res.status(200).json(new apiResponse(200, result, 'Hold bills fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/pos/hold-bills
// Save a new hold bill
// ────────────────────────────────────────────────────────────────────────────
export const createHoldBill = asyncHandler(async (req, res) => {
  const { customerName, customerId, items, subtotal, discountAmt, totalAmt, note } = req.body;
  const HoldBill = getHoldBillModel(req.db);

  const count = await HoldBill.countDocuments();
  const holdId = `HB${String(count + 1).padStart(3, '0')}`;

  const bill = await HoldBill.create({
    holdId, customerName: customerName || 'Walk-In Customer',
    customerId, items, subtotal, discountAmt, totalAmt, note, isActive: true,
  });

  return res.status(201).json(new apiResponse(201, {
    id:     bill._id,
    holdId: bill.holdId,
  }, 'Bill held successfully'));
});

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/franchise/pos/hold-bills/:id
// Delete/dismiss a held bill
// ────────────────────────────────────────────────────────────────────────────
export const deleteHoldBill = asyncHandler(async (req, res) => {
  const HoldBill = getHoldBillModel(req.db);
  await HoldBill.findByIdAndUpdate(req.params.id, { isActive: false });
  return res.status(200).json(new apiResponse(200, null, 'Hold bill deleted'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/pos/sales/invoice
// Create a new sale invoice (main POS checkout)
// ────────────────────────────────────────────────────────────────────────────
export const createSaleInvoice = asyncHandler(async (req, res) => {
  const {
    customerId, customerName, customerPhone,
    items, subtotal, discountAmt, gstAmt, roundOff, totalAmt,
    paymentMode, paidAmt, dueAmt, notes,
  } = req.body;

  if (!items?.length) return res.status(400).json(new apiResponse(400, null, 'Cart is empty'));

  const SaleInvoice = getSaleInvoiceModel(req.db);
  const Medicine    = getMedicineModel(req.db);
  const MedicineBatch = getMedicineBatchModel(req.db);
  const Customer    = getCustomerModel(req.db);

  // Generate invoice number
  const today     = new Date();
  const year      = today.getFullYear();
  const count     = await SaleInvoice.countDocuments();
  const invoiceNo = `INV-${year}-${String(count + 1).padStart(4, '0')}`;

  const invoice = await SaleInvoice.create({
    invoiceNo, invoiceDate: today,
    customerId, customerName: customerName || 'Walk-in Customer', customerPhone,
    items, subtotal, discountAmt, gstAmt, roundOff,
    totalAmt, paymentMode, paidAmt, dueAmt,
    cashierName: 'Admin', status: 'Completed', notes,
  });

  // Deduct stock from medicine and batch
  for (const item of items) {
    if (item.medicineId) {
      await Medicine.findByIdAndUpdate(item.medicineId, { $inc: { currentStock: -item.qty } });
      // Deduct from oldest batch first
      const batch = await MedicineBatch.findOne({ medicineId: item.medicineId, qty: { $gte: item.qty }, isActive: true })
        .sort({ expiryDate: 1 }).lean();
      if (batch) {
        await MedicineBatch.findByIdAndUpdate(batch._id, { $inc: { qty: -item.qty } });
      }
    }
  }

  // Update customer totals
  if (customerId) {
    await Customer.findByIdAndUpdate(customerId, {
      $inc: { totalPurchase: totalAmt, dueAmount: dueAmt || 0 },
    });
  }

  return res.status(201).json(new apiResponse(201, {
    invoiceId: invoice._id,
    invoiceNo: invoice.invoiceNo,
  }, 'Invoice created successfully'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/sales/invoice/:id
// Get invoice by ID (for reprint / return)
// ────────────────────────────────────────────────────────────────────────────
export const getSaleInvoice = asyncHandler(async (req, res) => {
  const SaleInvoice = getSaleInvoiceModel(req.db);
  const invoice = await SaleInvoice.findById(req.params.id).lean();
  if (!invoice) return res.status(404).json(new apiResponse(404, null, 'Invoice not found'));
  return res.status(200).json(new apiResponse(200, invoice, 'Invoice fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/pos/sales/returns
// Process a return bill
// ────────────────────────────────────────────────────────────────────────────
export const createReturnBill = asyncHandler(async (req, res) => {
  const { originalInvoiceNo, items, totalReturnAmt, reason } = req.body;
  if (!items?.length) return res.status(400).json(new apiResponse(400, null, 'Return items are required'));

  const SaleInvoice = getSaleInvoiceModel(req.db);
  const Medicine    = getMedicineModel(req.db);

  const year  = new Date().getFullYear();
  const count = await SaleInvoice.countDocuments({ isReturn: true });
  const invoiceNo = `RTN-${year}-${String(count + 1).padStart(4, '0')}`;

  const returnInvoice = await SaleInvoice.create({
    invoiceNo, invoiceDate: new Date(),
    customerName: 'Return',
    items: items.map(i => ({ ...i, qty: -(i.retQty || i.qty), amount: -(i.retAmt || i.amount) })),
    totalAmt: -totalReturnAmt,
    paymentMode: 'Cash',
    isReturn: true, status: 'Returned',
    notes: `Return for ${originalInvoiceNo || '—'} — ${reason || ''}`,
  });

  // Re-add stock
  for (const item of items) {
    if (item.medicineId && item.retQty > 0) {
      await Medicine.findByIdAndUpdate(item.medicineId, { $inc: { currentStock: item.retQty } });
    }
  }

  return res.status(201).json(new apiResponse(201, {
    returnId:   returnInvoice._id,
    returnNo:   returnInvoice.invoiceNo,
    returnAmt:  totalReturnAmt,
  }, 'Return processed successfully'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/pos/sales/exchange
// Exchange bill — return old + create new sale
// ────────────────────────────────────────────────────────────────────────────
export const createExchangeBill = asyncHandler(async (req, res) => {
  const { returnItems, newItems, totalReturnAmt, totalNewAmt, paymentMode, originalInvoiceNo } = req.body;

  const SaleInvoice = getSaleInvoiceModel(req.db);
  const Medicine    = getMedicineModel(req.db);

  // Create return
  const year     = new Date().getFullYear();
  const retCount = await SaleInvoice.countDocuments({ isReturn: true });
  const returnNo = `EXC-RTN-${year}-${String(retCount + 1).padStart(4, '0')}`;

  await SaleInvoice.create({
    invoiceNo: returnNo, invoiceDate: new Date(),
    customerName: 'Exchange Return',
    items: returnItems.map(i => ({ ...i, qty: -(i.qty), amount: -(i.amount) })),
    totalAmt: -totalReturnAmt, isReturn: true, status: 'Returned',
    notes: `Exchange return for ${originalInvoiceNo || '—'}`,
  });

  // Re-add return stock
  for (const item of returnItems) {
    if (item.medicineId) {
      await Medicine.findByIdAndUpdate(item.medicineId, { $inc: { currentStock: item.qty } });
    }
  }

  // Create new sale
  const saleCount = await SaleInvoice.countDocuments();
  const saleNo    = `INV-${year}-${String(saleCount + 1).padStart(4, '0')}`;

  const newSale = await SaleInvoice.create({
    invoiceNo: saleNo, invoiceDate: new Date(),
    customerName: 'Walk-in Customer',
    items: newItems,
    totalAmt: totalNewAmt, paymentMode, status: 'Completed',
    notes: `Exchange for ${originalInvoiceNo || '—'}`,
  });

  // Deduct new sale stock
  for (const item of newItems) {
    if (item.medicineId) {
      await Medicine.findByIdAndUpdate(item.medicineId, { $inc: { currentStock: -item.qty } });
    }
  }

  const netPayable = totalNewAmt - totalReturnAmt;

  return res.status(201).json(new apiResponse(201, {
    newInvoiceId:  newSale._id,
    newInvoiceNo:  newSale.invoiceNo,
    netPayable,
  }, 'Exchange processed successfully'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/pos/sales/credit-sale
// Credit sale — create invoice with due amount
// ────────────────────────────────────────────────────────────────────────────
export const createCreditSale = asyncHandler(async (req, res) => {
  const { customerId, customerName, items, totalAmt, creditAmt, notes } = req.body;
  if (!customerId) return res.status(400).json(new apiResponse(400, null, 'Customer is required for credit sale'));

  const SaleInvoice = getSaleInvoiceModel(req.db);
  const Customer    = getCustomerModel(req.db);
  const Medicine    = getMedicineModel(req.db);

  const year  = new Date().getFullYear();
  const count = await SaleInvoice.countDocuments();
  const invoiceNo = `INV-${year}-${String(count + 1).padStart(4, '0')}`;

  const invoice = await SaleInvoice.create({
    invoiceNo, invoiceDate: new Date(),
    customerId, customerName,
    items,
    totalAmt, paymentMode: 'Credit',
    paidAmt: totalAmt - creditAmt,
    dueAmt: creditAmt,
    status: 'Completed', notes,
  });

  // Update customer due
  await Customer.findByIdAndUpdate(customerId, { $inc: { dueAmount: creditAmt, totalPurchase: totalAmt } });

  // Deduct stock
  for (const item of items) {
    if (item.medicineId) {
      await Medicine.findByIdAndUpdate(item.medicineId, { $inc: { currentStock: -item.qty } });
    }
  }

  return res.status(201).json(new apiResponse(201, {
    invoiceId: invoice._id,
    invoiceNo: invoice.invoiceNo,
    dueAmt:    creditAmt,
  }, 'Credit sale created'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/day-closing/summary
// Today's day closing summary for cashier
// ────────────────────────────────────────────────────────────────────────────
export const getDayClosingSummary = asyncHandler(async (req, res) => {
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const [salesAgg, returnAgg] = await Promise.all([
    SaleInvoice.aggregate([
      { $match: { invoiceDate: { $gte: todayStart, $lte: todayEnd }, status: 'Completed', isReturn: false } },
      { $group: {
        _id: null,
        total: { $sum: '$totalAmt' },
        count: { $sum: 1 },
        cash:  { $sum: { $cond: [{ $eq: ['$paymentMode', 'Cash'] }, '$totalAmt', 0] } },
        upi:   { $sum: { $cond: [{ $eq: ['$paymentMode', 'UPI'] },  '$totalAmt', 0] } },
        card:  { $sum: { $cond: [{ $eq: ['$paymentMode', 'Card'] }, '$totalAmt', 0] } },
        credit:{ $sum: { $cond: [{ $eq: ['$paymentMode', 'Credit'] },'$totalAmt', 0] } },
      }},
    ]),
    SaleInvoice.aggregate([
      { $match: { invoiceDate: { $gte: todayStart, $lte: todayEnd }, isReturn: true } },
      { $group: { _id: null, total: { $sum: { $abs: '$totalAmt' } }, count: { $sum: 1 } } },
    ]),
  ]);

  const sales   = salesAgg[0]  || { total: 0, count: 0, cash: 0, upi: 0, card: 0, credit: 0 };
  const returns = returnAgg[0] || { total: 0, count: 0 };

  const openingCash = 5000; // Could come from previous day closing
  const expenses    = 0;
  const netSales    = sales.total - returns.total;
  const expectedCash = openingCash + sales.cash - expenses;

  const today = new Date();
  return res.status(200).json(new apiResponse(200, {
    date:           today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    openingCash,
    transactions:   sales.count,
    totalSales:     sales.total,
    salesReturns:   returns.total,
    netSales,
    payments: {
      cash:   sales.cash,
      upi:    sales.upi,
      card:   sales.card,
      credit: sales.credit,
    },
    expenses,
    closingCash: expectedCash,
    previousClose: today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ', 9:05 PM',
  }, 'Day closing summary fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/pos/day-closing
// Submit day closing
// ────────────────────────────────────────────────────────────────────────────
export const submitDayClosing = asyncHandler(async (req, res) => {
  const { physicalCash, closingNote } = req.body;
  const DayClosing  = getDayClosingModel(req.db);
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const dateStr    = todayStart.toISOString().split('T')[0];

  // Check if already closed
  const existing = await DayClosing.findOne({ date: dateStr });
  if (existing) return res.status(400).json(new apiResponse(400, null, 'Day already closed'));

  const [salesAgg, returnAgg] = await Promise.all([
    SaleInvoice.aggregate([
      { $match: { invoiceDate: { $gte: todayStart, $lte: todayEnd }, status: 'Completed', isReturn: false } },
      { $group: { _id: null, total: { $sum: '$totalAmt' }, count: { $sum: 1 },
        cash:  { $sum: { $cond: [{ $eq: ['$paymentMode', 'Cash'] }, '$totalAmt', 0] } },
        upi:   { $sum: { $cond: [{ $eq: ['$paymentMode', 'UPI'] },  '$totalAmt', 0] } },
        card:  { $sum: { $cond: [{ $eq: ['$paymentMode', 'Card'] }, '$totalAmt', 0] } },
      }},
    ]),
    SaleInvoice.aggregate([
      { $match: { invoiceDate: { $gte: todayStart, $lte: todayEnd }, isReturn: true } },
      { $group: { _id: null, total: { $sum: { $abs: '$totalAmt' } } } },
    ]),
  ]);

  const sales   = salesAgg[0]  || { total: 0, count: 0, cash: 0, upi: 0, card: 0 };
  const returns = returnAgg[0] || { total: 0 };
  const openingCash   = 5000;
  const expenses      = 0;
  const expectedCash  = openingCash + sales.cash - expenses;
  const cashDiff      = (parseFloat(physicalCash) || 0) - expectedCash;

  const closing = await DayClosing.create({
    date: dateStr,
    openingCash,
    totalSales:   sales.total,
    salesReturns: returns.total,
    netSales:     sales.total - returns.total,
    transactions: sales.count,
    payments:     { cash: sales.cash, upi: sales.upi, card: sales.card },
    expenses,
    expectedCash,
    physicalCash: parseFloat(physicalCash) || 0,
    cashDifference: cashDiff,
    closingNote,
    closedAt: new Date(),
    closedByName: 'Admin',
    status: 'Closed',
  });

  return res.status(201).json(new apiResponse(201, {
    closingId:     closing._id,
    date:          dateStr,
    netSales:      closing.netSales,
    transactions:  closing.transactions,
    cashDifference: cashDiff,
  }, 'Day closed successfully'));
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/invoices?page=&limit=&from=&to=&status=
// List all sale invoices with pagination (for Billing history page)
// ─────────────────────────────────────────────────────────────────────────────
export const getPosInvoices = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, from, to, status, search = '' } = req.query;
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const filter = {};
  if (status && status !== 'All') filter.status = status;
  if (search) filter.$or = [
    { invoiceNo:    new RegExp(search, 'i') },
    { customerName: new RegExp(search, 'i') },
  ];
  if (from || to) {
    filter.invoiceDate = {};
    if (from) { const d = new Date(from); d.setHours(0,0,0,0);  filter.invoiceDate.$gte = d; }
    if (to)   { const d = new Date(to);   d.setHours(23,59,59,999); filter.invoiceDate.$lte = d; }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [invoices, total] = await Promise.all([
    SaleInvoice.find(filter).sort({ invoiceDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    SaleInvoice.countDocuments(filter),
  ]);

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todaySales = await SaleInvoice.aggregate([
    { $match: { invoiceDate: { $gte: todayStart }, status: { $ne: 'Cancelled' } } },
    { $group: { _id: null, total: { $sum: '$totalAmt' }, count: { $sum: 1 } } },
  ]);

  return res.status(200).json(new apiResponse(200, {
    invoices: invoices.map(inv => ({
      _id:          inv._id,
      invoiceNo:    inv.invoiceNo,
      customerName: inv.customerName || 'Walk-in Customer',
      customerPhone:inv.customerPhone || '',
      invoiceDate:  inv.invoiceDate,
      totalAmt:     inv.totalAmt,
      discount:     inv.discount || 0,
      netAmt:       inv.netAmt   || inv.totalAmt,
      paymentMode:  inv.paymentMode || 'Cash',
      status:       inv.status || 'Completed',
      items:        inv.items?.length || 0,
    })),
    total,
    totalPages:  Math.ceil(total / Number(limit)),
    currentPage: Number(page),
    todaySales:  todaySales[0]?.total || 0,
    todayCount:  todaySales[0]?.count || 0,
  }, 'Invoices fetched'));
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/orders?page=&limit=&status=
// List all orders (alias for invoices — used by Orders.jsx)
// ─────────────────────────────────────────────────────────────────────────────
export const getPosOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, search = '' } = req.query;
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const filter = {};
  if (status && status !== 'All') filter.status = status;
  if (search) filter.$or = [
    { invoiceNo:    new RegExp(search, 'i') },
    { customerName: new RegExp(search, 'i') },
  ];

  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total] = await Promise.all([
    SaleInvoice.find(filter).sort({ invoiceDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    SaleInvoice.countDocuments(filter),
  ]);

  return res.status(200).json(new apiResponse(200, {
    orders: orders.map(o => ({
      _id:          o._id,
      orderId:      o.invoiceNo,
      customerName: o.customerName || 'Walk-in Customer',
      date:         o.invoiceDate,
      amount:       o.netAmt || o.totalAmt,
      paymentMode:  o.paymentMode || 'Cash',
      status:       o.status || 'Completed',
      items:        o.items?.length || 0,
    })),
    total,
    totalPages: Math.ceil(total / Number(limit)),
  }, 'Orders fetched'));
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/sales/invoice-by-no/:invoiceNo
// Look up invoice by invoice number string (for Return/Exchange)
// ─────────────────────────────────────────────────────────────────────────────
export const getSaleInvoiceByNumber = asyncHandler(async (req, res) => {
  const { invoiceNo } = req.params;
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const invoice = await SaleInvoice.findOne({
    invoiceNo: { $regex: new RegExp(`^${invoiceNo}$`, 'i') },
  }).lean();

  if (!invoice) {
    return res.status(404).json(new apiResponse(404, null, `Invoice ${invoiceNo} not found`));
  }

  return res.status(200).json(new apiResponse(200, invoice, 'Invoice fetched'));
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/sales/returns?page=&limit=&from=&to=
// List all return bills
// ─────────────────────────────────────────────────────────────────────────────
export const getSalesReturnsList = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, from, to, search = '' } = req.query;
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const filter = { status: 'Returned' };
  if (search) filter.$or = [
    { invoiceNo:    new RegExp(search, 'i') },
    { customerName: new RegExp(search, 'i') },
  ];
  if (from || to) {
    filter.invoiceDate = {};
    if (from) { const d = new Date(from); d.setHours(0,0,0,0);  filter.invoiceDate.$gte = d; }
    if (to)   { const d = new Date(to);   d.setHours(23,59,59,999); filter.invoiceDate.$lte = d; }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [returns, total] = await Promise.all([
    SaleInvoice.find(filter).sort({ invoiceDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    SaleInvoice.countDocuments(filter),
  ]);

  return res.status(200).json(new apiResponse(200, {
    returns: returns.map(r => ({
      _id:         r._id,
      invoiceNo:   r.invoiceNo,
      returnDate:  r.updatedAt || r.invoiceDate,
      customerName:r.customerName || 'Walk-in',
      amount:      r.netAmt || r.totalAmt,
      items:       r.items?.length || 0,
      reason:      r.returnReason || '—',
    })),
    total,
    totalPages: Math.ceil(total / Number(limit)),
  }, 'Sales returns fetched'));
});
