import { Router } from "express";
import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";
import {
    getBillingConfig,
    updateBillingConfig,
    generateMonthlyBill,
    generateBulkBills,
    markBillPaid,
    markOverdueBills,
    getBills,
    getBillById,
    previewBill,
    getInvoice,
} from "../controllers/MonthlyBillingController.js";

const router = Router();

// ── Public ────────────────────────────────────────────────────────
router.get("/config",   getBillingConfig);
router.post("/preview", previewBill);

// ── Admin ─────────────────────────────────────────────────────────
router.put("/config",          verifyMainJWT, updateBillingConfig);
router.post("/generate",       verifyMainJWT, generateMonthlyBill);
router.post("/generate-bulk",  verifyMainJWT, generateBulkBills);
router.patch("/mark-overdue",  verifyMainJWT, markOverdueBills);
router.patch("/:id/mark-paid", verifyMainJWT, markBillPaid);
router.get("/:id/invoice",     verifyMainJWT, getInvoice);        // ← NEW
router.get("/:id",             verifyMainJWT, getBillById);
router.get("/",                verifyMainJWT, getBills);

export default router;
