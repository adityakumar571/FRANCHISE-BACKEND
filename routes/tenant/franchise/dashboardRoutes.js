import express from 'express';
import {
  getDashboardSummary,
  getDashboardLiveRates,
  getDashboardPriceTrend,
  getDashboardRateAlerts,
  getDashboardTopMoving,
  getDashboardExpiryAlerts,
  getRecentSales,
  getRecentPurchases,
  getLowStockItems,
} from '../../../controllers/tenant/franchise/dashboardController.js';

const router = express.Router();

// Dashboard KPI Summary
router.get('/summary',       getDashboardSummary);

// Live Wholesale Rates for a medicine
router.get('/live-rates',    getDashboardLiveRates);

// Price Trend for a medicine
router.get('/price-trend',   getDashboardPriceTrend);

// Rate Alerts
router.get('/rate-alerts',   getDashboardRateAlerts);

// Top Moving Items
router.get('/top-moving',    getDashboardTopMoving);

// Expiry Alerts
router.get('/expiry-alerts', getDashboardExpiryAlerts);

export default router;
