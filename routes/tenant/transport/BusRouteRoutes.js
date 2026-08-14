import { Router } from "express";
import {
  createRoute,
  getRoutes,
  updateRoute,
  deleteRoute,
} from "../../../controllers/tenant/transport/RouteController.js";

const router = Router();

router.post("/", createRoute);
router.get("/", getRoutes);
router.put("/:id", updateRoute);
router.delete("/:id", deleteRoute);

export default router;