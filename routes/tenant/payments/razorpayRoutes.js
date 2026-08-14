import { Router } from "express";
import { createRazorpayOrder, verifyRazorpayPayment } from "../../../controllers/tenant/payments/RazorpayController.js";

const router = Router();

router.post("/create-order", createRazorpayOrder);

router.post("/verify-payment", verifyRazorpayPayment);


export default router;