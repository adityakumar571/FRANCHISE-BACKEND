import express from "express";
import { createStudentsTransfer } from "../../../controllers/tenant/student/studentsTransferController.js";

const router = express.Router();

router.post("/", createStudentsTransfer);

export default router;
