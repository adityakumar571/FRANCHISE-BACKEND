
import mongoose from "mongoose";
import { getRouteStopModel } from "../../../models/tenant/master/RouteStops.model.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";



export const createRouteStop_old = asyncHandler(async (req, res) => {

  const RouteStop = getRouteStopModel(req.db); // ✅

  const { routeId, stopName, pickupTime, dropTime, feeAmount } = req.body;

  if (!routeId || !stopName || !feeAmount) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Required fields missing"));
  }

  const lastStop = await RouteStop.findOne({ routeId }).sort({ stopOrder: -1 });
  const newOrder = lastStop ? lastStop.stopOrder + 1 : 1;

  const stop = await RouteStop.create({
    routeId,
    stopName,
    stopOrder: newOrder,
    pickupTime,
    dropTime,
    feeAmount,
  });

  res.status(201).json(new apiResponse(201, stop, "Route stop created"));
});


export const createRouteStop = asyncHandler(async (req, res) => {

  const RouteStop = getRouteStopModel(req.db); // ✅

  const {
    routeId, stopName, pickupTime, dropTime,
    feeAmount,
    feeHomeToSchool, feeSchoolToHome, feeBoth,
  } = req.body;

  if (!routeId || !stopName) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Required fields missing"));
  }

  const routeObjectId = new mongoose.Types.ObjectId(routeId);
  const normalizedStop = stopName.trim().toLowerCase();

  const exists = await RouteStop.findOne({ routeId: routeObjectId, stopName: normalizedStop });

  if (exists) {
    return res.status(409).json(
      new apiResponse(409, null, "This stop already exists for this route")
    );
  }

  const lastStop = await RouteStop.findOne({ routeId: routeObjectId }).sort({ stopOrder: -1 });
  const newOrder = lastStop ? lastStop.stopOrder + 1 : 1;

  try {
    const stop = await RouteStop.create({
      routeId: routeObjectId,
      stopName: normalizedStop,
      stopOrder: newOrder,
      pickupTime,
      dropTime,
      feeAmount: feeAmount || feeBoth || 0,
      feeHomeToSchool: Number(feeHomeToSchool) || 0,
      feeSchoolToHome: Number(feeSchoolToHome) || 0,
      feeBoth: Number(feeBoth) || Number(feeAmount) || 0,
    });

    res.status(201).json(new apiResponse(201, stop, "Route stop created"));

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json(new apiResponse(409, null, "Duplicate stop not allowed"));
    }
    throw error;
  }
});


export const getRouteStops = asyncHandler(async (req, res) => {

  const RouteStop = getRouteStopModel(req.db); // ✅

  let {
    routeId,
    page = 1,
    limit = 10,
    isPagination = "true",
    search,
  } = req.query;

  page = Number(page);
  limit = Number(limit);
  const skip = (page - 1) * limit;

  const filter = {};

  if (routeId && mongoose.Types.ObjectId.isValid(routeId)) {
    filter.routeId = new mongoose.Types.ObjectId(routeId);
  }

  if (search) {
    filter.stopName = { $regex: search, $options: "i" };
  }

  const totalRows = await RouteStop.countDocuments(filter);

  let query = RouteStop.find(filter)
    .populate("routeId", "routeName routeCode")
    .sort({ stopOrder: 1 });

  if (isPagination === "true") {
    query = query.skip(skip).limit(limit);
  }

  const stops = await query;

  res.status(200).json(
    new apiResponse(
      200,
      {
        stops,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / limit),
          currentPage: page,
          perPage: limit,
        },
      },
      "Stops fetched successfully"
    )
  );
});


