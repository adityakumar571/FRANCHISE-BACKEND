import { Router } from "express";
import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";
import {
    generateMonthlyBill,
    getMonthlyBills,
    getBillDetail,
    markBillPaid,
    markOverdueBills,
    deleteBill,
} from "../controllers/MonthlyBillingController.js";

const router = Router();

// Apply authentication middleware
router.use(verifyMainJWT);

// Generate monthly bill
router.post("/generate", generateMonthlyBill);

// Get all monthly bills
router.get("/", getMonthlyBills);

// Get single bill detail
router.get("/:billId", getBillDetail);

// Mark bill as paid
router.patch("/:billId/mark-paid", markBillPaid);

// Mark overdue bills
router.patch("/mark-overdue", markOverdueBills);

// Delete bill
router.delete("/:billId", deleteBill);

export default router;
