import mongoose from "mongoose";
import { getStudentPaymentModel } from "../../../../models/tenant/master/StudentPayment.model.js";
import { asyncHandler } from "../../../../utils/asyncHandler.js";
import { apiResponse } from "../../../../utils/apiResponse.js";


const feeModeReport = asyncHandler(async (req, res) => {

  const StudentPayment = getStudentPaymentModel(req.db); // ✅

  const { sessionId, fromDate, toDate } = req.query;

  const match = {
    sessionId: new mongoose.Types.ObjectId(sessionId),
    paymentStatus: "SUCCESS",
  };

  if (fromDate || toDate) {
    match.createdAt = {};

    if (fromDate) match.createdAt.$gte = new Date(fromDate);

    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      match.createdAt.$lte = end;
    }
  }

  const result = await StudentPayment.aggregate([

    { $match: match },

    {
      $group: {
        _id: "$paymentMode",
        totalCollection: { $sum: "$amountPaid" },
        totalTransactions: { $sum: 1 },
      },
    },

    {
      $sort: { totalCollection: -1 },
    },
  ]);

  res
    .status(200)
    .json(new apiResponse(200, result, "Mode wise report fetched"));
});

export { feeModeReport };