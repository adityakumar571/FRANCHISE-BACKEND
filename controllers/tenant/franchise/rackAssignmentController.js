/* eslint-disable */
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getRackConfigModel } from '../../../models/tenant/franchise/RackConfig.model.js';
import { getRackAssignmentModel } from '../../../models/tenant/franchise/RackAssignment.model.js';
import {
  getNextAvailablePosition,
  validatePosition,
  parsePosition,
  generatePositionString,
  getMedicinesInCounter,
  getMedicinesInRack,
  getOccupancyStats,
  updateAssignment as updateAssignmentUtil,
} from '../../../utils/rackAutoAssignment.js';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/rack-config
// Get current rack configuration for franchise
// ────────────────────────────────────────────────────────────────────────────
export const getRackConfig = asyncHandler(async (req, res) => {
  const RackConfig = getRackConfigModel(req.db);
  const franchiseId = req.user?._id;

  let config = await RackConfig.findOne({ franchiseId }).lean();

  if (!config) {
    // Return default config if not exists
    config = {
      franchiseId,
      enableAutoAssign: true,
      autoAssignStrategy: 'round-robin',
      defaultCounterId: 'Counter-1',
      defaultRackId: 'RACK-A',
      totalCounters: 1,
      racksPerCounter: 5,
      shelvesPerRack: 10,
      rowsPerShelf: 5,
      columnsPerRow: 20,
      totalSlots: 2500,
      counters: [
        {
          counterId: 'Counter-1',
          counterName: 'Main Counter',
          defaultRackId: 'RACK-A',
          shelfCount: 10,
          rowCount: 5,
          colCount: 20,
          autoAssignStrategy: 'round-robin',
          isActive: true,
        },
      ],
    };
  }

  return res.status(200).json(new apiResponse(200, config, 'Rack configuration fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/franchise/rack-config
// Update rack configuration
// ────────────────────────────────────────────────────────────────────────────
export const updateRackConfig = asyncHandler(async (req, res) => {
  const RackConfig = getRackConfigModel(req.db);
  const franchiseId = req.user?._id;
  const { enableAutoAssign, autoAssignStrategy, counters, totalCounters, racksPerCounter } = req.body;

  if (!franchiseId) {
    return res.status(400).json(new apiResponse(400, null, 'User ID required'));
  }

  const updateData = {
    enableAutoAssign: enableAutoAssign !== undefined ? enableAutoAssign : true,
    autoAssignStrategy: autoAssignStrategy || 'round-robin',
    lastUpdatedBy: franchiseId,
  };

  if (counters) updateData.counters = counters;
  if (totalCounters) updateData.totalCounters = totalCounters;
  if (racksPerCounter) updateData.racksPerCounter = racksPerCounter;

  // Calculate total slots if dimensions changed
  if (counters || totalCounters || racksPerCounter) {
    const tc = totalCounters || counters?.length || 1;
    const rc = racksPerCounter || 5;
    const sp = (counters?.[0]?.shelfCount) || 10;
    const rs = (counters?.[0]?.rowCount) || 5;
    const cp = (counters?.[0]?.colCount) || 20;
    updateData.totalSlots = tc * rc * sp * rs * cp;
  }

  const config = await RackConfig.findOneAndUpdate({ franchiseId }, updateData, { new: true, upsert: true });

  return res.status(200).json(new apiResponse(200, config, 'Rack configuration updated'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/rack-assignments?counterId=&rackId=&page=
// Get rack assignments with filtering
// ────────────────────────────────────────────────────────────────────────────
export const getRackAssignments = asyncHandler(async (req, res) => {
  const { counterId = '', rackId = '', medicineId = '', page = 1, limit = 50 } = req.query;
  const RackAssignment = getRackAssignmentModel(req.db);
  const franchiseId = req.user?._id;

  const filter = { franchiseId, isActive: true };
  if (counterId) filter.counterId = counterId;
  if (rackId) filter.rackId = rackId;
  if (medicineId) filter.medicineId = medicineId;

  const skip = (Number(page) - 1) * Number(limit);
  const [assignments, total] = await Promise.all([
    RackAssignment.find(filter)
      .populate('medicineId', 'name category mrp')
      .sort({ position: 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    RackAssignment.countDocuments(filter),
  ]);

  const result = assignments.map((a) => ({
    _id: a._id,
    medicineId: a.medicineId?._id,
    medicineName: a.medicineName,
    medicineBrand: a.medicineId?.name,
    category: a.medicineId?.category,
    batchNo: a.batchNo,
    counterId: a.counterId,
    rackId: a.rackId,
    position: a.position,
    assignedVia: a.assignedVia,
    grnId: a.grnId,
    createdAt: a.createdAt,
  }));

  return res.status(200).json(new apiResponse(200, {
    assignments: result,
    total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
  }, 'Rack assignments fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/rack-assignments/auto-assign
// Auto-assign a medicine to next available position
// ────────────────────────────────────────────────────────────────────────────
export const autoAssignMedicine = asyncHandler(async (req, res) => {
  const { medicineId, medicineName, batchNo, category, grnId } = req.body;
  const RackConfig = getRackConfigModel(req.db);
  const RackAssignment = getRackAssignmentModel(req.db);
  const franchiseId = req.user?._id;

  if (!medicineId || !medicineName) {
    return res.status(400).json(new apiResponse(400, null, 'Medicine ID and name required'));
  }

  // Get franchise rack config
  let config = await RackConfig.findOne({ franchiseId }).lean();
  if (!config) {
    config = {
      enableAutoAssign: true,
      autoAssignStrategy: 'round-robin',
      counters: [
        {
          counterId: 'Counter-1',
          defaultRackId: 'RACK-A',
          shelfCount: 10,
          rowCount: 5,
          colCount: 20,
        },
      ],
    };
  }

  // Get next position
  const position = getNextAvailablePosition(config, config.autoAssignStrategy, category);

  // Validate position
  const validation = validatePosition(position, config);
  if (!validation.valid) {
    return res.status(400).json(new apiResponse(400, null, `Position validation failed: ${validation.errors.join(', ')}`));
  }

  // Create assignment
  const assignment = await RackAssignment.create({
    franchiseId,
    medicineId,
    medicineName,
    batchNo: batchNo || null,
    counterId: position.counterId,
    rackId: position.rackId,
    shelf: position.shelf,
    row: position.row,
    column: position.column,
    position: position.position,
    assignedVia: 'auto',
    assignedBy: franchiseId,
    grnId: grnId || null,
    isActive: true,
  });

  console.log(`✅ Auto-assigned medicine: ${medicineName} → ${position.position}`);

  return res.status(201).json(new apiResponse(201, {
    _id: assignment._id,
    position: assignment.position,
    counterId: assignment.counterId,
    rackId: assignment.rackId,
    shelf: assignment.shelf,
    row: assignment.row,
    column: assignment.column,
  }, 'Medicine auto-assigned'));
});

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/franchise/rack-assignments/:id
// Manual override assignment (move to different position)
// ────────────────────────────────────────────────────────────────────────────
export const updateRackAssignment = asyncHandler(async (req, res) => {
  const { counterId, rackId, shelf, row, column } = req.body;
  const RackAssignment = getRackAssignmentModel(req.db);
  const franchiseId = req.user?._id;

  if (!counterId || !rackId || !shelf || !row || !column) {
    return res.status(400).json(new apiResponse(400, null, 'All position fields required'));
  }

  const newPosition = {
    counterId,
    rackId,
    shelf: Number(shelf),
    row,
    column: Number(column),
  };

  const updated = await updateAssignmentUtil(RackAssignment, req.params.id, newPosition, franchiseId);

  if (!updated) {
    return res.status(404).json(new apiResponse(404, null, 'Assignment not found'));
  }

  return res.status(200).json(new apiResponse(200, {
    _id: updated._id,
    position: updated.position,
  }, 'Assignment updated'));
});

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/franchise/rack-assignments/:id
// Deactivate assignment
// ────────────────────────────────────────────────────────────────────────────
export const deleteRackAssignment = asyncHandler(async (req, res) => {
  const RackAssignment = getRackAssignmentModel(req.db);

  const deleted = await RackAssignment.findByIdAndUpdate(
    req.params.id,
    { isActive: false, updatedAt: new Date() },
    { new: true }
  );

  if (!deleted) {
    return res.status(404).json(new apiResponse(404, null, 'Assignment not found'));
  }

  return res.status(200).json(new apiResponse(200, { _id: deleted._id }, 'Assignment deactivated'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/counter/:counterId/medicines
// Get all medicines in a specific counter
// ────────────────────────────────────────────────────────────────────────────
export const getCounterMedicines = asyncHandler(async (req, res) => {
  const { counterId } = req.params;
  const RackAssignment = getRackAssignmentModel(req.db);
  const franchiseId = req.user?._id;

  const medicines = await getMedicinesInCounter(RackAssignment, franchiseId, counterId);

  return res.status(200).json(new apiResponse(200, medicines, `Medicines in ${counterId} fetched`));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/rack/:rackId/medicines
// Get all medicines in a specific rack
// ────────────────────────────────────────────────────────────────────────────
export const getRackMedicines = asyncHandler(async (req, res) => {
  const { rackId } = req.params;
  const RackAssignment = getRackAssignmentModel(req.db);
  const franchiseId = req.user?._id;

  const medicines = await getMedicinesInRack(RackAssignment, franchiseId, rackId);

  return res.status(200).json(new apiResponse(200, medicines, `Medicines in ${rackId} fetched`));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/rack-occupancy
// Get occupancy statistics
// ────────────────────────────────────────────────────────────────────────────
export const getOccupancy = asyncHandler(async (req, res) => {
  const RackConfig = getRackConfigModel(req.db);
  const RackAssignment = getRackAssignmentModel(req.db);
  const franchiseId = req.user?._id;

  const config = await RackConfig.findOne({ franchiseId }).lean();
  if (!config) {
    return res.status(404).json(new apiResponse(404, null, 'Rack configuration not found'));
  }

  const stats = await getOccupancyStats(RackAssignment, config);

  return res.status(200).json(new apiResponse(200, stats, 'Occupancy statistics fetched'));
});
