import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getCounterModel } from '../../../models/tenant/franchise/Counter.model.js';
import { getRackModel } from '../../../models/tenant/franchise/Rack.model.js';
import mongoose from 'mongoose';

console.log('✅ rackController loaded');

/**
 * GET /api/franchise/master/racks
 * Fetch all racks (optionally filtered by counterId)
 * Query: ?counterId=...
 */
export const getRacks = asyncHandler(async (req, res) => {
  const { counterId } = req.query;
  console.log(`📌 [GET /racks] Fetching racks... counterId filter: ${counterId || 'none'}`);

  try {
    const Rack = getRackModel(req.db);
    let query = { isActive: true };

    // Apply counter filter if provided
    if (counterId) {
      if (!mongoose.Types.ObjectId.isValid(counterId)) {
        console.warn(`⚠️ Invalid counterId format: ${counterId}`);
        return res.status(400).json(new apiResponse(400, null, 'Invalid counter ID format'));
      }
      query.counterId = new mongoose.Types.ObjectId(counterId);
      console.log(`📍 Filtering by counter: ${counterId}`);
    }

    const racks = await Rack.find(query)
      .populate('counterId', 'code name location')
      .sort({ code: 1 })
      .lean();

    console.log(`✅ Found ${racks.length} racks`);
    return res.status(200).json(
      new apiResponse(200, racks, `${racks.length} racks fetched`)
    );
  } catch (error) {
    console.error('❌ Error fetching racks:', error.message);
    throw error;
  }
});

/**
 * GET /api/franchise/master/racks/:id
 * Fetch single rack by ID
 */
export const getRackById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  console.log(`📌 [GET /racks/:id] ID: ${id}`);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    console.warn(`⚠️ Invalid ObjectId: ${id}`);
    return res.status(400).json(new apiResponse(400, null, 'Invalid rack ID format'));
  }

  try {
    const Rack = getRackModel(req.db);
    const rack = await Rack.findById(id)
      .populate('counterId', 'code name location')
      .lean();

    if (!rack) {
      console.warn(`⚠️ Rack not found: ${id}`);
      return res.status(404).json(new apiResponse(404, null, 'Rack not found'));
    }

    console.log(`✅ Rack found: ${rack.code}`);
    return res.status(200).json(new apiResponse(200, rack, 'Rack fetched'));
  } catch (error) {
    console.error('❌ Error fetching rack:', error.message);
    throw error;
  }
});

/**
 * POST /api/franchise/master/racks
 * Create new rack
 * Body: { counterId, code, name, shelves, capacity, description }
 */
export const createRack = asyncHandler(async (req, res) => {
  const { counterId, code, name, shelves, capacity, description } = req.body;
  console.log(`📌 [POST /racks] Creating rack:`, { counterId, code, name, shelves, capacity });

  // Validation
  if (!counterId || !code || !name) {
    console.warn('⚠️ Missing required fields');
    return res.status(400).json(
      new apiResponse(400, null, 'Counter ID, Code, and Name are required')
    );
  }

  if (!mongoose.Types.ObjectId.isValid(counterId)) {
    console.warn(`⚠️ Invalid counterId format: ${counterId}`);
    return res.status(400).json(new apiResponse(400, null, 'Invalid counter ID format'));
  }

  try {
    const Counter = getCounterModel(req.db);
    const Rack = getRackModel(req.db);

    // Verify counter exists
    const counterExists = await Counter.findById(counterId);
    if (!counterExists) {
      console.warn(`⚠️ Counter not found: ${counterId}`);
      return res.status(404).json(new apiResponse(404, null, 'Counter not found'));
    }
    console.log(`✅ Counter verified: ${counterExists.code}`);

    // Check if rack code exists
    const existingRack = await Rack.findOne({ code: code.trim().toUpperCase() });
    if (existingRack) {
      console.warn(`⚠️ Rack code already exists: ${code}`);
      return res.status(400).json(
        new apiResponse(400, null, `Rack with code "${code}" already exists`)
      );
    }

    // Create rack
    const newRack = await Rack.create({
      counterId: new mongoose.Types.ObjectId(counterId),
      code: code.trim().toUpperCase(),
      name: name.trim(),
      shelves: shelves || 5,
      capacity: capacity || 200,
      description: description?.trim() || '',
      status: 'Active',
      isActive: true,
    });

    console.log(`✅ Rack created: ${newRack._id} - ${newRack.code}`);

    // Populate and return
    const populatedRack = await Rack.findById(newRack._id)
      .populate('counterId', 'code name location');

    return res.status(201).json(
      new apiResponse(201, populatedRack, 'Rack created successfully')
    );
  } catch (error) {
    console.error('❌ Error creating rack:', error.message);
    throw error;
  }
});

/**
 * PUT /api/franchise/master/racks/:id
 * Update rack
 */
export const updateRack = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { code, name, shelves, capacity, description, status } = req.body;
  console.log(`📌 [PUT /racks/:id] Updating rack: ${id}`, { code, name });

  if (!mongoose.Types.ObjectId.isValid(id)) {
    console.warn(`⚠️ Invalid ObjectId: ${id}`);
    return res.status(400).json(new apiResponse(400, null, 'Invalid rack ID format'));
  }

  try {
    const Rack = getRackModel(req.db);

    // Check code uniqueness
    if (code) {
      const existing = await Rack.findOne({
        code: code.trim().toUpperCase(),
        _id: { $ne: id }
      });
      if (existing) {
        console.warn(`⚠️ Rack code already exists: ${code}`);
        return res.status(400).json(
          new apiResponse(400, null, `Rack code "${code}" already in use`)
        );
      }
    }

    const updateData = {};
    if (code) updateData.code = code.trim().toUpperCase();
    if (name) updateData.name = name.trim();
    if (shelves !== undefined) updateData.shelves = shelves;
    if (capacity !== undefined) updateData.capacity = capacity;
    if (description !== undefined) updateData.description = description.trim();
    if (status) updateData.status = status;

    const updated = await Rack.findByIdAndUpdate(id, updateData, { new: true })
      .populate('counterId', 'code name location');

    if (!updated) {
      console.warn(`⚠️ Rack not found: ${id}`);
      return res.status(404).json(new apiResponse(404, null, 'Rack not found'));
    }

    console.log(`✅ Rack updated: ${updated._id}`);
    return res.status(200).json(
      new apiResponse(200, updated, 'Rack updated successfully')
    );
  } catch (error) {
    console.error('❌ Error updating rack:', error.message);
    throw error;
  }
});

/**
 * DELETE /api/franchise/master/racks/:id
 * Soft delete rack (mark as inactive)
 */
export const deleteRack = asyncHandler(async (req, res) => {
  const { id } = req.params;
  console.log(`📌 [DELETE /racks/:id] Deleting rack: ${id}`);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    console.warn(`⚠️ Invalid ObjectId: ${id}`);
    return res.status(400).json(new apiResponse(400, null, 'Invalid rack ID format'));
  }

  try {
    const Rack = getRackModel(req.db);

    const deleted = await Rack.findByIdAndUpdate(
      id,
      { isActive: false, status: 'Inactive' },
      { new: true }
    ).populate('counterId', 'code name location');

    if (!deleted) {
      console.warn(`⚠️ Rack not found: ${id}`);
      return res.status(404).json(new apiResponse(404, null, 'Rack not found'));
    }

    console.log(`✅ Rack deleted (soft): ${deleted._id}`);
    return res.status(200).json(
      new apiResponse(200, deleted, 'Rack deleted successfully')
    );
  } catch (error) {
    console.error('❌ Error deleting rack:', error.message);
    throw error;
  }
});
