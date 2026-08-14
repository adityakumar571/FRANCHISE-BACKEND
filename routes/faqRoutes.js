import express from "express";
import {
  createFAQ,
  getAllFAQs,
  getFAQById,
  updateFAQ,
  deleteFAQ,
  toggleFAQStatus,
  getFAQCategories,
} from "../controllers/faqController.js";

const router = express.Router();

router.get("/categories", getFAQCategories);   // GET  /api/faq/categories
router.get("/",           getAllFAQs);          // GET  /api/faq
router.get("/:id",        getFAQById);          // GET  /api/faq/:id
router.post("/",          createFAQ);           // POST /api/faq
router.put("/:id",        updateFAQ);           // PUT  /api/faq/:id
router.delete("/:id",     deleteFAQ);           // DELETE /api/faq/:id
router.patch("/:id/toggle", toggleFAQStatus);   // PATCH /api/faq/:id/toggle

export default router;
