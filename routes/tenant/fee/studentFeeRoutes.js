import { Router } from "express";
import { getStudentLedger } from "../../../controllers/tenant/fee/StudentLedgerController.js";
import {collectStudentFee, fixTransportFees, recalculateAllocations, clearAllPaymentData, cancelStudentPayment} from "../../../controllers/tenant/fee/FeeCollectionController.js"

const router = Router();

router.get("/ledger", getStudentLedger);
router.post("/collect", collectStudentFee);
router.post("/cancel-payment", cancelStudentPayment);
router.post("/fix-transport", fixTransportFees);
router.post("/recalculate-allocations", recalculateAllocations);

// ⚠️ DANGER: Deletes ALL payment data (StudentPayment, StudentPaymentAllocation, LateFee)
// Requires confirm: "YES_DELETE_ALL" in body
router.post("/clear-all-payment-data", clearAllPaymentData);

export default router;