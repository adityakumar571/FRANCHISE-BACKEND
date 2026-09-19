import express from "express";
import {
  getActivityLogs,
  createActivityLog,
  deleteActivityLog,
  clearAllLogs,
} from "../controllers/activityLogController.js";
import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";

const router = express.Router();

// All activity log routes require admin auth
router.get("/",           verifyMainJWT, getActivityLogs);
router.post("/",          verifyMainJWT, createActivityLog);
router.delete("/clear-all", verifyMainJWT, clearAllLogs);
router.delete("/:id",     verifyMainJWT, deleteActivityLog);

export default router;
