/* eslint-disable */
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getSaleInvoiceModel } from '../../../models/tenant/franchise/SaleInvoice.model.js';
import { getPurchaseInvoiceModel } from '../../../models/tenant/franchise/PurchaseInvoice.model.js';
import { getJournalEntryModel } from '../../../models/tenant/franchise/JournalEntry.model.js';
import { getReceiptModel } from '../../../models/tenant/franchise/Receipt.model.js';
import { getPaymentModel } from '../../../models/tenant/franchise/Payment.model.js';
import { getExpenseModel } from '../../../models/tenant/franchise/Expense.model.js';
import { getOpeningBalanceModel } from '../../../models/tenant/franchise/OpeningBalance.model.js';
import { getAccountMasterModel } from '../../../models/tenant/franchise/AccountMaster.model.js';

// Helper: parse date range
const dateRange = (from, to) => {
  const s = from ? new Date(from) : new Date(new Date().getFullYear(), 3, 1); // April 1
  const e = to   ? new Date(to)   : new Date();
  s.setHours(0,0,0,0); e.setHours(23,59,59,999);
  return { $gte: s, $lte: e };
};

// ── GET /api/franchise/accounts/day-book?from=&to=&page=&limit=&search=&type=
export const getDayBook = asyncHandler(async (req, res) => {
  const { from, to, page = 1, limit = 20, search = '', type = '' } = req.query;
  const range = dateRange(from, to);
  const SaleInvoice    = getSaleInvoiceModel(req.db);
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);
  const JournalEntry   = getJournalEntryModel(req.db);

  const [sales, purchases, journals] = await Promise.all([
    SaleInvoice.find({ invoiceDate: range, status: { $ne: 'Cancelled' } }).lean(),
    PurchaseInvoice.find({ billDate: range, status: { $ne: 'Cancelled' } }).lean(),
    JournalEntry.find({ entryDate: range, status: 'Posted' }).lean(),
  ]);

  let entries = [
    ...sales.map(s => ({
      _id:        s._id,
      date:       new Date(s.invoiceDate).toLocaleDateString('en-IN'),
      voucher:    s.invoiceNo,
      particulars:`Cash Sales - ${s.customerName}`,
      debit: null, credit: s.totalAmt, type: 'Sale',
    })),
    ...purchases.map(p => ({
      _id:        p._id,
      date:       new Date(p.billDate).toLocaleDateString('en-IN'),
      voucher:    p.billNo,
      particulars:`Purchase - ${p.supplierName}`,
      debit: p.totalAmt, credit: null, type: 'Purchase',
    })),
    ...journals.map(j => ({
      _id:        j._id,
      date:       new Date(j.entryDate).toLocaleDateString('en-IN'),
      voucher:    j.jvNo,
      particulars: j.narration,
      debit: j.totalDebit, credit: j.totalCredit, type: 'Journal',
    })),
  ];

  entries.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (search) entries = entries.filter(e => e.voucher?.toLowerCase().includes(search.toLowerCase()) || e.particulars?.toLowerCase().includes(search.toLowerCase()));
  if (type)   entries = entries.filter(e => e.type === type);

  const total      = entries.length;
  const skip       = (Number(page) - 1) * Number(limit);
  const paged      = entries.slice(skip, skip + Number(limit));
  const totalDebit  = entries.reduce((s, e) => s + (e.debit  || 0), 0);
  const totalCredit = entries.reduce((s, e) => s + (e.credit || 0), 0);

  return res.status(200).json(new apiResponse(200, {
    entries: paged, totalDebit, totalCredit,
    total, totalPages: Math.ceil(total / Number(limit)), currentPage: Number(page),
  }, 'Day book fetched'));
});

