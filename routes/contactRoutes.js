import express from "express";
import {
    createContactInquiry,
    getAllContactInquiries,
    updateContactStatus,
    deleteContactInquiry,
} from "../controllers/contactController.js";

import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";

const router = express.Router();

// ── Public route (no auth) ──────────────────────────
router.post("/create", createContactInquiry);

// ── Admin routes (auth required) ────────────────────
router.get("/all",              verifyMainJWT, getAllContactInquiries);
router.put("/update/:id",       verifyMainJWT, updateContactStatus);
router.delete("/delete/:id",    verifyMainJWT, deleteContactInquiry);

export default router;
