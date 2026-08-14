import express from "express";
import {
    subscribe,
    unsubscribe,
    sendNewsletter,
    getAllSubscribers,
    deleteSubscriber,
} from "../controllers/newsletterController.js";

import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";

const router = express.Router();

// ── Public routes (no auth) ──────────────────────────
router.post("/subscribe",   subscribe);
router.post("/unsubscribe", unsubscribe);

// ── Admin routes (auth required) ────────────────────
router.post("/send",         verifyMainJWT, sendNewsletter);
router.get("/all",           verifyMainJWT, getAllSubscribers);
router.delete("/delete/:id", verifyMainJWT, deleteSubscriber);

export default router;
