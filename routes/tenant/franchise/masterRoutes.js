import express from 'express';

// Import Counter controllers
import {
  getCounters,
  getCounterById,
  createCounter,
  updateCounter,
  deleteCounter,
} from '../../../controllers/tenant/franchise/counterController.js';

// Import Rack controllers
import {
  getRacks,
  getRackById,
  createRack,
  updateRack,
  deleteRack,
} from '../../../controllers/tenant/franchise/rackController.js';

const router = express.Router();

console.log('📋 masterRoutes loaded');

/* ════════════════════════════════════════════════════════════════
   COUNTER MASTER ROUTES
   Base: /api/franchise/master/counters
═════════════════════════════════════════════════════════════════════ */

router.get('/counters', getCounters);                    // GET all
router.post('/counters', createCounter);                // POST create
router.get('/counters/:id', getCounterById);            // GET by ID
router.put('/counters/:id', updateCounter);             // PUT update
router.delete('/counters/:id', deleteCounter);          // DELETE

/* ════════════════════════════════════════════════════════════════
   RACK MASTER ROUTES
   Base: /api/franchise/master/racks
   Optional query: ?counterId=...
═════════════════════════════════════════════════════════════════════ */

router.get('/racks', getRacks);                         // GET all (with filter)
router.post('/racks', createRack);                      // POST create
router.get('/racks/:id', getRackById);                  // GET by ID
router.put('/racks/:id', updateRack);                   // PUT update
router.delete('/racks/:id', deleteRack);                // DELETE

export default router;