// ── GET /api/franchise/accounts/cash-book?from=&to=&page=&limit=&search=
export const getCashBook = asyncHandler(async (req, res) => {
  const { from, to, page = 1, limit = 20, search = '' } = req.query;
  const range = dateRange(from, to);
  const SaleInvoice = getSaleInvoiceModel(req.db);
  const Receipt     = getReceiptModel(req.db);
  const Payment     = getPaymentModel(req.db);
  const OpeningBalance = getOpeningBalanceModel(req.db);

  // Get current fiscal year opening balance
  const currentFY = new Date().getFullYear();
  const fyStart = `${currentFY}-${currentFY + 1}`;
  const obData = await OpeningBalance.findOne({ fiscalYear: fyStart }).lean();
  
  // Calculate opening balance for Cash
  let openingBalance = 0;
  if (obData && obData.entries) {
    const cashEntry = obData.entries.find(e => e.accountType === 'Asset' && e.accountName.toLowerCase().includes('cash'));
    openingBalance = cashEntry ? (cashEntry.openingDebit - cashEntry.openingCredit) : 0;
  }

  // Get cash transactions
  const [cashSales, receipts, payments] = await Promise.all([
    SaleInvoice.find({ invoiceDate: range, paymentMode: 'Cash', status: { $ne: 'Cancelled' } }).sort({ invoiceDate: 1 }).lean(),
    Receipt.find({ receiptDate: range, mode: 'Cash', status: { $ne: 'Cancelled' } }).sort({ receiptDate: 1 }).lean(),
    Payment.find({ paymentDate: range, mode: 'Cash', status: { $ne: 'Cancelled' } }).sort({ paymentDate: 1 }).lean(),
  ]);

  let balance = openingBalance;
  let entries = [
    { _id: 'ob1', date: new Date(range.$gte).toLocaleDateString('en-IN'), voucher: 'OB', particulars: 'Opening Balance', cashIn: balance, cashOut: null, balance, type: 'Opening' },
  ];

  // Add cash sales
  cashSales.forEach(s => {
    balance += s.totalAmt;
    entries.push({ 
      _id: s._id, 
      date: new Date(s.invoiceDate).toLocaleDateString('en-IN'), 
      voucher: s.invoiceNo, 
      particulars: `Cash Sales - ${s.customerName}`, 
      cashIn: s.totalAmt, 
      cashOut: null, 
      balance,
      type: 'Sale'
    });
  });

  // Add receipts
  receipts.forEach(r => {
    balance += r.amount;
    entries.push({
      _id: r._id,
      date: new Date(r.receiptDate).toLocaleDateString('en-IN'),
      voucher: r.receiptNo,
      particulars: r.particulars,
      cashIn: r.amount,
      cashOut: null,
      balance,
      type: 'Receipt'
    });
  });

  // Add payments
  payments.forEach(p => {
    balance -= p.amount;
    entries.push({
      _id: p._id,
      date: new Date(p.paymentDate).toLocaleDateString('en-IN'),
      voucher: p.paymentNo,
      particulars: p.particulars,
      cashIn: null,
      cashOut: p.amount,
      balance,
      type: 'Payment'
    });
  });

  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (search) entries = entries.filter(e => e.voucher?.toLowerCase().includes(search.toLowerCase()) || e.particulars?.toLowerCase().includes(search.toLowerCase()));

  const total        = entries.length;
  const skip         = (Number(page) - 1) * Number(limit);
  const paged        = entries.slice(skip, skip + Number(limit));
  const finalBalance = balance;

  return res.status(200).json(new apiResponse(200, {
    entries:        paged,
    openingBalance,
    currentBalance: finalBalance,
    total,
    totalPages:     Math.ceil(total / Number(limit)),
    currentPage:    Number(page),
  }, 'Cash book fetched'));
});

