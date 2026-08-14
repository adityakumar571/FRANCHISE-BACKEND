import express from "express";
import { createTestimonial, getAllTestimonials, getTestimonialById, updateTestimonial, deleteTestimonial } from "../../../controllers/tenant/content/TestimonialsController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = express.Router();

router.use(verifyJWT);

router.post("/", createTestimonial);
router.get("/", getAllTestimonials);
router.get("/:id", getTestimonialById);
router.put("/:id", updateTestimonial);
router.delete("/:id", deleteTestimonial);

export default router;
