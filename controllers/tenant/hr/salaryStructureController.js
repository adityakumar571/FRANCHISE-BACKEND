import { getSalaryStructureModel } from "../../../models/tenant/hr/SalaryStructure.model.js";
import { getStaffModel }           from "../../../models/tenant/hr/Staff.model.js";
import { apiResponse }             from "../../../utils/apiResponse.js";
import { asyncHandler }            from "../../../utils/asyncHandler.js";
import { apiError }                from "../../../utils/apiError.js";

// ── GET ALL ───────────────────────────────────────────────────
export const getSalaryStructures = asyncHandler(async (req, res) => {
  const SS = getSalaryStructureModel(req.db);
  const { staffId, status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (staffId) filter.staff = staffId;
  if (status)  filter.status = status;

  const skip  = (Number(page) - 1) * Number(limit);
  const [structures, total] = await Promise.all([
    SS.find(filter)
      .populate({ path: "staff", select: "employeeName employeeCode department designation", populate: [{ path: "department", select: "name" }, { path: "designation", select: "name" }] })
      .sort({ effectiveFrom: -1 })
      .skip(skip).limit(Number(limit)).lean(),
    SS.countDocuments(filter),
  ]);

  return res.status(200).json(new apiResponse(200, { structures, total }, "Salary structures fetched"));
});

// ── CREATE ────────────────────────────────────────────────────
export const createSalaryStructure = asyncHandler(async (req, res) => {
  const SS    = getSalaryStructureModel(req.db);
  const Staff = getStaffModel(req.db);
  const { staff, effectiveFrom, basicSalary, allowance = 0, fixedDeduction = 0 } = req.body;

  if (!staff)        return apiError(res, 400, false, "staff is required");
  if (!effectiveFrom) return apiError(res, 400, false, "effectiveFrom is required");
  if (!basicSalary || Number(basicSalary) <= 0) return apiError(res, 400, false, "basicSalary must be > 0");

  const staffExists = await Staff.findById(staff).lean();
  if (!staffExists) return apiError(res, 404, false, "Staff not found");

  // Deactivate old Active structure for this staff
  await SS.updateMany({ staff, status: "Active" }, { status: "Inactive" });

  const grossSalary = Number(basicSalary) + Number(allowance) - Number(fixedDeduction);

  const ss = await SS.create({
    staff, effectiveFrom, basicSalary: Number(basicSalary),
    allowance: Number(allowance), fixedDeduction: Number(fixedDeduction),
    grossSalary: Math.max(0, grossSalary), status: "Active",
  });

  // Also update staff.monthlySalary with new gross
  await Staff.findByIdAndUpdate(staff, { monthlySalary: Math.max(0, grossSalary) });

  return res.status(201).json(new apiResponse(201, ss, "Salary structure created"));
});

// ── UPDATE ────────────────────────────────────────────────────
export const updateSalaryStructure = asyncHandler(async (req, res) => {
  const SS = getSalaryStructureModel(req.db);
  const { basicSalary, allowance, fixedDeduction, effectiveFrom, status } = req.body;

  const ss = await SS.findById(req.params.id);
  if (!ss) return apiError(res, 404, false, "Salary structure not found");

  if (basicSalary    !== undefined) ss.basicSalary    = Number(basicSalary);
  if (allowance      !== undefined) ss.allowance      = Number(allowance);
  if (fixedDeduction !== undefined) ss.fixedDeduction = Number(fixedDeduction);
  if (effectiveFrom  !== undefined) ss.effectiveFrom  = effectiveFrom;
  if (status         !== undefined) ss.status         = status;

  ss.grossSalary = Math.max(0, ss.basicSalary + ss.allowance - ss.fixedDeduction);
  await ss.save();

  return res.status(200).json(new apiResponse(200, ss, "Salary structure updated"));
});

// ── DELETE ────────────────────────────────────────────────────
export const deleteSalaryStructure = asyncHandler(async (req, res) => {
  const SS = getSalaryStructureModel(req.db);
  const ss = await SS.findByIdAndDelete(req.params.id);
  if (!ss) return apiError(res, 404, false, "Salary structure not found");
  return res.status(200).json(new apiResponse(200, null, "Salary structure deleted"));
});
