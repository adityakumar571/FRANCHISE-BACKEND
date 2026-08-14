import express from "express";
import { createGallery, getAllGallery, getGalleryById, updateGallery, deleteGallery } from "../../../controllers/tenant/content/GalleryController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = express.Router();

router.use(verifyJWT);

router.post("/", createGallery);
router.get("/", getAllGallery);
router.get("/:id", getGalleryById);
router.put("/:id", updateGallery);
router.delete("/:id", deleteGallery);

export default router;
