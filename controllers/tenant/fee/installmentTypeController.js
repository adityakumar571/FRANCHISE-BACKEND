import { getInstallmentTypeModel } from "../../../models/tenant/master/InstallmentType.model.js";

import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";


export const activateInstallmentType = asyncHandler(async (req, res) => {

  const InstallmentType = getInstallmentTypeModel(req.db); // ✅

  const { type } = req.body;

  if (!type) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Type is required"));
  }

  const installment = await InstallmentType.findOne({ name: type });

  if (!installment) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Installment type not found"));
  }

  await InstallmentType.updateMany({}, { isActive: false });

  installment.isActive = true;
  await installment.save();

  res.status(200).json(
    new apiResponse(
      200,
      installment,
      `${type} activated successfully`
    )
  );
});


export const getActiveInstallmentType_old = asyncHandler(async (req, res) => {

  const InstallmentType = getInstallmentTypeModel(req.db); // ✅

  const active = await InstallmentType.find();

  res.status(200).json(
    new apiResponse(200, active, "Active installment type fetched")
  );
});


export const getActiveInstallmentType = asyncHandler(async (req, res) => {

  const InstallmentType = getInstallmentTypeModel(req.db); // ✅

  const { isActive } = req.query;

  const filter = {};

  // Only apply isActive filter if explicitly passed as query param
  if (isActive !== undefined) {
    filter.isActive = isActive === "true";
  }

  // Return all types sorted by name so CUSTOM_10, MONTHLY, QUARTERLY always show
  const types = await InstallmentType.find(filter).sort({ name: 1 });

  res.status(200).json(
    new apiResponse(
      200,
      types,
      "Installment types fetched successfully"
    )
  );
});


export const updateInstallmentActiveStatus = asyncHandler(async (req, res) => {

  const InstallmentType = getInstallmentTypeModel(req.db); // ✅

  const { id } = req.params;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid ID is required"));
  }

  const installment = await InstallmentType.findById(id);

  if (!installment) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Installment type not found"));
  }

  // Toggle isActive status independently (no longer deactivates others)
  installment.isActive = !installment.isActive;
  await installment.save();

  res.status(200).json(
    new apiResponse(
      200,
      installment,
      `${installment.name} ${installment.isActive ? "activated" : "deactivated"} successfully`
    )
  );
});

export const seedInstallmentTypes = asyncHandler(async (req, res) => {
  const InstallmentType = getInstallmentTypeModel(req.db);

  const types = ["MONTHLY", "QUARTERLY", "CUSTOM_10"];
  const results = [];

  for (const name of types) {
    const existing = await InstallmentType.findOne({ name });
    if (!existing) {
      const created = await InstallmentType.create({ name, isActive: false });
      results.push({ name, status: "created" });
    } else {
      results.push({ name, status: "already exists" });
    }
  }

  res.status(200).json(new apiResponse(200, results, "Installment types seeded"));
});