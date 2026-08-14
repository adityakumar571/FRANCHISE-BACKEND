import express from "express";
import { createBanner, getAllBanners, getBannerById, updateBanner, deleteBanner } from "../../../controllers/tenant/content/BannerController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = express.Router();

router.use(verifyJWT);

router.post("/", createBanner);
router.get("/", getAllBanners);
router.get("/:id", getBannerById);
router.put("/:id", updateBanner);
router.delete("/:id", deleteBanner);

export default router;