export const getAllRouteStops = asyncHandler(async (req, res) => {

  const RouteStop = getRouteStopModel(req.db); // ✅

  let {
    page = 1,
    limit = 10,
    isPagination = "true",
    search,
  } = req.query;

  page = Number(page);
  limit = Number(limit);
  const skip = (page - 1) * limit;

  const filter = {};

  if (search) {
    filter.stopName = { $regex: search, $options: "i" };
  }

  const totalRows = await RouteStop.countDocuments(filter);

  let query = RouteStop.find(filter)
    .populate("routeId", "routeName routeCode startLocation endLocation")
    .sort({ stopOrder: 1 });

  if (isPagination === "true") {
    query = query.skip(skip).limit(limit);
  }

  const stops = await query;

  const grouped = {};

  stops.forEach((stop) => {
    const routeId = stop.routeId?._id?.toString();

    if (!grouped[routeId]) {
      grouped[routeId] = {
        routeId: stop.routeId?._id,
        routeName: stop.routeId?.routeName,
        routeCode: stop.routeId?.routeCode,
        startLocation: stop.routeId?.startLocation,
        endLocation: stop.routeId?.endLocation,
        stops: [],
      };
    }

    grouped[routeId].stops.push({
      _id: stop._id,
      stopName: stop.stopName,
      stopOrder: stop.stopOrder,
      pickupTime: stop.pickupTime,
      dropTime: stop.dropTime,
      feeAmount: stop.feeAmount,
    });
  });

  const result = Object.values(grouped);

  res.status(200).json(
    new apiResponse(
      200,
      {
        list: result,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / limit),
          currentPage: page,
          perPage: limit,
        },
      },
      "All route stops fetched successfully"
    )
  );
});


export const updateRouteStop = asyncHandler(async (req, res) => {

  const RouteStop = getRouteStopModel(req.db); // ✅

  const { id } = req.params;

  const stop = await RouteStop.findById(id);

  if (!stop) {
    return res.status(404).json(new apiResponse(404, null, "Stop not found"));
  }

  const { stopName, pickupTime, dropTime, feeAmount, feeHomeToSchool, feeSchoolToHome, feeBoth } = req.body;

  if (stopName !== undefined) stop.stopName = stopName;
  if (pickupTime !== undefined) stop.pickupTime = pickupTime;
  if (dropTime !== undefined) stop.dropTime = dropTime;
  if (feeHomeToSchool !== undefined) stop.feeHomeToSchool = Number(feeHomeToSchool);
  if (feeSchoolToHome !== undefined) stop.feeSchoolToHome = Number(feeSchoolToHome);
  if (feeBoth !== undefined) stop.feeBoth = Number(feeBoth);

  if (feeBoth !== undefined) stop.feeAmount = Number(feeBoth);
  else if (feeAmount !== undefined) stop.feeAmount = Number(feeAmount);

  await stop.save();

  res.status(200).json(new apiResponse(200, stop, "Stop updated successfully"));
});


export const deleteRouteStop = asyncHandler(async (req, res) => {

  const RouteStop = getRouteStopModel(req.db); // ✅

  const { id } = req.params;

  const stop = await RouteStop.findByIdAndDelete(id);

  if (!stop) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Stop not found"));
  }

  res
    .status(200)
    .json(new apiResponse(200, null, "Stop deleted successfully"));
});


export const reorderRouteStops_old = asyncHandler(async (req, res) => {

  const RouteStop = getRouteStopModel(req.db); // ✅

  const { stops } = req.body;

  if (!Array.isArray(stops) || stops.length === 0) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "stops array required"));
  }

  const bulkOps = stops.map((item) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(item.id) },
      update: { $set: { stopOrder: item.order } },
    },
  }));

  await RouteStop.bulkWrite(bulkOps);

  res.status(200).json(new apiResponse(200, null, "Stops reordered successfully"));
});


export const reorderRouteStops = asyncHandler(async (req, res) => {

  const RouteStop = getRouteStopModel(req.db); // ✅

  const { stops } = req.body;

  if (!Array.isArray(stops) || stops.length === 0) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "stops array required"));
  }

  for (const item of stops) {
    if (!mongoose.Types.ObjectId.isValid(item.id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, `Invalid id: ${item.id}`));
    }
  }

  const tempOps = stops.map((item, index) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(item.id) },
      update: { $set: { stopOrder: 100000 + index } },
    },
  }));
  await RouteStop.bulkWrite(tempOps);

  const finalOps = stops.map((item) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(item.id) },
      update: { $set: { stopOrder: item.order } },
    },
  }));
  await RouteStop.bulkWrite(finalOps);

  res.status(200).json(new apiResponse(200, null, "Stops reordered successfully"));
});