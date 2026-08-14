import { Router } from "express";
import { createSession, deleteSession, getAllSessions, getSessionById, migrateSessionOrder, updateSession } from "../../../controllers/tenant/academics/sessionController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = Router();

router.get("/", getAllSessions);
router.get("/:id", getSessionById);

router.put("/migrateSessionOrder", migrateSessionOrder);

router.post("/", verifyJWT, createSession);
router.put("/:id", verifyJWT, updateSession);
router.delete("/:id", verifyJWT, deleteSession);

export default router;
