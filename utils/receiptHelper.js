/**
 * receiptHelper.js
 * ─────────────────────────────────────────────────────────────────
 * Generates unique, sequential receipt numbers per tenant DB.
 *
 * Format:  RCPT-YYYY-NNNNNN
 *   YYYY   = current year (resets counter at year change)
 *   NNNNNN = zero-padded 6-digit sequential number
 *
 * Examples:  RCPT-2025-000001, RCPT-2025-000002, RCPT-2026-000001
 *
 * Uses MongoDB findOneAndUpdate with $inc for atomicity —
 * safe under concurrent requests (no duplicate risk).
 * ─────────────────────────────────────────────────────────────────
 */

import { getCounterModel } from "../models/tenant/master/Counter.model.js";

/**
 * Generate the next receipt number for a given tenant DB connection.
 *
 * @param {mongoose.Connection} db  — tenant DB connection (req.db)
 * @returns {Promise<string>}        — e.g. "RCPT-2025-000042"
 */
export const generateReceiptNo = async (db) => {
  const Counter  = getCounterModel(db);
  const year     = new Date().getFullYear();
  const counterId = `receiptNo_${year}`;   // resets per calendar year

  // Atomically increment and return the NEW value
  const doc = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const seq     = doc.seq;
  const padded  = String(seq).padStart(6, "0");   // 000001 … 999999
  return `RCPT-${year}-${padded}`;
};
