import express from "express";
import { Router } from "express";
import { feeCollectionReport } from "../../../controllers/tenant/fee/reports/FeeCollectionReportController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";
import {
  feeDefaulterReport,
  classWiseFeeRegister,
  getExamReport,
  getPerformanceReport,
} from "../../../controllers/tenant/fee/reports/feeDefaulterReport.js";
import { feeOutstandingReport } from "../../../controllers/tenant/fee/reports/feeOutstandingReport.js";
import { feeHeadReport } from "../../../controllers/tenant/fee/reports/feeHeadReport.js";
import { feeModeReport } from "../../../controllers/tenant/fee/reports/feeModeReport.js";
import { resultAnalysis } from "../../../controllers/tenant/academics/resultAnalysisController.js";
import {
  classSectionDefaulters,
  feeDefaultersDetailed,
  feeDefaultersMonthwise,
  registrationFeeStatement,
  feeRegisterDetailed,
  registrationFeeClasswise,
  feeDepositSummaryClasswise,
  feeDepositedDetailed,
  studentFeeDetailsClasswise,
  scholarshipReport,
  inactiveStudentList,
  inactiveStudentFeeStatement,
  newAdmissionFeeCollection,
} from "../../../controllers/tenant/fee/reports/newReportsController.js";

const router = Router();

router.get("/fee-defaulters", feeDefaulterReport);
router.get("/class-fee-register", classWiseFeeRegister);
router.get("/fee-outstanding", feeOutstandingReport);
router.get("/exam-report", getExamReport);
router.get("/fee-head", feeHeadReport);
router.get("/fee-mode", feeModeReport);
router.get("/performance", getPerformanceReport);
router.get("/fee-collection", feeCollectionReport);

// ── New Report Endpoints ──
router.get("/class-section-defaulters",        classSectionDefaulters);
router.get("/fee-defaulters-detailed",         feeDefaultersDetailed);
router.get("/fee-defaulters-monthwise",        feeDefaultersMonthwise);
router.get("/registration-fee-statement",      registrationFeeStatement);
router.get("/fee-register-detailed",           feeRegisterDetailed);
router.get("/registration-fee-classwise",      registrationFeeClasswise);
router.get("/fee-deposit-summary-classwise",   feeDepositSummaryClasswise);
router.get("/fee-deposited-detailed",          feeDepositedDetailed);
router.get("/student-fee-details-classwise",   studentFeeDetailsClasswise);
router.get("/scholarship",                     scholarshipReport);
router.get("/inactive-student-list",           inactiveStudentList);
router.get("/inactive-student-fee-statement",  inactiveStudentFeeStatement);
router.get("/result-analysis",                 resultAnalysis);
router.get("/new-admission-fee-collection",    newAdmissionFeeCollection);

export default router;
