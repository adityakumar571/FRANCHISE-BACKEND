import express from 'express';
import {
  getLiveRates,
  compareSuppliers,
  getPriceHistory,
  getBestDeal,
  getSupplierStock,
  getSchemes,
  getSupplierRatings,
  placeCartOrder,
  placeOrder,
  getOrderTracking,
  getPurchaseCart,
} from '../../../controllers/tenant/franchise/liveRatesController.js';

const router = express.Router();

router.get('/',                          getLiveRates);
router.get('/compare-suppliers',         compareSuppliers);
router.get('/price-history',             getPriceHistory);
router.get('/best-deal',                 getBestDeal);
router.get('/supplier-stock',            getSupplierStock);
router.get('/schemes',                   getSchemes);
router.get('/supplier-ratings',          getSupplierRatings);
router.get('/purchase-cart',             getPurchaseCart);
router.post('/purchase-cart',            placeCartOrder);
router.post('/place-order',              placeOrder);
router.get('/order-tracking/all',        getOrderTracking);
router.get('/order-tracking/:orderId',   getOrderTracking);

export default router;
