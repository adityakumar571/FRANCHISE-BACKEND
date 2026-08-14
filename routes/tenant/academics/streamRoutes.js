import { Router } from "express";
import {
  createStream,
  deleteStream,
  getAllStreams,
  getStreamById,
  updateStream,
} from "../../../controllers/tenant/academics/StreamController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = Router();

/* ================= PUBLIC ================= */
router.get("/", getAllStreams);
router.get("/:id", getStreamById);

/* ================= PROTECTED ================= */
// router.post("/", verifyJWT, createStream);
router.post("/", verifyJWT, createStream);
router.put("/:id", verifyJWT, updateStream);
router.delete("/:id", verifyJWT, deleteStream);

export default router;
