import express from 'express';
import {
  getPurchaseDashboard,
  getPurchaseInvoices,
  getPurchaseTopItems,
  getPurchaseOrders,
  createPurchaseOrder,
  getPurchaseOrderById,
  updatePurchaseOrderStatus,
  getGRNList,
  createGRN,
  quickCreateGRN,
  assignMedicinesToRacks,
  getGRNById,
  getPurchaseReturns,
  createPurchaseReturn,
  getSupplierLedgerSummary,
  getPurchaseSupplierLedger,
  getPurchaseLiveRate,
  debugSuppliers,
  getSupplierMedicines,
} from '../../../controllers/tenant/franchise/purchaseController.js';

const router = express.Router();

// Dashboard & Invoices
router.get('/dashboard',               getPurchaseDashboard);
router.get('/invoices',                getPurchaseInvoices);
router.get('/top-items',               getPurchaseTopItems);

// Purchase Orders
router.get('/orders',                  getPurchaseOrders);
router.post('/orders',                 createPurchaseOrder);
router.get('/orders/:id',              getPurchaseOrderById);
router.put('/orders/:id/status',       updatePurchaseOrderStatus);

// GRN
router.get('/grn',                     getGRNList);
router.post('/grn',                    createGRN);
router.post('/grn/quick-create',       quickCreateGRN);           // ← NEW: Auto create GRN
router.put('/grn/:id/assign-all',      assignMedicinesToRacks);   // ← NEW: Bulk assign
router.get('/grn/:id',                 getGRNById);

// Supplier Medicines (for bulk PO creation)
router.get('/supplier/:supplierId/medicines', getSupplierMedicines);

// Purchase Returns
router.get('/returns',                 getPurchaseReturns);
router.post('/returns',                createPurchaseReturn);

// Supplier Ledger
router.get('/supplier-ledger',         getPurchaseSupplierLedger);   // full paginated ledger
router.get('/supplier-ledger-summary', getSupplierLedgerSummary);    // summary (legacy compat)

// Live Rate Compare
router.get('/live-rate',               getPurchaseLiveRate);

// Debug endpoint
router.get('/debug-suppliers',         debugSuppliers);

export default router;
