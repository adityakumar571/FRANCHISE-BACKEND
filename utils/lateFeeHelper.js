/**
 * lateFeeHelper.js
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for late fee calculation and DB sync.
 *
 * Design:
 *  - calculateLateFineForInstallment()  → pure calculation (no DB)
 *  - syncLateFees()                     → upsert LateFee records for a student
 *  - getStudentLateFeeMap()             → { lateFeeId → { amount, paidAmount, isWaived } }
 *
 * Rules:
 *  - Late fee applies only when tuition installment is UNPAID and past due date
 *  - If tuition is fully paid → no late fee (or existing record stays but amount = 0)
 *  - Waived records are preserved (isWaived stays true, amount unchanged)
 *  - paidAmount is derived from StudentPaymentAllocation (feeType: LATE_FEE)
 * ─────────────────────────────────────────────────────────────────
 */

import { getLateFeeModel } from "../models/tenant/master/LateFee.model.js";
import { getLateFeeSettingModel } from "../models/tenant/master/LateFeeSetting.model.js";
import { getStudentPaymentAllocationModel } from "../models/tenant/master/StudentPaymentAllocation.model.js";

/* ─────────────────────────────────────────────────────────────────
   CALCULATE LATE FINE FOR ONE INSTALLMENT
   Pure function — no DB access.

   Returns: fine amount (number, 0 if not applicable)
───────────────────────────────────────────────────────────────── */
export const calculateLateFineForInstallment = ({ setting, dueDate, tuitionDueAmount }) => {
  if (!setting || tuitionDueAmount <= 0) return 0;

  const today   = new Date();
  const due     = new Date(dueDate);
  if (today <= due) return 0;

  const daysLate = Math.floor((today - due) / (1000 * 60 * 60 * 24));
  if (daysLate <= (setting.graceDays || 0)) return 0;

  let fine = 0;
  if (setting.fineType === "PER_DAY") {
    fine = (daysLate - (setting.graceDays || 0)) * Number(setting.fineAmount || 0);
  } else if (setting.fineType === "FIXED") {
    fine = Number(setting.fineAmount || 0);
  }

  if (setting.maxFine && fine > setting.maxFine) {
    fine = setting.maxFine;
  }

  return parseFloat(fine.toFixed(2));
};

/* ─────────────────────────────────────────────────────────────────
   SYNC LATE FEES FOR A STUDENT
   Called from:
     - getStudentLedger (on every ledger view)
     - collectStudentFee (before payment allocation)

   For each tuition installment:
     - If unpaid & overdue → upsert LateFee record with calculated amount
     - If fully paid       → do NOT create/update (no late fee on paid installments)
     - Waived records      → never overwrite amount or isWaived

   Returns: array of LateFee docs (active, not waived)
───────────────────────────────────────────────────────────────── */
export const syncLateFees = async ({
  db,
  sessionId,
  studentId,
  classId,
  installments,   // FeeInstallment docs for this student
  allocationMap,  // { referenceId.toString() → paidAmount } for tuition
}) => {
  const LateFee        = getLateFeeModel(db);
  const LateFeeSetting = getLateFeeSettingModel(db);

  const setting = await LateFeeSetting.findOne({ sessionId, isActive: true }).lean();
  if (!setting) return [];

  const results = [];

  for (const inst of installments) {
    const tuitionPaid = allocationMap[inst._id.toString()] || 0;
    const tuitionDue  = Math.max(0, Number(inst.amount) - tuitionPaid);

    const fineAmount = calculateLateFineForInstallment({
      setting,
      dueDate:          inst.dueDate,
      tuitionDueAmount: tuitionDue,
    });

    // Upsert — but never overwrite a waived record's amount
    const existing = await LateFee.findOne({ studentId, referenceId: inst._id }).lean();

    if (fineAmount <= 0) {
      // Tuition is now fully paid — zero out any existing non-waived late fee record
      // BUT only if it has NOT been allocated yet (i.e., no payment made against it)
      // If already paid, preserve the amount for correct receipt history
      if (existing && !existing.isWaived && Number(existing.amount) > 0) {
        // Check if any payment allocation exists for this late fee
        const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);
        const hasAllocation = await StudentPaymentAllocation.findOne({
          feeType: "LATE_FEE",
          referenceId: existing._id,
          allocatedAmount: { $gt: 0 },
        }).lean();
        if (!hasAllocation) {
          await LateFee.updateOne({ _id: existing._id }, { $set: { amount: 0 } });
        }
      }
      continue;
    }

    if (existing) {
      if (existing.isWaived) {
        // Waived — preserve the record but do NOT include in active late fee results
        continue;
      }
      // Do NOT update amount if any payment has already been allocated to this late fee.
      // This locks the amount at the time of first payment (prevents growing PER_DAY fine
      // from causing imbalance after partial payment).
      const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);
      const hasAllocation = await StudentPaymentAllocation.findOne({
        feeType: "LATE_FEE",
        referenceId: existing._id,
        allocatedAmount: { $gt: 0 },
      }).lean();
      if (hasAllocation) {
        results.push(existing);
        continue;
      }
      // Update amount if changed (e.g. more days passed, no payment yet)
      if (existing.amount !== fineAmount) {
        await LateFee.updateOne(
          { _id: existing._id },
          { $set: { amount: fineAmount } }
        );
        results.push({ ...existing, amount: fineAmount });
      } else {
        results.push(existing);
      }
    } else {
      // Create new
      try {
        const created = await LateFee.create({
          sessionId,
          studentId,
          classId,
          referenceId:   inst._id,
          referenceType: "TUITION",
          period:        inst.period,
          amount:        fineAmount,
          paidAmount:    0,
          isWaived:      false,
        });
        results.push(created.toObject());
      } catch (err) {
        // Duplicate key — fetch existing
        const found = await LateFee.findOne({ studentId, referenceId: inst._id }).lean();
        if (found) results.push(found);
      }
    }
  }

  return results;
};

