import express from 'express';
import {
  getLowStockItems,
} from '../../../controllers/tenant/franchise/dashboardController.js';

const router = express.Router();

router.get('/low-stock', getLowStockItems);

export default router;
