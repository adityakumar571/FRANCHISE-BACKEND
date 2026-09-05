import express from 'express';
import {
  getInventoryDashboard,
  getStockList,
  getNearExpiry,
  getExpiredStock,
  getDamagedStock,
  getDeadStock,
  getFastMoving,
  getSlowMoving,
  getStockLedger,
  getBatchExpiry,
  getRacks,
  createRack,
  getStockAdjustments,
  createStockAdjustment,
  approveStockAdjustment,
  getInventoryAudits,
  createInventoryAudit,
  getPhysicalVerification,
  submitPhysicalVerification,
} from '../../../controllers/tenant/franchise/inventoryController.js';

const router = express.Router();

router.get('/dashboard',                   getInventoryDashboard);
router.get('/stock',                       getStockList);
router.get('/near-expiry',                 getNearExpiry);
router.get('/expired',                     getExpiredStock);
router.get('/damaged',                     getDamagedStock);
router.get('/dead-stock',                  getDeadStock);
router.get('/fast-moving',                 getFastMoving);
router.get('/slow-moving',                 getSlowMoving);
router.get('/ledger',                      getStockLedger);
router.get('/batch-expiry',               getBatchExpiry);
router.get('/rack',                        getRacks);
router.post('/rack',                       createRack);
router.get('/adjustments',                 getStockAdjustments);
router.post('/adjustments',                createStockAdjustment);
router.put('/adjustments/:id/approve',     approveStockAdjustment);
router.get('/audit',                       getInventoryAudits);
router.post('/audit',                      createInventoryAudit);
router.get('/physical-verification',       getPhysicalVerification);
router.post('/physical-verification',      submitPhysicalVerification);

export default router;
