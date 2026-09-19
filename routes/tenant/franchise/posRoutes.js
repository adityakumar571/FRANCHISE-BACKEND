import express from 'express';
import {
  searchMedicines,
  getMedicineByBarcode,
  searchCustomers,
  addCustomer,
  getHoldBills,
  createHoldBill,
  deleteHoldBill,
  createSaleInvoice,
  getSaleInvoice,
  getSaleInvoiceByNo,
  createReturnBill,
  createExchangeBill,
  createCreditSale,
  getDayClosingSummary,
  submitDayClosing,
} from '../../../controllers/tenant/franchise/posController.js';

const router = express.Router();

// ── Medicine search & barcode ──────────────────────────────────────
router.get('/medicines/search',           searchMedicines);
router.get('/medicines/barcode/:barcode', getMedicineByBarcode);

// ── Customer search & add ──────────────────────────────────────────
router.get('/customers/search',           searchCustomers);
router.post('/customers',                 addCustomer);

// ── Hold Bills ─────────────────────────────────────────────────────
router.get('/hold-bills',                 getHoldBills);
router.post('/hold-bills',                createHoldBill);
router.delete('/hold-bills/:id',          deleteHoldBill);

// ── Sale Invoices ──────────────────────────────────────────────────
router.post('/sales/invoice',                 createSaleInvoice);
router.get('/sales/invoice/:id',              getSaleInvoice);
router.get('/sales/invoice-by-no/:invoiceNo', getSaleInvoiceByNo);
router.post('/sales/returns',                 createReturnBill);
router.post('/sales/exchange',                createExchangeBill);
router.post('/sales/credit-sale',             createCreditSale);

// ── Day Closing ────────────────────────────────────────────────────
router.get('/day-closing/summary',        getDayClosingSummary);
router.post('/day-closing',               submitDayClosing);

export default router;
