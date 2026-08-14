/**
 * StudentLedgerController.js
 *
 * Thin HTTP wrapper around studentLedgerService.
 * All fee ledger logic lives in utils/studentLedgerService.js
 * so it can be shared with AI chat without duplication.
 */

import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse }  from "../../../utils/apiResponse.js";
import { getStudentLedgerData } from "../../../utils/studentLedgerService.js";

const getStudentLedger = asyncHandler(async (req, res) => {

  const { sessionId, studentId, classId, streamId } = req.query;

  if (!sessionId || !studentId || !classId) {
    return res.status(400).json(new apiResponse(400, null, "Required fields missing"));
  }

  const data = await getStudentLedgerData({
    db: req.db,
    sessionId,
    studentId,
    classId,
    streamId,
  });

  if (!data) {
    return res.status(404).json(new apiResponse(404, null, "Student not found"));
  }

  return res.status(200).json(
    new apiResponse(200, {
      student: data.studentInfo,   // frontend expects "student" key
      summary: data.summary,
      ledger:  data.ledger,
    }, "Student ledger fetched successfully")
  );
});

export { getStudentLedger };
