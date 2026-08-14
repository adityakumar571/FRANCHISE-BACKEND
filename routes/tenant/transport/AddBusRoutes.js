import { Router } from "express";

import {
  assignBusToRoute,
  createBus,
  deleteBus,
  getBuses,
  getBusRoutes,
  updateBus,
} from "../../../controllers/tenant/transport/BusController.js";
const router = Router();

/* BUS */
router.post("/", createBus);
router.get("/", getBuses);
router.put("/:id", updateBus);
router.delete("/:id", deleteBus);

/* ASSIGNMENT */
router.post("/assign", assignBusToRoute);
router.get("/assign", getBusRoutes);

export default router;
