import mongoose from "mongoose";
import { getLateFeeSettingModel } from "../../../models/tenant/master/LateFeeSetting.model.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";



const createLateFeeSetting = asyncHandler(async (req, res) => {

  const LateFeeSetting = getLateFeeSettingModel(req.db); // ✅

  const {
    sessionId,
    graceDays,
    fineType,
    fineAmount,
    maxFine
  } = req.body;

  if (!sessionId || !fineType || !fineAmount) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Required fields missing"));
  }

  await LateFeeSetting.updateMany(
    { sessionId },
    { $set: { isActive: false } }
  );

  const setting = await LateFeeSetting.create({
    sessionId,
    graceDays,
    fineType,
    fineAmount,
    maxFine,
    isActive: true
  });

  res.status(201).json(
    new apiResponse(201, setting, "Late fee setting created successfully")
  );

});


/* ================= DELETE LATE FEE SETTING ================= */
const deleteLateFeeSetting = asyncHandler(async (req, res) => {

  const LateFeeSetting = getLateFeeSettingModel(req.db); // ✅

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid setting id"));
  }

  const setting = await LateFeeSetting.findById(id);

  if (!setting) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Late fee setting not found"));
  }

  await LateFeeSetting.findByIdAndDelete(id);

  res.status(200).json(
    new apiResponse(
      200,
      null,
      "Late fee setting deleted successfully"
    )
  );

});


const getLateFeeSetting = asyncHandler(async (req,res)=>{

  const LateFeeSetting = getLateFeeSettingModel(req.db); // ✅

  const {sessionId} = req.query;

  const setting = await LateFeeSetting.findOne({
    sessionId,
    isActive:true
  });

  res.status(200).json(
    new apiResponse(200,setting,"Late fee setting fetched")
  );

});


const updateLateFeeSetting = asyncHandler(async (req, res) => {

  const LateFeeSetting = getLateFeeSettingModel(req.db); // ✅

  const { id } = req.params;

  const {
    graceDays,
    fineType,
    fineAmount,
    maxFine,
    isActive
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid setting id"));
  }

  const setting = await LateFeeSetting.findById(id);

  if (!setting) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Late fee setting not found"));
  }

  if (graceDays !== undefined) setting.graceDays = graceDays;
  if (fineType !== undefined) setting.fineType = fineType;
  if (fineAmount !== undefined) setting.fineAmount = fineAmount;
  if (maxFine !== undefined) setting.maxFine = maxFine;

  if (isActive === true) {

    await LateFeeSetting.updateMany(
      {
        sessionId: setting.sessionId,
        _id: { $ne: id }
      },
      { $set: { isActive: false } }
    );

    setting.isActive = true;
  }

  if (isActive === false) {
    setting.isActive = false;
  }

  await setting.save();

  res.status(200).json(
    new apiResponse(200, setting, "Late fee setting updated successfully")
  );

});


const getAllLateFeeSettings = asyncHandler(async (req, res) => {

  const LateFeeSetting = getLateFeeSettingModel(req.db); // ✅

  const { sessionId } = req.query;

  if (!sessionId) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "sessionId required"));
  }

  const settings = await LateFeeSetting.find({
    sessionId
  }).sort({ createdAt: -1 });

  res.status(200).json(
    new apiResponse(
      200,
      settings,
      "Late fee settings fetched successfully"
    )
  );

});


export {
  createLateFeeSetting,
  getLateFeeSetting,
  updateLateFeeSetting,
  getAllLateFeeSettings,
  deleteLateFeeSetting
};