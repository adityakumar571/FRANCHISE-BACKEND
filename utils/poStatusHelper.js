/**
 * Helper functions for PO (Purchase Order) status management
 * Handles partial deliveries, backorders, and completion tracking
 */

/**
 * Calculate pending quantity for a PO item
 * pendingQty = orderedQty - receivedQty - rejectedQty
 */
export const calculatePendingQty = (item) => {
  const pending = item.orderedQty - (item.receivedQty || 0) - (item.rejectedQty || 0);
  return Math.max(0, pending);
};

/**
 * Calculate completion percentage for entire PO
 * completionPct = (totalReceivedQty / totalOrderedQty) * 100
 */
export const calculateCompletionPct = (totalOrdered, totalReceived) => {
  if (totalOrdered === 0) return 0;
  return Math.round((totalReceived / totalOrdered) * 100);
};

/**
 * Determine PO status based on completion
 * Rules:
 * - 0%: pending
 * - 1-99%: partially_received
 * - 100%: received
 * - No GRN > 30 days: backordered
 */
export const determinePOStatus = (completionPct, lastGRNDate, backordered = false) => {
  if (backordered) return 'backordered';
  
  if (completionPct === 0) return 'pending';
  if (completionPct < 100) return 'partially_received';
  if (completionPct >= 100) return 'received';
  
  return 'pending';
};

/**
 * Check if PO should be marked as backordered
 * Rule: No GRN received in last 30 days
 */
export const isBackordered = (createdDate, lastGRNDate, completionPct) => {
  // If 100% received, not backordered
  if (completionPct >= 100) return false;
  
  const now = new Date();
  const refDate = lastGRNDate || createdDate;
  const daysDiff = Math.floor((now - refDate) / (1000 * 60 * 60 * 24));
  
  return daysDiff > 30;
};

/**
 * Update all PO items with received/rejected/pending quantities
 * Called when GRN is created
 */
export const updatePOItemQuantities = (poItems, grnItems) => {
  return poItems.map(poItem => {
    const matchingGRNItem = grnItems.find(g => 
      g.medicineId?.toString() === poItem.medicineId?.toString()
    );
    
    if (matchingGRNItem) {
      return {
        ...poItem,
        receivedQty: (poItem.receivedQty || 0) + (matchingGRNItem.grnReceivedQty || 0),
        rejectedQty: (poItem.rejectedQty || 0) + (matchingGRNItem.grnRejectedQty || 0),
        pendingQty: calculatePendingQty({
          orderedQty: poItem.orderedQty,
          receivedQty: (poItem.receivedQty || 0) + (matchingGRNItem.grnReceivedQty || 0),
          rejectedQty: (poItem.rejectedQty || 0) + (matchingGRNItem.grnRejectedQty || 0),
        }),
      };
    }
    
    return {
      ...poItem,
      pendingQty: calculatePendingQty(poItem),
    };
  });
};

/**
 * Calculate total quantities for entire PO
 */
export const calculatePOTotals = (items) => {
  const totals = items.reduce(
    (acc, item) => ({
      ordered: acc.ordered + (item.orderedQty || 0),
      received: acc.received + (item.receivedQty || 0),
      rejected: acc.rejected + (item.rejectedQty || 0),
    }),
    { ordered: 0, received: 0, rejected: 0 }
  );
  
  return {
    totalOrderedQty: totals.ordered,
    totalReceivedQty: totals.received,
    totalRejectedQty: totals.rejected,
    completionPct: calculateCompletionPct(totals.ordered, totals.received),
  };
};

/**
 * Generate backorder note
 * e.g., "Awaiting 95 items from Apollo Pharma"
 */
export const generateBackorderNote = (items, supplierName) => {
  const totalPending = items.reduce((sum, item) => sum + (item.pendingQty || 0), 0);
  if (totalPending === 0) return '';
  return `Awaiting ${totalPending} items from ${supplierName}`;
};
