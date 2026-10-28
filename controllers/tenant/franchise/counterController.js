import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getCounterModel } from '../../../models/tenant/franchise/Counter.model.js';
import mongoose from 'mongoose';

console.log('✅ counterController loaded');

/**
 * GET /api/franchise/master/counters
 * Fetch all active counters
 */
export const getCounters = asyncHandler(async (req, res) => {
  console.log('📌 [GET /counters] Fetching all counters...');
  
  try {
    const Counter = getCounterModel(req.db);
    
    const counters = await Counter.find({ isActive: true })
      .sort({ code: 1 })
      .lean();

    console.log(`✅ Found ${counters.length} counters`);
    
    return res.status(200).json(
      new apiResponse(200, counters, `${counters.length} counters fetched`)
    );
  } catch (error) {
    console.error('❌ Error fetching counters:', error.message);
    throw error;
  }
});

/**
 * GET /api/franchise/master/counters/:id
 * Fetch single counter by ID
 */
export const getCounterById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  console.log(`📌 [GET /counters/:id] ID: ${id}`);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    console.warn(`⚠️ Invalid ObjectId: ${id}`);
    return res.status(400).json(new apiResponse(400, null, 'Invalid counter ID format'));
  }

  try {
    const Counter = getCounterModel(req.db);
    const counter = await Counter.findById(id).lean();

    if (!counter) {
      console.warn(`⚠️ Counter not found: ${id}`);
      return res.status(404).json(new apiResponse(404, null, 'Counter not found'));
    }

    console.log(`✅ Counter found: ${counter.code}`);
    return res.status(200).json(new apiResponse(200, counter, 'Counter fetched'));
  } catch (error) {
    console.error('❌ Error fetching counter:', error.message);
    throw error;
  }
});

/**
 * POST /api/franchise/master/counters
 * Create new counter
 * Body: { code, name, location, description }
 */
export const createCounter = asyncHandler(async (req, res) => {
  const { code, name, location, description } = req.body;
  console.log(`📌 [POST /counters] Creating counter:`, { code, name, location });

  // Validation
  if (!code || !name) {
    console.warn('⚠️ Missing required fields: code or name');
    return res.status(400).json(
      new apiResponse(400, null, 'Code and Name are required')
    );
  }

  try {
    const Counter = getCounterModel(req.db);

    // Check if code exists
    const existing = await Counter.findOne({ code: code.trim().toUpperCase() });
    if (existing) {
      console.warn(`⚠️ Counter code already exists: ${code}`);
      return res.status(400).json(
        new apiResponse(400, null, `Counter with code "${code}" already exists`)
      );
    }

    // Create
    const newCounter = await Counter.create({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      location: location?.trim() || '',
      description: description?.trim() || '',
      status: 'Active',
      isActive: true,
    });

    console.log(`✅ Counter created: ${newCounter._id} - ${newCounter.code}`);

    return res.status(201).json(
      new apiResponse(201, newCounter, 'Counter created successfully')
    );
  } catch (error) {
    console.error('❌ Error creating counter:', error.message);
    throw error;
  }
});

/**
 * PUT /api/franchise/master/counters/:id
 * Update counter
 */
export const updateCounter = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { code, name, location, description, status } = req.body;
  console.log(`📌 [PUT /counters/:id] Updating counter ID: ${id}`, { code, name });

  if (!mongoose.Types.ObjectId.isValid(id)) {
    console.warn(`⚠️ Invalid ObjectId: ${id}`);
    return res.status(400).json(new apiResponse(400, null, 'Invalid counter ID format'));
  }

  try {
    const Counter = getCounterModel(req.db);

    // Check code uniqueness
    if (code) {
      const existing = await Counter.findOne({
        code: code.trim().toUpperCase(),
        _id: { $ne: id }
      });
      if (existing) {
        console.warn(`⚠️ Counter code already exists: ${code}`);
        return res.status(400).json(
          new apiResponse(400, null, `Counter code "${code}" already in use`)
        );
      }
    }

    const updateData = {};
    if (code) updateData.code = code.trim().toUpperCase();
    if (name) updateData.name = name.trim();
    if (location !== undefined) updateData.location = location.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (status) updateData.status = status;

    const updated = await Counter.findByIdAndUpdate(id, updateData, { new: true });

    if (!updated) {
      console.warn(`⚠️ Counter not found: ${id}`);
      return res.status(404).json(new apiResponse(404, null, 'Counter not found'));
    }

    console.log(`✅ Counter updated: ${updated._id}`);
    return res.status(200).json(
      new apiResponse(200, updated, 'Counter updated successfully')
    );
  } catch (error) {
    console.error('❌ Error updating counter:', error.message);
    throw error;
  }
});

/**
 * DELETE /api/franchise/master/counters/:id
 * Soft delete counter (mark as inactive)
 */
export const deleteCounter = asyncHandler(async (req, res) => {
  const { id } = req.params;
  console.log(`📌 [DELETE /counters/:id] Deleting counter: ${id}`);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    console.warn(`⚠️ Invalid ObjectId: ${id}`);
    return res.status(400).json(new apiResponse(400, null, 'Invalid counter ID format'));
  }

  try {
    const Counter = getCounterModel(req.db);

    const deleted = await Counter.findByIdAndUpdate(
      id,
      { isActive: false, status: 'Inactive' },
      { new: true }
    );

    if (!deleted) {
      console.warn(`⚠️ Counter not found: ${id}`);
      return res.status(404).json(new apiResponse(404, null, 'Counter not found'));
    }

    console.log(`✅ Counter deleted (soft): ${deleted._id}`);
    return res.status(200).json(
      new apiResponse(200, deleted, 'Counter deleted successfully')
    );
  } catch (error) {
    console.error('❌ Error deleting counter:', error.message);
    throw error;
  }
});
