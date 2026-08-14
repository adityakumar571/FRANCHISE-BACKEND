import { apiResponse } from "../../../utils/apiResponse.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";

const INSTALLMENT_PERIODS = {
  MONTHLY: [
    "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER",
    "OCTOBER", "NOVEMBER", "DECEMBER", "JANUARY", "FEBRUARY", "MARCH",
  ],
  QUARTERLY: [
    "APR-JUN", "JUL-SEP", "OCT-DEC", "JAN-MAR",
  ],
  HALF_YEARLY: [
    "APR-SEP", "OCT-MAR",
  ],
  YEARLY: [
    "ANNUAL",
  ],
};

const getInstallmentPeriods = asyncHandler(async (req, res) => {
  const { installmentType } = req.params;

  const periods = INSTALLMENT_PERIODS[installmentType?.toUpperCase()];

  if (!periods) {
    return res
      .status(400)
      .json(new apiResponse(400, null, `Invalid installment type. Valid types: ${Object.keys(INSTALLMENT_PERIODS).join(", ")}`));
  }

  res.status(200).json(
    new apiResponse(200, {
      installmentType,
      totalInstallments: periods.length,
      periods,
    })
  );
});

export { getInstallmentPeriods };