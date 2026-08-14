import { Router } from "express";
import {
  getTransportReport,
  getTransportFeeCollection,
  getTransportDefaulters,
  getRouteWiseCollection,
  getMonthWiseFeeStatus,
  getExemptMonthsSummary,
} from "../../../controllers/tenant/transport/TransportReportController.js";

const router = Router();

// 1. Existing student list
router.get("/", getTransportReport);

// 2. Per-student fee collection (paid vs due, month-wise breakdown)
router.get("/fee-collection", getTransportFeeCollection);

// 3. Transport defaulters (students with balance > 0)
router.get("/defaulters", getTransportDefaulters);

// 4. Route-wise billing vs collection summary
router.get("/route-wise", getRouteWiseCollection);

// 5. Month-wise fee status across session
router.get("/month-wise", getMonthWiseFeeStatus);

// 6. Exempt months audit (who took vacation exemption)
router.get("/exempt-summary", getExemptMonthsSummary);

export default router;
