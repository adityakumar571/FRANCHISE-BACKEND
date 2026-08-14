import { Router } from "express";
import {
  getVacationRules,
  setVacationRule,
  updateVacationRule,
  deleteVacationRule,
} from "../../../controllers/tenant/transport/TransportVacationController.js";

const router = Router();

router.get("/",           getVacationRules);   // GET  ?sessionId=
router.post("/",          setVacationRule);    // POST body: {sessionId,level,months,...}
router.patch("/:ruleId",  updateVacationRule); // PATCH body: {sessionId,months,...}
router.delete("/:ruleId", deleteVacationRule); // DELETE ?sessionId=

export default router;
