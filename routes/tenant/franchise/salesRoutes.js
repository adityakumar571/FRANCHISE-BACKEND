import express from 'express';
import {
  getRecentSales,
  getRecentPurchases,
  getLowStockItems,
} from '../../../controllers/tenant/franchise/dashboardController.js';

const router = express.Router();

router.get('/recent',            getRecentSales);

export default router;
