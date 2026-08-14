import mongoose from "mongoose";
import { getFeeInstallmentModel } from "../../../models/tenant/master/FeeInstallment.model.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";


/* ================= GET INSTALLMENTS BY FEE STRUCTURE ================= */
const getInstallmentsByFeeStructure = asyncHandler(async (req, res) => {
  try {
    const FeeInstallment = getFeeInstallmentModel(req.db); // ✅

    const { feeStructureId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(feeStructureId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid fee structure ID"));
    }

    const installments = await FeeInstallment.find({
      feeStructureId,
    }).sort({ installmentNo: 1 });

    res.status(200).json(
      new apiResponse(
        200,
        installments,
        "Fee installments fetched successfully"
      )
    );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= UPDATE FEE INSTALLMENT ================= */
const updateFeeInstallment = asyncHandler(async (req, res) => {
  try {
    const FeeInstallment = getFeeInstallmentModel(req.db); // ✅

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid installment ID"));
    }

    const updatedInstallment = await FeeInstallment.findByIdAndUpdate(
      id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedInstallment) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Installment not found"));
    }

    res.status(200).json(
      new apiResponse(
        200,
        updatedInstallment,
        "Fee installment updated successfully"
      )
    );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= DELETE FEE INSTALLMENT ================= */
const deleteFeeInstallment = asyncHandler(async (req, res) => {
  try {
    const FeeInstallment = getFeeInstallmentModel(req.db); // ✅

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid installment ID"));
    }

    const deletedInstallment = await FeeInstallment.findByIdAndDelete(id);

    if (!deletedInstallment) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Installment not found"));
    }

    res.status(200).json(
      new apiResponse(
        200,
        deletedInstallment,
        "Fee installment deleted successfully"
      )
    );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

export {
  getInstallmentsByFeeStructure,
  updateFeeInstallment,
  deleteFeeInstallment
};