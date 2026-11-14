/**
 * Rack Auto-Assignment Utility
 * Handles automatic counter-rack-position assignment during GRN entry
 * 
 * Features:
 * - Auto-assign medicines to counter/rack/position
 * - Different strategies (round-robin, fill-first, category-based)
 * - Manual override support
 * - Validation against rack dimensions
 */

/**
 * Get next available position based on strategy
 * @param {Object} rackConfig - Franchise rack configuration
 * @param {String} strategy - Assignment strategy
 * @param {String} category - Medicine category (for category-based strategy)
 * @returns {Object} { counterId, rackId, shelf, row, column, position }
 */
export const getNextAvailablePosition = (rackConfig, strategy = 'round-robin', category = null) => {
  if (!rackConfig) {
    return {
      counterId: 'Counter-1',
      rackId: 'RACK-A',
      shelf: 1,
      row: 'A',
      column: 1,
      position: 'Counter-1>RACK-A>1-A-1',
    };
  }

  switch (strategy) {
    case 'round-robin':
      return getRoundRobinPosition(rackConfig);
    
    case 'fill-first-rack':
      return getFillFirstRackPosition(rackConfig);
    
    case 'category-based':
      return getCategoryBasedPosition(rackConfig, category);
    
    default:
      return getRoundRobinPosition(rackConfig);
  }
};

/**
 * Round-Robin strategy
 * Cycles through: Counter → Rack → Shelf → Row → Column
 */
const getRoundRobinPosition = (rackConfig) => {
  const defaultCounter = rackConfig.counters?.[0];
  if (!defaultCounter) {
    return generateDefaultPosition();
  }

  const counterId = defaultCounter.counterId || 'Counter-1';
  const rackId = defaultCounter.defaultRackId || 'RACK-A';
  const shelf = defaultCounter.nextShelf || 1;
  const row = defaultCounter.nextRow || 'A';
  const column = defaultCounter.nextColumn || 1;

  // Generate position string
  const position = `${counterId}>${rackId}>${shelf}-${row}-${column}`;

  // Calculate next position for future calls
  let nextShelf = shelf;
  let nextRow = row;
  let nextColumn = column + 1;

  // Increment through dimensions
  if (nextColumn > (defaultCounter.colCount || 20)) {
    nextColumn = 1;
    nextRow = String.fromCharCode(nextRow.charCodeAt(0) + 1);
  }
  if (nextRow.charCodeAt(0) > 'A'.charCodeAt(0) + (defaultCounter.rowCount || 5) - 1) {
    nextRow = 'A';
    nextShelf += 1;
  }
  if (nextShelf > (defaultCounter.shelfCount || 10)) {
    nextShelf = 1; // Wrap around
  }

  return {
    counterId,
    rackId,
    shelf,
    row,
    column,
    position,
    // Return next positions for persistence
    _nextPosition: { nextShelf, nextRow, nextColumn },
  };
};

/**
 * Fill-First-Rack strategy
 * Fills entire rack before moving to next counter
 */
const getFillFirstRackPosition = (rackConfig) => {
  const defaultCounter = rackConfig.counters?.[0];
  if (!defaultCounter) return generateDefaultPosition();

  const counterId = defaultCounter.counterId || 'Counter-1';
  const rackId = defaultCounter.defaultRackId || 'RACK-A';
  const shelf = defaultCounter.nextShelf || 1;
  const row = defaultCounter.nextRow || 'A';
  const column = defaultCounter.nextColumn || 1;
  const position = `${counterId}>${rackId}>${shelf}-${row}-${column}`;

  return {
    counterId,
    rackId,
    shelf,
    row,
    column,
    position,
  };
};

/**
 * Category-Based strategy
 * Assigns categories to specific racks
 */
const getCategoryBasedPosition = (rackConfig, category) => {
  if (!category) return getRoundRobinPosition(rackConfig);

  // Example mapping (customize per franchise)
  const categoryRackMap = {
    'Antibiotics': 'RACK-A',
    'Pain Relief': 'RACK-B',
    'Vitamins': 'RACK-C',
    'Inhalers': 'RACK-D',
    'Cardiac': 'RACK-E',
  };

  const rackId = categoryRackMap[category] || 'RACK-A';
  const defaultCounter = rackConfig.counters?.[0];
  const counterId = defaultCounter?.counterId || 'Counter-1';
  const shelf = 1;
  const row = 'A';
  const column = 1;
  const position = `${counterId}>${rackId}>${shelf}-${row}-${column}`;

  return {
    counterId,
    rackId,
    shelf,
    row,
    column,
    position,
  };
};