/* ─────────────────────────────────────────────────────────────────
   GET STUDENT LATE FEE MAP (with paid amounts from allocations)
   Returns: { lateFeeId.toString() → { lateFeeDoc, paidAmount, dueAmount } }
───────────────────────────────────────────────────────────────── */
export const getStudentLateFeeMap = async ({
  db,
  sessionId,
  studentId,
  paymentIds,  // SUCCESS payment IDs for this student
}) => {
  const LateFee                  = getLateFeeModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);

  // All late fee records for this student (including waived — waived ones show dueAmount: 0)
  const lateFees = await LateFee.find({
    sessionId,
    studentId,
  }).lean();

  if (!lateFees.length) return {};

  const lateFeeIds = lateFees.map(lf => lf._id);

  // Paid amounts from allocations
  const allocations = paymentIds.length
    ? await StudentPaymentAllocation.find({
        paymentId:   { $in: paymentIds },
        feeType:     "LATE_FEE",
        referenceId: { $in: lateFeeIds },
      }).lean()
    : [];

  const paidMap = {};
  for (const a of allocations) {
    const rid = a.referenceId.toString();
    paidMap[rid] = (paidMap[rid] || 0) + Number(a.allocatedAmount || 0);
  }

  const result = {};
  for (const lf of lateFees) {
    const id   = lf._id.toString();
    const paid = paidMap[id] || 0;
    // Waived fees always have dueAmount = 0 regardless of paid amount
    const due  = lf.isWaived ? 0 : Math.max(0, Number(lf.amount) - paid);
    result[id] = { ...lf, paidAmount: paid, dueAmount: due };
  }

  return result;
};

/* ─────────────────────────────────────────────────────────────────
   GET LATE FEE TOTAL DUE FOR A STUDENT (for reports)
   Returns: { totalLateFee, totalLatePaid, totalLateDue }
───────────────────────────────────────────────────────────────── */
export const getStudentLateFeeSummary = async ({
  db,
  sessionId,
  studentId,
  paymentIds,
}) => {
  const map = await getStudentLateFeeMap({ db, sessionId, studentId, paymentIds });
  const entries = Object.values(map);

  const totalLateFee  = entries.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalLatePaid = entries.reduce((s, e) => s + Number(e.paidAmount || 0), 0);
  const totalLateDue  = entries.reduce((s, e) => s + Number(e.dueAmount || 0), 0);

  return {
    totalLateFee:  parseFloat(totalLateFee.toFixed(2)),
    totalLatePaid: parseFloat(totalLatePaid.toFixed(2)),
    totalLateDue:  parseFloat(totalLateDue.toFixed(2)),
  };
};
