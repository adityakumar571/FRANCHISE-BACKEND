import express from "express";
import {
  getStudentsForCertificate,
  getStudentCertificateData,
  issueConductCertificate,
  getAllConductCertificates,
  getConductCertificateById,
  getCertificatesByStudent,
  updateConductCertificate,
  cancelConductCertificate,
  deleteConductCertificate,
} from "../../../controllers/tenant/academics/ConductCertificateController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = express.Router();

/* All routes require a valid JWT */
router.use(verifyJWT);

/* ── Student picker ──────────────────────────────────────────── */
// GET  /api/conduct-certificates/students          → search students for picker
// GET  /api/conduct-certificates/students/:id      → pre-fill cert form from student
router.get("/students", getStudentsForCertificate);
router.get("/students/:studentId", getStudentCertificateData);

/* ── Certificate history by student ─────────────────────────── */
// GET  /api/conduct-certificates/by-student/:id   → all certs of one student
router.get("/by-student/:studentId", getCertificatesByStudent);

/* ── Core CRUD ───────────────────────────────────────────────── */
// POST   /api/conduct-certificates                 → issue new certificate
// GET    /api/conduct-certificates                 → list all (with filters)
// GET    /api/conduct-certificates/:id             → single cert
// PUT    /api/conduct-certificates/:id             → update
// PATCH  /api/conduct-certificates/:id/cancel      → soft cancel
// DELETE /api/conduct-certificates/:id             → hard delete (admin)
router.post("/", issueConductCertificate);
router.get("/", getAllConductCertificates);
router.get("/:id", getConductCertificateById);
router.put("/:id", updateConductCertificate);
router.patch("/:id/cancel", cancelConductCertificate);
router.delete("/:id", deleteConductCertificate);

export default router;
