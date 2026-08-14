import mongoose from "mongoose";

import { getRouteModel } from "../../../models/tenant/master/RouteMaster.model.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";



export const createRoute_old = asyncHandler(async (req, res) => {

  const Route = getRouteModel(req.db); // ✅

  const { routeName, routeCode, startLocation, endLocation } = req.body;

  if (!routeName) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "routeName is required"));
  }

  const route = await Route.create({
    routeName,
    routeCode,
    startLocation,
    endLocation,
  });

  res
    .status(201)
    .json(new apiResponse(201, route, "Route created successfully"));
});



export const createRoute = asyncHandler(async (req, res) => {

  const Route = getRouteModel(req.db); // ✅

  const { routeName, routeCode, startLocation, endLocation } = req.body;

  if (!routeName || !startLocation || !endLocation) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Required fields missing"));
  }

  const start = startLocation.trim().toLowerCase();
  const end = endLocation.trim().toLowerCase();

  const exists = await Route.findOne({
    startLocation: start,
    endLocation: end,
  });

  if (exists) {
    return res.status(409).json(
      new apiResponse(
        409,
        null,
        "Route with same start and end already exists"
      )
    );
  }

  const route = await Route.create({
    routeName,
    routeCode,
    startLocation: start,
    endLocation: end,
  });

  res
    .status(201)
    .json(new apiResponse(201, route, "Route created successfully"));
});



export const getRoutes_old = asyncHandler(async (req, res) => {

  const Route = getRouteModel(req.db); // ✅

  const { isActive } = req.query;

  const filter = {};
  if (isActive !== undefined) {
    filter.isActive = isActive === "true";
  }

  const routes = await Route.find(filter).sort({ createdAt: -1 });

  res
    .status(200)
    .json(new apiResponse(200, routes, "Routes fetched successfully"));
});



export const getRoutes = asyncHandler(async (req, res) => {

  const Route = getRouteModel(req.db); // ✅

  let {
    isActive,
    search,
    page = 1,
    limit = 10,
    sortBy = "recent"
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
      { routeName: { $regex: search, $options: "i" } },
      { startLocation: { $regex: search, $options: "i" } },
      { endLocation: { $regex: search, $options: "i" } },
    ];
  }

  const sort =
    sortBy === "oldest"
      ? { createdAt: 1 }
      : { createdAt: -1 };

  const totalRoutes = await Route.countDocuments(filter);
  const totalPages = Math.ceil(totalRoutes / limit);

  const routes = await Route.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit);

  res.status(200).json(
    new apiResponse(
      200,
      {
        routes,
        pagination: {
          totalRoutes,
          totalPages,
          currentPage: page,
          perPage: limit,
        },
      },
      "Routes fetched successfully"
    )
  );
});



export const updateRoute = asyncHandler(async (req, res) => {

  const Route = getRouteModel(req.db); // ✅

  const { id } = req.params;

  const route = await Route.findById(id);

  if (!route) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Route not found"));
  }

  const { routeName, routeCode, startLocation, endLocation, isActive } =
    req.body;

  if (routeName !== undefined) route.routeName = routeName;
  if (routeCode !== undefined) route.routeCode = routeCode;
  if (startLocation !== undefined) route.startLocation = startLocation;
  if (endLocation !== undefined) route.endLocation = endLocation;
  if (isActive !== undefined) route.isActive = isActive;

  await route.save();

  res
    .status(200)
    .json(new apiResponse(200, route, "Route updated successfully"));
});



export const deleteRoute = asyncHandler(async (req, res) => {

  const Route = getRouteModel(req.db); // ✅

  const { id } = req.params;

  const route = await Route.findByIdAndDelete(id);

  if (!route) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Route not found"));
  }

  res
    .status(200)
    .json(new apiResponse(200, null, "Route deleted successfully"));
});