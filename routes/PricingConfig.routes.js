import express from "express";
import { getPricingConfig, updatePricingConfig } from "../controllers/PricingConfig.controller.js";

const router = express.Router();

router.get("/", getPricingConfig);
router.put("/", updatePricingConfig);

export default router;