/**
 * Generate default position when no config exists
 */
const generateDefaultPosition = () => ({
  counterId: 'Counter-1',
  rackId: 'RACK-A',
  shelf: 1,
  row: 'A',
  column: 1,
  position: 'Counter-1>RACK-A>1-A-1',
});

/**
 * Validate position against rack dimensions
 */
export const validatePosition = (position, rackConfig) => {
  if (!rackConfig) return { valid: true };

  const { shelf, row, column } = position;
  const defaultCounter = rackConfig.counters?.[0];
  if (!defaultCounter) return { valid: true };

  const errors = [];

  if (shelf < 1 || shelf > (defaultCounter.shelfCount || 10)) {
    errors.push(`Shelf must be 1-${defaultCounter.shelfCount || 10}`);
  }

  const maxRowCode = String.fromCharCode('A'.charCodeAt(0) + (defaultCounter.rowCount || 5) - 1);
  if (row < 'A' || row > maxRowCode) {
    errors.push(`Row must be A-${maxRowCode}`);
  }

  if (column < 1 || column > (defaultCounter.colCount || 20)) {
    errors.push(`Column must be 1-${defaultCounter.colCount || 20}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Parse position string into components
 * Format: "Counter-1>RACK-A>1-A-5"
 */
export const parsePosition = (positionString) => {
  if (!positionString) return null;

  const parts = positionString.split('>');
  if (parts.length !== 3) return null;

  const counterId = parts[0];
  const rackId = parts[1];
  const coords = parts[2].split('-');

  if (coords.length !== 3) return null;

  return {
    counterId,
    rackId,
    shelf: parseInt(coords[0]),
    row: coords[1],
    column: parseInt(coords[2]),
  };
};

/**
 * Generate position string from components
 */
export const generatePositionString = (counterId, rackId, shelf, row, column) => {
  return `${counterId}>${rackId}>${shelf}-${row}-${column}`;
};

/**
 * Get all medicines in a specific position
 */
export const getMedicinesAtPosition = async (RackAssignment, franchiseId, position) => {
  const assignments = await RackAssignment.find({
    franchiseId,
    position,
    isActive: true,
  }).lean();

  return assignments;
};

/**
 * Check if position is occupied
 */
export const isPositionOccupied = async (RackAssignment, franchiseId, position) => {
  const count = await RackAssignment.countDocuments({
    franchiseId,
    position,
    isActive: true,
  });

  return count > 0;
};

/**
 * Get occupancy percentage
 */
export const getOccupancyStats = async (RackAssignment, rackConfig) => {
  const totalSlots = rackConfig.totalSlots || 2500;
  const usedCount = await RackAssignment.countDocuments({
    franchiseId: rackConfig.franchiseId,
    isActive: true,
  });

  const occupancyPct = ((usedCount / totalSlots) * 100).toFixed(2);

  return {
    totalSlots,
    usedSlots: usedCount,
    occupancyPct: parseFloat(occupancyPct),
    availableSlots: totalSlots - usedCount,
  };
};

/**
 * Bulk assign medicines to positions
 * Used for batch/import operations
 */
export const bulkAssignMedicines = async (RackAssignment, assignments) => {
  const result = await RackAssignment.insertMany(assignments, { ordered: false });
  return result;
};

/**
 * Update assignment (manual override)
 */
export const updateAssignment = async (RackAssignment, assignmentId, newPosition, userId) => {
  const updated = await RackAssignment.findByIdAndUpdate(
    assignmentId,
    {
      ...newPosition,
      position: generatePositionString(
        newPosition.counterId,
        newPosition.rackId,
        newPosition.shelf,
        newPosition.row,
        newPosition.column
      ),
      assignedVia: 'manual',
      assignedBy: userId,
      updatedAt: new Date(),
    },
    { new: true }
  );

  return updated;
};

/**
 * Get medicines for a specific counter (all racks)
 */
export const getMedicinesInCounter = async (RackAssignment, franchiseId, counterId) => {
  const assignments = await RackAssignment.find({
    franchiseId,
    counterId,
    isActive: true,
  })
    .populate('medicineId')
    .sort({ position: 1 })
    .lean();

  return assignments;
};

/**
 * Get medicines for a specific rack (all positions)
 */
export const getMedicinesInRack = async (RackAssignment, franchiseId, rackId) => {
  const assignments = await RackAssignment.find({
    franchiseId,
    rackId,
    isActive: true,
  })
    .populate('medicineId')
    .sort({ position: 1 })
    .lean();

  return assignments;
};
