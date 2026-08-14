/**
 * Counter.model.js
 * ─────────────────────────────────────────────────────────────────
 * Generic atomic counter for tenant DBs.
 * Used to generate sequential, collision-free receipt numbers.
 *
 * Document structure:
 *   { _id: "receiptNo", seq: 1, 2, 3, ... }
 *
 * Usage:
 *   const Counter = getCounterModel(req.db);
 *   const next    = await Counter.getNextSeq("receiptNo");
 * ─────────────────────────────────────────────────────────────────
 */

import mongoose from "mongoose";

const CounterSchema = new mongoose.Schema({
  // Counter name (e.g. "receiptNo")
  _id: { type: String, required: true },
  // Current sequence value
  seq: { type: Number, default: 0 },
});

export const getCounterModel = (connection) => {
  return (
    connection.models.Counter ||
    connection.model("Counter", CounterSchema)
  );
};