// ── GET /api/franchise/accounts/bank-book?from=&to=&page=&limit=&search=
export const getBankBook = asyncHandler(async (req, res) => {
  const { from, to, page = 1, limit = 20, search = '' } = req.query;
  const range = dateRange(from, to);
  const SaleInvoice = getSaleInvoiceModel(req.db);
  const Receipt     = getReceiptModel(req.db);
  const Payment     = getPaymentModel(req.db);
  const OpeningBalance = getOpeningBalanceModel(req.db);

  // Get current fiscal year opening balance
  const currentFY = new Date().getFullYear();
  const fyStart = `${currentFY}-${currentFY + 1}`;
  const obData = await OpeningBalance.findOne({ fiscalYear: fyStart }).lean();
  
  // Calculate opening balance for Bank
  let openingBalance = 0;
  if (obData && obData.entries) {
    const bankEntry = obData.entries.find(e => e.accountType === 'Asset' && e.accountName.toLowerCase().includes('bank'));
    openingBalance = bankEntry ? (bankEntry.openingDebit - bankEntry.openingCredit) : 0;
  }

  // Get bank transactions (UPI, Card, Cheque, NEFT, RTGS)
  const [onlineSales, receipts, payments] = await Promise.all([
    SaleInvoice.find({ invoiceDate: range, paymentMode: { $in: ['UPI','Card'] }, status: { $ne: 'Cancelled' } }).sort({ invoiceDate: 1 }).lean(),
    Receipt.find({ receiptDate: range, mode: { $in: ['Bank', 'UPI', 'Cheque', 'Card', 'NEFT', 'RTGS'] }, status: { $ne: 'Cancelled' } }).sort({ receiptDate: 1 }).lean(),
    Payment.find({ paymentDate: range, mode: { $in: ['Bank', 'UPI', 'Cheque', 'Card', 'NEFT', 'RTGS'] }, status: { $ne: 'Cancelled' } }).sort({ paymentDate: 1 }).lean(),
  ]);

  let balance = openingBalance;
  let entries = [
    { _id: 'ob1', date: new Date(range.$gte).toLocaleDateString('en-IN'), voucher: 'OB', particulars: 'Opening Balance', deposit: balance, withdrawal: null, balance, type: 'Opening' },
  ];

  // Add online sales
  onlineSales.forEach(s => {
    balance += s.totalAmt;
    entries.push({
      _id: s._id,
      date: new Date(s.invoiceDate).toLocaleDateString('en-IN'),
      voucher: s.invoiceNo,
      particulars: `Online Payment - ${s.paymentMode}`,
      deposit: s.totalAmt,
      withdrawal: null,
      balance,
      type: 'Sale'
    });
  });

  // Add receipts
  receipts.forEach(r => {
    balance += r.amount;
    entries.push({
      _id: r._id,
      date: new Date(r.receiptDate).toLocaleDateString('en-IN'),
      voucher: r.receiptNo,
      particulars: `${r.mode} - ${r.particulars}`,
      deposit: r.amount,
      withdrawal: null,
      balance,
      type: 'Receipt'
    });
  });

  // Add payments
  payments.forEach(p => {
    balance -= p.amount;
    entries.push({
      _id: p._id,
      date: new Date(p.paymentDate).toLocaleDateString('en-IN'),
      voucher: p.paymentNo,
      particulars: `${p.mode} - ${p.particulars}`,
      deposit: null,
      withdrawal: p.amount,
      balance,
      type: 'Payment'
    });
  });

  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (search) entries = entries.filter(e => e.voucher?.toLowerCase().includes(search.toLowerCase()) || e.particulars?.toLowerCase().includes(search.toLowerCase()));

  const total        = entries.length;
  const skip         = (Number(page) - 1) * Number(limit);
  const paged        = entries.slice(skip, skip + Number(limit));
  const finalBalance = balance;

  return res.status(200).json(new apiResponse(200, {
    entries:        paged,
    openingBalance,
    currentBalance: finalBalance,
    total,
    totalPages:     Math.ceil(total / Number(limit)),
    currentPage:    Number(page),
  }, 'Bank book fetched'));
});

