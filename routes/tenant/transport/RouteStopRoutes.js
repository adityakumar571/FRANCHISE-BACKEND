import { Router } from "express";

import {createRouteStop, deleteRouteStop, getAllRouteStops, getRouteStops, reorderRouteStops, updateRouteStop} from "../../../controllers/tenant/transport/StopController.js"
const router = Router();

router.post("/", createRouteStop);
router.get("/", getRouteStops);
router.get("/allStops", getAllRouteStops);

/* 🔥 reorder — must be BEFORE /:id routes */
router.post("/reorder", reorderRouteStops);
router.put("/reorder", reorderRouteStops);

router.put("/:id", updateRouteStop);
router.delete("/:id", deleteRouteStop);


export default router;