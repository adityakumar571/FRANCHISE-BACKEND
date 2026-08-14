import express from "express";
import {
  searchStudentsForCert,
  getStudentDetailForCert,
  createCertificate,
  getAllCertificates,
  getCertificateById,
  updateCertificate,
  deleteCertificate,
} from "../../../controllers/tenant/academics/CertificateController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = express.Router();

router.use(verifyJWT);

/* ── Student picker ── */
router.get("/students",            searchStudentsForCert);
router.get("/students/:studentId", getStudentDetailForCert);

/* ── CRUD ── */
router.get("/",    getAllCertificates);
router.post("/",   createCertificate);
router.get("/:id",    getCertificateById);
router.put("/:id",    updateCertificate);
router.delete("/:id", deleteCertificate);

export default router;