// ── GET /api/franchise/accounts/receipts?from=&to=&page=&limit=&search=&mode=
export const getReceipts = asyncHandler(async (req, res) => {
  const { from, to, page = 1, limit = 20, search = '', mode = '' } = req.query;
  const range = dateRange(from, to);
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const filter = { invoiceDate: range, status: { $ne: 'Cancelled' } };
  if (search) filter.$or = [{ invoiceNo: new RegExp(search, 'i') }, { customerName: new RegExp(search, 'i') }];
  if (mode)   filter.paymentMode = mode;

  const skip = (Number(page) - 1) * Number(limit);
  const [invoices, total] = await Promise.all([
    SaleInvoice.find(filter).sort({ invoiceDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    SaleInvoice.countDocuments(filter),
  ]);

  return res.status(200).json(new apiResponse(200, {
    receipts: invoices.map(i => ({
      _id:         i._id,
      date:        new Date(i.invoiceDate).toLocaleDateString('en-IN'),
      voucher:     i.invoiceNo,
      particulars: `Sales - ${i.customerName}`,
      mode:        i.paymentMode,
      amount:      i.totalAmt,
    })),
    total,
    totalPages:  Math.ceil(total / Number(limit)),
    currentPage: Number(page),
  }, 'Receipts fetched'));
});

// ── POST /api/franchise/accounts/receipts
export const createReceipt = asyncHandler(async (req, res) => {
  const { receiptNo, receiptDate, particulars, amount, mode, partyName, customerId, reference, chequeNo, chequeDate, bankName, notes } = req.body;
  
  if (!receiptNo || !particulars || !amount || !mode) {
    return res.status(400).json(new apiResponse(400, null, 'Missing required fields'));
  }

  const Receipt = getReceiptModel(req.db);
  
  const receipt = new Receipt({
    receiptNo,
    receiptDate: receiptDate || new Date(),
    particulars,
    amount,
    mode,
    partyName: partyName || 'N/A',
    customerId,
    reference,
    chequeNo: mode === 'Cheque' ? chequeNo : undefined,
    chequeDate: mode === 'Cheque' ? chequeDate : undefined,
    bankName: mode === 'Cheque' ? bankName : undefined,
    notes,
    status: 'Received',
  });

  await receipt.save();
  return res.status(201).json(new apiResponse(201, receipt, 'Receipt created successfully'));
});

// ── GET /api/franchise/accounts/payments?from=&to=&page=&limit=&search=&mode=
export const getPayments = asyncHandler(async (req, res) => {
  const { from, to, page = 1, limit = 20, search = '', mode = '' } = req.query;
  const range = dateRange(from, to);
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);
  const Payment = getPaymentModel(req.db);
  const Expense = getExpenseModel(req.db);

  const filter = { paymentDate: range, status: { $ne: 'Cancelled' } };
  if (search) filter.$or = [{ paymentNo: new RegExp(search, 'i') }, { particulars: new RegExp(search, 'i') }];
  if (mode)   filter.mode = mode;

  const skip = (Number(page) - 1) * Number(limit);
  
  const [payments, purchasePayments, expenses, total] = await Promise.all([
    Payment.find(filter).sort({ paymentDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    PurchaseInvoice.find({ billDate: range, paidAmt: { $gt: 0 } }).sort({ billDate: -1 }).lean(),
    Expense.find(filter).sort({ expenseDate: -1 }).lean(),
    Payment.countDocuments(filter),
  ]);

  const allPayments = [
    ...payments.map(p => ({
      _id:         p._id,
      date:        new Date(p.paymentDate).toLocaleDateString('en-IN'),
      voucher:     p.paymentNo,
      particulars: p.particulars,
      partyName:   p.partyName,
      mode:        p.mode,
      amount:      p.amount,
      type: 'Payment'
    })),
    ...purchasePayments.map(p => ({
      _id:         p._id,
      date:        new Date(p.billDate).toLocaleDateString('en-IN'),
      voucher:     p.billNo,
      particulars: `Supplier - ${p.supplierName}`,
      partyName:   p.supplierName,
      mode:        p.paymentMode,
      amount:      p.paidAmt,
      type: 'Purchase'
    })),
    ...expenses.map(e => ({
      _id:         e._id,
      date:        new Date(e.expenseDate).toLocaleDateString('en-IN'),
      voucher:     e.expenseNo,
      particulars: e.particulars,
      partyName:   e.vendor,
      mode:        e.paymentMode,
      amount:      e.amount,
      type: 'Expense'
    })),
  ];

  const grandTotal = allPayments.reduce((s, p) => s + (p.amount || 0), 0);

  return res.status(200).json(new apiResponse(200, {
    payments: allPayments.slice(skip, skip + Number(limit)),
    total:       total + purchasePayments.length + expenses.length,
    totalPages:  Math.ceil((total + purchasePayments.length + expenses.length) / Number(limit)),
    currentPage: Number(page),
    grandTotal,
  }, 'Payments fetched'));
});

// ── POST /api/franchise/accounts/payments
export const createPayment = asyncHandler(async (req, res) => {
  const { paymentNo, paymentDate, particulars, amount, mode, partyName, supplierId, purchaseInvoiceId, reference, chequeNo, chequeDate, bankName, notes } = req.body;
  
  if (!paymentNo || !particulars || !amount || !mode) {
    return res.status(400).json(new apiResponse(400, null, 'Missing required fields'));
  }

  const Payment = getPaymentModel(req.db);
  
  const payment = new Payment({
    paymentNo,
    paymentDate: paymentDate || new Date(),
    particulars,
    amount,
    mode,
    partyName: partyName || 'N/A',
    supplierId,
    purchaseInvoiceId,
    reference,
    chequeNo: mode === 'Cheque' ? chequeNo : undefined,
    chequeDate: mode === 'Cheque' ? chequeDate : undefined,
    bankName: mode === 'Cheque' ? bankName : undefined,
    notes,
    status: 'Paid',
  });

  await payment.save();
  return res.status(201).json(new apiResponse(201, payment, 'Payment created successfully'));
});

// ── GET /api/franchise/accounts/expenses?from=&to=&category=&page=&limit=&search=
export const getExpenses = asyncHandler(async (req, res) => {
  const { from, to, category = '', page = 1, limit = 20, search = '' } = req.query;
  const range = dateRange(from, to);
  const Expense = getExpenseModel(req.db);

  const filter = { expenseDate: range, status: { $ne: 'Cancelled' } };
  if (search) filter.$or = [{ particulars: new RegExp(search, 'i') }, { vendor: new RegExp(search, 'i') }];
  if (category) filter.category = category;

  const skip = (Number(page) - 1) * Number(limit);
  const [expenses, total] = await Promise.all([
    Expense.find(filter).sort({ expenseDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    Expense.countDocuments(filter),
  ]);

  const formattedExpenses = expenses.map(e => ({
    _id:    e._id,
    date:   new Date(e.expenseDate).toLocaleDateString('en-IN'),
    particulars: e.particulars,
    amount: e.amount,
    category: e.category,
    paymentMode: e.paymentMode,
    vendor: e.vendor,
  }));

  const grandTotal = formattedExpenses.reduce((s, e) => s + e.amount, 0);

  return res.status(200).json(new apiResponse(200, {
    expenses: formattedExpenses,
    total,
    totalPages:  Math.ceil(total / Number(limit)),
    currentPage: Number(page),
    grandTotal,
  }, 'Expenses fetched'));
});

// ── POST /api/franchise/accounts/expenses
export const createExpense = asyncHandler(async (req, res) => {
  const { expenseNo, expenseDate, particulars, amount, category, paymentMode, vendor, vendorId, reference, billNo, notes } = req.body;
  
  if (!expenseNo || !particulars || !amount || !category) {
    return res.status(400).json(new apiResponse(400, null, 'Missing required fields'));
  }

  const Expense = getExpenseModel(req.db);
  
  const expense = new Expense({
    expenseNo,
    expenseDate: expenseDate || new Date(),
    particulars,
    amount,
    category,
    paymentMode: paymentMode || 'Cash',
    vendor: vendor || 'N/A',
    vendorId,
    reference,
    billNo,
    notes,
    status: 'Recorded',
  });

  await expense.save();
  return res.status(201).json(new apiResponse(201, expense, 'Expense added successfully'));
});

// ── GET /api/franchise/accounts/income?from=&to=&page=&limit=&category=
export const getIncome = asyncHandler(async (req, res) => {
  const { from, to, page = 1, limit = 20, category = '' } = req.query;
  const range = dateRange(from, to);
  const SaleInvoice = getSaleInvoiceModel(req.db);

  // Get all sales as income
  const filter = { invoiceDate: range, status: { $ne: 'Cancelled' } };
  const skip = (Number(page) - 1) * Number(limit);
  
  const [sales, total] = await Promise.all([
    SaleInvoice.find(filter).sort({ invoiceDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    SaleInvoice.countDocuments(filter),
  ]);

  const incomeEntries = sales.map(s => ({
    _id:         s._id,
    date:        new Date(s.invoiceDate).toLocaleDateString('en-IN'),
    particulars: `Sales Income - ${s.customerName}`,
    amount:      s.totalAmt,
    category:    'Sales',
  }));

  const grandTotal = incomeEntries.reduce((s, i) => s + i.amount, 0);

  return res.status(200).json(new apiResponse(200, {
    income:      incomeEntries,
    total,
    totalPages:  Math.ceil(total / Number(limit)),
    currentPage: Number(page),
    grandTotal,
  }, 'Income fetched'));
});

// ── POST /api/franchise/accounts/income
export const createIncome = asyncHandler(async (req, res) => {
  return res.status(201).json(new apiResponse(201, req.body, 'Income entry added'));
});

// ── GET /api/franchise/accounts/journal?from=&to=&page=&limit=&search=
export const getJournal = asyncHandler(async (req, res) => {
  const { from, to, page = 1, limit = 20, search = '' } = req.query;
  const range = dateRange(from, to);
  const JournalEntry = getJournalEntryModel(req.db);

  const filter = { entryDate: range, status: 'Posted' };
  if (search) filter.$or = [{ jvNo: new RegExp(search, 'i') }, { narration: new RegExp(search, 'i') }];

  const skip = (Number(page) - 1) * Number(limit);
  const [entries, total] = await Promise.all([
    JournalEntry.find(filter).sort({ entryDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    JournalEntry.countDocuments(filter),
  ]);

  return res.status(200).json(new apiResponse(200, {
    entries: entries.map(e => ({
      _id:         e._id,
      date:        new Date(e.entryDate).toLocaleDateString('en-IN'),
      jvNo:        e.jvNo,
      particulars: e.narration,
      debit:       e.totalDebit,
      credit:      e.totalCredit,
    })),
    total,
    totalPages:  Math.ceil(total / Number(limit)),
    currentPage: Number(page),
  }, 'Journal fetched'));
});

// ── POST /api/franchise/accounts/journal
export const createJournalEntry = asyncHandler(async (req, res) => {
  const { jvNo, entryDate, narration, lines } = req.body;

  if (!jvNo || !narration || !lines || lines.length < 2) {
    return res.status(400).json(new apiResponse(400, null, 'Invalid journal entry. Minimum 2 lines required'));
  }

  // Verify debit = credit
  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return res.status(400).json(new apiResponse(400, null, `Debit (${totalDebit}) must equal Credit (${totalCredit})`));
  }

  const JournalEntry = getJournalEntryModel(req.db);
  const AccountMaster = getAccountMasterModel(req.db);

  // Verify all accounts exist
  const accountNames = lines.map(l => l.accountName);
  const accounts = await AccountMaster.find({ accountName: { $in: accountNames } }).lean();

  if (accounts.length !== lines.length) {
    return res.status(400).json(new apiResponse(400, null, 'One or more accounts not found in Account Master'));
  }

  const entry = new JournalEntry({
    jvNo,
    entryDate: entryDate || new Date(),
    narration,
    lines: lines.map((l, i) => ({
      accountId: accounts[i]._id,
      accountName: l.accountName,
      accountType: accounts[i].accountType,
      debit: l.debit || 0,
      credit: l.credit || 0,
      narration: l.narration,
    })),
    totalDebit,
    totalCredit,
    status: 'Posted',
  });

  await entry.save();
  return res.status(201).json(new apiResponse(201, entry, 'Journal entry created successfully'));
});

// ── GET /api/franchise/accounts/ledger?account=&from=&to=&page=&limit=
export const getLedger = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, account = '', from = '', to = '' } = req.query;
  const range = dateRange(from, to);
  const JournalEntry = getJournalEntryModel(req.db);
  const SaleInvoice = getSaleInvoiceModel(req.db);
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);

  let entries = [];

  // Get journal entries for this account
  if (account) {
    const journals = await JournalEntry.find({ 
      'lines.accountName': account,
      entryDate: range,
      status: 'Posted'
    }).lean();

    entries.push(...journals.flatMap(j => j.lines.filter(l => l.accountName === account).map(l => ({
      _id: j._id,
      date: new Date(j.entryDate).toLocaleDateString('en-IN'),
      particular: `Journal - ${j.narration}`,
      debit: l.debit,
      credit: l.credit,
    }))));
  }

  // Get sales/purchases for account
  if (!account || account.toLowerCase().includes('debtors')) {
    const sales = await SaleInvoice.find({ invoiceDate: range, status: { $ne: 'Cancelled' } }).lean();
    entries.push(...sales.map(s => ({
      _id: s._id,
      date: new Date(s.invoiceDate).toLocaleDateString('en-IN'),
      particular: `Sales - ${s.customerName}`,
      debit: s.dueAmt > 0 ? s.dueAmt : null,
      credit: s.totalAmt,
    })));
  }

  if (!account || account.toLowerCase().includes('creditors')) {
    const purchases = await PurchaseInvoice.find({ billDate: range, status: { $ne: 'Cancelled' } }).lean();
    entries.push(...purchases.map(p => ({
      _id: p._id,
      date: new Date(p.billDate).toLocaleDateString('en-IN'),
      particular: `Purchase - ${p.supplierName}`,
      debit: p.totalAmt,
      credit: p.dueAmt > 0 ? p.dueAmt : null,
    })));
  }

  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Calculate running balance
  let balance = 0;
  entries = entries.map(e => {
    balance += (e.debit || 0) - (e.credit || 0);
    return { ...e, balance };
  });

  const total = entries.length;
  const skip  = (Number(page) - 1) * Number(limit);
  const paged = entries.slice(skip, skip + Number(limit));
  const closingBalance = entries.length > 0 ? entries[entries.length - 1].balance : 0;

  return res.status(200).json(new apiResponse(200, {
    entries: paged,
    total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
    closingBalance,
  }, 'Ledger fetched'));
});

// ── GET /api/franchise/accounts/trial-balance?date=
export const getTrialBalance = asyncHandler(async (req, res) => {
  const SaleInvoice    = getSaleInvoiceModel(req.db);
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);
  const JournalEntry = getJournalEntryModel(req.db);
  const Expense = getExpenseModel(req.db);
  const OpeningBalance = getOpeningBalanceModel(req.db);

  const currentFY = new Date().getFullYear();
  const fyStart = `${currentFY}-${currentFY + 1}`;
  const obData = await OpeningBalance.findOne({ fiscalYear: fyStart }).lean();

  // Start with opening balances
  const trialBalance = {};
  if (obData && obData.entries) {
    obData.entries.forEach(e => {
      trialBalance[e.accountName] = {
        accountType: e.accountType,
        debit: e.openingDebit || 0,
        credit: e.openingCredit || 0,
      };
    });
  }

  // Add sales
  const sales = await SaleInvoice.find({ status: { $ne: 'Cancelled' } }).lean();
  const totalSales = sales.reduce((s, inv) => s + inv.totalAmt, 0);
  trialBalance['Sales Account'] = { accountType: 'Revenue', debit: 0, credit: totalSales };

  // Add purchases
  const purchases = await PurchaseInvoice.find({ status: { $ne: 'Cancelled' } }).lean();
  const totalPurchases = purchases.reduce((s, inv) => s + inv.totalAmt, 0);
  trialBalance['Purchase Account'] = { accountType: 'Expense', debit: totalPurchases, credit: 0 };

  // Add expenses
  const expenses = await Expense.find().lean();
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  trialBalance['Expense Account'] = { accountType: 'Expense', debit: totalExpenses, credit: 0 };

  // Add journal entries
  const journals = await JournalEntry.find({ status: 'Posted' }).lean();
  journals.forEach(j => {
    j.lines.forEach(l => {
      if (!trialBalance[l.accountName]) {
        trialBalance[l.accountName] = { accountType: l.accountType, debit: 0, credit: 0 };
      }
      trialBalance[l.accountName].debit += l.debit;
      trialBalance[l.accountName].credit += l.credit;
    });
  });

  const TB = Object.entries(trialBalance).map(([name, data]) => ({
    particulars: name,
    debit: data.debit,
    credit: data.credit,
  }));

  const totalDebit  = TB.reduce((s, r) => s + (r.debit  || 0), 0);
  const totalCredit = TB.reduce((s, r) => s + (r.credit || 0), 0);

  return res.status(200).json(new apiResponse(200, { entries: TB, totalDebit, totalCredit }, 'Trial balance fetched'));
});

// ── GET /api/franchise/accounts/profit-loss?from=&to=
export const getProfitLoss = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const range = dateRange(from, to);
  const SaleInvoice    = getSaleInvoiceModel(req.db);
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);
  const Expense = getExpenseModel(req.db);

  const [salesAgg, purchAgg, expenseAgg] = await Promise.all([
    SaleInvoice.aggregate([{ $match: { invoiceDate: range, status: { $ne: 'Cancelled' } } }, { $group: { _id: null, t: { $sum: '$totalAmt' } } }]),
    PurchaseInvoice.aggregate([{ $match: { billDate: range, status: { $ne: 'Cancelled' } } }, { $group: { _id: null, t: { $sum: '$totalAmt' } } }]),
    Expense.aggregate([{ $match: { expenseDate: range } }, { $group: { _id: null, t: { $sum: '$amount' } } }]),
  ]);

  const salesAmt  = salesAgg[0]?.t  || 0;
  const purchAmt  = purchAgg[0]?.t  || 0;
  const expenses  = expenseAgg[0]?.t || 0;
  
  const grossProfit = salesAmt - purchAmt;
  const netProfit   = grossProfit - expenses;

  return res.status(200).json(new apiResponse(200, {
    income: [
      { label: 'Sales Income', amount: salesAmt },
    ],
    expenses: [
      { label: 'Cost of Goods Sold', amount: purchAmt },
      { label: 'Operating Expenses', amount: expenses },
    ],
    grossProfit,
    netProfit,
    totalIncome: salesAmt,
    totalExpenses: purchAmt + expenses,
  }, 'P&L fetched'));
});

