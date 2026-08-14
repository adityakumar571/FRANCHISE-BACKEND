import express from "express";

import {
  createLateFeeSetting,
  deleteLateFeeSetting,
  getAllLateFeeSettings,
  getLateFeeSetting,
  updateLateFeeSetting,
} from "../../../controllers/tenant/fee/LateFeeSettingController.js";

import {
  createLateFee,
  generateLateFees,
  getLateFeeList,
  getStudentLateFeeSummary,
  waiveLateFee,
  bulkWaiveLateFees,
  unwaiveLateFee,
  getLateFeeWaiverReport,
} from "../../../controllers/tenant/fee/LateFeeController.js";

const router = express.Router();

/* ── Late Fee Settings ── */
router.post("/late-fee-setting",        createLateFeeSetting);
router.put("/late-fee-setting/:id",     updateLateFeeSetting);
router.delete("/late-fee-setting/:id",  deleteLateFeeSetting);
router.get("/late-fee-setting",         getAllLateFeeSettings);
router.get("/late-fee-setting/active",  getLateFeeSetting);

/* ── Late Fee Records ── */
router.get("/late-fee",                 getLateFeeList);
router.get("/late-fee/student-summary", getStudentLateFeeSummary);
router.post("/late-fee",                createLateFee);
router.post("/late-fee/generate",       generateLateFees);

/* ── Waiver ── */
router.post("/late-fee-waive",          waiveLateFee);
router.post("/late-fee-waive-bulk",     bulkWaiveLateFees);
router.post("/late-fee-unwaive",        unwaiveLateFee);

/* ── Waiver Report ── */
router.get("/late-fee-waiver-report",   getLateFeeWaiverReport);

export default router;
