import express from "express";
import { createService, getAllServices, getServiceById, updateService, deleteService } from "../../../controllers/tenant/content/ServicesController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = express.Router();

router.use(verifyJWT);

router.post("/", createService);
router.get("/", getAllServices);
router.get("/:id", getServiceById);
router.put("/:id", updateService);
router.delete("/:id", deleteService);

export default router;
