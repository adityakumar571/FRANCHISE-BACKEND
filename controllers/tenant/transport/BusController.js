import mongoose from "mongoose";


import { getRouteModel } from "../../../models/tenant/master/RouteMaster.model.js";
import { getBusModel } from "../../../models/tenant/master/BusMaster.model.js";
import { getBusRouteModel } from "../../../models/tenant/master/BusRouteAssigne.model.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";

/* ================= CREATE BUS ================= */
export const createBus = asyncHandler(async (req, res) => {
  const Bus = getBusModel(req.db); // ✅ change

  const {
    busNumber,
    busName,
    driverName,
    driverPhone,
    conductorName,
    conductorPhone,
    capacity,
  } = req.body;

  if (!busNumber || !capacity) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "busNumber & capacity required"));
  }

  const bus = await Bus.create({
    busNumber,
    busName,
    driverName,
    driverPhone,
    conductorName,
    conductorPhone,
    capacity,
  });

  res
    .status(201)
    .json(new apiResponse(201, bus, "Bus created successfully"));
});

/* ================= GET BUSES OLD ================= */
export const getBuses_old = asyncHandler(async (req, res) => {
  const Bus = getBusModel(req.db); // ✅ change

  const { isActive } = req.query;

  const filter = {};
  if (isActive !== undefined) {
    filter.isActive = isActive === "true";
  }

  const buses = await Bus.find(filter).sort({ createdAt: -1 });

  res
    .status(200)
    .json(new apiResponse(200, buses, "Buses fetched"));
});

/* ================= GET BUSES ================= */
export const getBuses = asyncHandler(async (req, res) => {
  const Bus = getBusModel(req.db); // ✅ change

  let {
    isActive,
    search,
    page = 1,
    limit = 10,
    sortBy = "recent",
  } = req.query;

  page = Number(page);
  limit = Number(limit);
  const skip = (page - 1) * limit;

  const filter = {};

  if (isActive !== undefined) {
    filter.isActive = isActive === "true";
  }

  if (search) {
    filter.$or = [
      { busNumber: { $regex: search, $options: "i" } },
      { driverName: { $regex: search, $options: "i" } },
      { vehicleNumber: { $regex: search, $options: "i" } },
    ];
  }

  let sort = { createdAt: -1 };

  if (sortBy === "oldest") sort = { createdAt: 1 };
  if (sortBy === "busNumber") sort = { busNumber: 1 };

  const totalBuses = await Bus.countDocuments(filter);

  const buses = await Bus.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit);

  res.status(200).json(
    new apiResponse(
      200,
      {
        buses,
        pagination: {
          totalRows: totalBuses,
          totalPages: Math.ceil(totalBuses / limit),
          currentPage: page,
          perPage: limit,
        },
      },
      "Buses fetched successfully"
    )
  );
});

/* ================= UPDATE BUS ================= */
export const updateBus = asyncHandler(async (req, res) => {
  const Bus = getBusModel(req.db); // ✅ change

  const { id } = req.params;

  const bus = await Bus.findById(id);

  if (!bus) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Bus not found"));
  }

  Object.assign(bus, req.body);

  await bus.save();

  res
    .status(200)
    .json(new apiResponse(200, bus, "Bus updated"));
});

/* ================= DELETE BUS ================= */
export const deleteBus = asyncHandler(async (req, res) => {
  const Bus = getBusModel(req.db); // ✅ change

  const { id } = req.params;

  const bus = await Bus.findByIdAndDelete(id);

  if (!bus) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Bus not found"));
  }

  res
    .status(200)
    .json(new apiResponse(200, null, "Bus deleted"));
});

/* ================= ASSIGN BUS ================= */
export const assignBusToRoute = asyncHandler(async (req, res) => {
  const BusRoute = getBusRouteModel(req.db); // ✅ change

  const { busId, routeId, sessionId } = req.body;

  if (!busId || !routeId || !sessionId) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Required fields missing"));
  }

  const exists = await BusRoute.findOne({
    busId,
    routeId,
    sessionId,
  });

  if (exists) {
    return res
      .status(409)
      .json(new apiResponse(409, null, "Already assigned"));
  }

  const assign = await BusRoute.create({
    busId,
    routeId,
    sessionId,
  });

  res
    .status(201)
    .json(new apiResponse(201, assign, "Bus assigned to route"));
});

/* ================= GET BUS ROUTES ================= */
export const getBusRoutes = asyncHandler(async (req, res) => {
  const BusRoute = getBusRouteModel(req.db); // ✅ change

  const { sessionId } = req.query;

  const filter = {};
  if (sessionId) filter.sessionId = sessionId;

  const data = await BusRoute.find(filter)
    .populate("busId")
    .populate("routeId");

  res
    .status(200)
    .json(new apiResponse(200, data, "Bus routes fetched"));
});