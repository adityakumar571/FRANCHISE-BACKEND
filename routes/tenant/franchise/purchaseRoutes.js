import express from 'express';
import {
  getRecentPurchases,
} from '../../../controllers/tenant/franchise/dashboardController.js';

const router = express.Router();

router.get('/recent', getRecentPurchases);

export default router;
