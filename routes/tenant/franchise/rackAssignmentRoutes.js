import express from 'express';
import {
  getRackConfig,
  updateRackConfig,
  getRackAssignments,
  autoAssignMedicine,
  updateRackAssignment,
  deleteRackAssignment,
  getCounterMedicines,
  getRackMedicines,
  getOccupancy,
} from '../../../controllers/tenant/franchise/rackAssignmentController.js';

const router = express.Router();

// ────────────────────────────────────────────────────────────────────────────
// Rack Configuration
// ────────────────────────────────────────────────────────────────────────────
router.get('/rack-config', getRackConfig);
router.put('/rack-config', updateRackConfig);

// ────────────────────────────────────────────────────────────────────────────
// Rack Assignments
// ────────────────────────────────────────────────────────────────────────────
router.get('/rack-assignments', getRackAssignments);
router.post('/rack-assignments/auto-assign', autoAssignMedicine);
router.put('/rack-assignments/:id', updateRackAssignment);
router.delete('/rack-assignments/:id', deleteRackAssignment);

// ────────────────────────────────────────────────────────────────────────────
// Counter / Rack Queries
// ────────────────────────────────────────────────────────────────────────────
router.get('/counter/:counterId/medicines', getCounterMedicines);
router.get('/rack/:rackId/medicines', getRackMedicines);
router.get('/rack-occupancy', getOccupancy);

export default router;
