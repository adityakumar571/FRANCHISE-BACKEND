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
  getGRNById,
  getPurchaseReturns,
  createPurchaseReturn,
} from '../../../controllers/tenant/franchise/purchaseController.js';

const router = express.Router();

// Dashboard & Invoices
router.get('/dashboard',              getPurchaseDashboard);
router.get('/invoices',               getPurchaseInvoices);
router.get('/top-items',              getPurchaseTopItems);

// Purchase Orders
router.get('/orders',                 getPurchaseOrders);
router.post('/orders',                createPurchaseOrder);
router.get('/orders/:id',             getPurchaseOrderById);
router.put('/orders/:id/status',      updatePurchaseOrderStatus);

// GRN
router.get('/grn',                    getGRNList);
router.post('/grn',                   createGRN);
router.get('/grn/:id',                getGRNById);

// Purchase Returns
router.get('/returns',                getPurchaseReturns);
router.post('/returns',               createPurchaseReturn);

export default router;
