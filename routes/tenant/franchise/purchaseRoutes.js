import express from 'express';
import {
  getRecentPurchases,
} from '../../../controllers/tenant/franchise/dashboardController.js';
import {
  getPurchaseOrders,
  createPurchaseOrder,
  getPurchaseOrderById,
  updatePurchaseOrderStatus,
  getPurchaseLiveRate,
} from '../../../controllers/tenant/franchise/purchaseController.js';

const router = express.Router();

router.get('/recent', getRecentPurchases);

// Purchase Order routes
router.get('/orders', getPurchaseOrders);
router.post('/orders', createPurchaseOrder);
router.get('/orders/:id', getPurchaseOrderById);
router.put('/orders/:id/status', updatePurchaseOrderStatus);

// Live rate comparison
router.get('/live-rate', getPurchaseLiveRate);

export default router;