// ── GET /api/franchise/accounts/balance-sheet?date=
export const getBalanceSheet = asyncHandler(async (req, res) => {
  const SaleInvoice = getSaleInvoiceModel(req.db);
  const PurchaseInvoice = getPurchaseInvoiceModel(req.db);
  const Expense = getExpenseModel(req.db);
  const OpeningBalance = getOpeningBalanceModel(req.db);

  const currentFY = new Date().getFullYear();
  const fyStart = `${currentFY}-${currentFY + 1}`;
  const obData = await OpeningBalance.findOne({ fiscalYear: fyStart }).lean();

  // Get totals
  const sales = await SaleInvoice.aggregate([{ $group: { _id: null, t: { $sum: '$totalAmt' }, outstanding: { $sum: '$dueAmt' } } }]);
  const purchases = await PurchaseInvoice.aggregate([{ $group: { _id: null, t: { $sum: '$totalAmt' }, outstanding: { $sum: '$dueAmt' } } }]);
  const expenses = await Expense.aggregate([{ $group: { _id: null, t: { $sum: '$amount' } } }]);

  const salesAmt = sales[0]?.t || 0;
  const purchAmt = purchases[0]?.t || 0;
  const expenseAmt = expenses[0]?.t || 0;
  const netProfit = salesAmt - purchAmt - expenseAmt;

  const currentAssets = (obData?.entries?.find(e => e.accountType === 'Asset' && e.accountName.toLowerCase().includes('cash'))?.openingDebit || 50000) + 
                        (obData?.entries?.find(e => e.accountType === 'Asset' && e.accountName.toLowerCase().includes('bank'))?.openingDebit || 200000) +
                        (sales[0]?.outstanding || 0);
  
  const fixedAssets = obData?.entries?.find(e => e.accountType === 'Asset' && !e.accountName.toLowerCase().includes('cash') && !e.accountName.toLowerCase().includes('bank'))?.openingDebit || 100000;
  
  const currentLiabilities = purchases[0]?.outstanding || 0;
  const capital = obData?.entries?.find(e => e.accountType === 'Equity')?.openingDebit || 500000;

  const totalAssets = currentAssets + fixedAssets;
  const totalLiabilities = currentLiabilities + capital + netProfit;

  return res.status(200).json(new apiResponse(200, {
    assets: {
      currentAssets: [
        { label: 'Cash in Hand', amount: 50000 },
        { label: 'Bank Balance', amount: 200000 },
        { label: 'Debtors', amount: sales[0]?.outstanding || 0 },
      ],
      fixedAssets: [
        { label: 'Furniture & Fixtures', amount: 100000 },
      ],
    },
    liabilities: {
      currentLiabilities: [
        { label: 'Creditors', amount: purchases[0]?.outstanding || 0 },
      ],
      capital: [
        { label: 'Capital Account', amount: capital },
        { label: 'Net Profit', amount: netProfit },
      ],
    },
    totalAssets,
    totalLiabilities,
  }, 'Balance sheet fetched'));
});
