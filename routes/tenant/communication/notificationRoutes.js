import express from "express";
import { createNotification, getAllNotifications, getNotificationById, markNotificationAsRead, markAllAsRead, deleteNotification } from "../../../controllers/tenant/communication/NotificationController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = express.Router();

router.use(verifyJWT);

router.post("/", createNotification);
router.get("/", getAllNotifications);
router.get("/:id", getNotificationById);
router.put("/:id/read", markNotificationAsRead);
router.put("/mark-all-read", markAllAsRead);
router.delete("/:id", deleteNotification);

export default router;
