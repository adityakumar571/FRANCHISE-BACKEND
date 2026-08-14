import { Router } from "express";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";
import {
  createDocument,
  deleteDocument,
  getAllDocuments,
  getDocumentById,
  updateDocument,
} from "../../../controllers/tenant/academics/DocumentController.js";

const router = Router();

// 🔹 Public Routes
router.get("/", getAllDocuments);
router.get("/:id", getDocumentById);

// 🔹 Protected/Admin Routes
router.post("/", verifyJWT, createDocument);
router.put("/:id", verifyJWT, updateDocument);
router.delete("/:id", verifyJWT, deleteDocument);

export default router;
