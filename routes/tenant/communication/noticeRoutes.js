import express from "express";
import { createNotice, getAllNotices, getNoticeById, updateNotice, deleteNotice, markNoticesAsRead } from "../../../controllers/tenant/communication/NoticeController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = express.Router();

router.use(verifyJWT);

router.post("/", createNotice);
router.get("/", getAllNotices);
router.patch("/mark-read", markNoticesAsRead);
router.get("/:id", getNoticeById);
router.put("/:id", updateNotice);
router.delete("/:id", deleteNotice);

export default router;
