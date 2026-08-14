import { getDesignationModel } from "../../../models/tenant/hr/Designation.model.js";
import { apiResponse }          from "../../../utils/apiResponse.js";
import { asyncHandler }         from "../../../utils/asyncHandler.js";
import { apiError }             from "../../../utils/apiError.js";

// ── GET ALL ──────────────────────────────────────────────────
export const getDesignations = asyncHandler(async (req, res) => {
  const Designation = getDesignationModel(req.db);

  const { search, department, staffType, isActive, page = 1, limit = 100 } = req.query;

  const filter = {};
  if (search)     filter.name = { $regex: search.trim(), $options: "i" };
  if (department) filter.department = department;
  if (staffType)  filter.staffType  = staffType;
  if (isActive !== undefined) filter.isActive = isActive === "true";

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Designation.countDocuments(filter);
  const designations = await Designation.find(filter)
    .populate("department", "name")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  return res.status(200).json(
    new apiResponse(200, { designations, total, page: Number(page), limit: Number(limit) }, "Designations fetched")
  );
});

// ── GET ONE ──────────────────────────────────────────────────
export const getDesignationById = asyncHandler(async (req, res) => {
  const Designation = getDesignationModel(req.db);
  const desig = await Designation.findById(req.params.id).populate("department", "name").lean();
  if (!desig) return apiError(res, 404, false, "Designation not found");
  return res.status(200).json(new apiResponse(200, desig, "Designation fetched"));
});

// ── CREATE ───────────────────────────────────────────────────
export const createDesignation = asyncHandler(async (req, res) => {
  const Designation = getDesignationModel(req.db);
  const { name, department, staffType } = req.body;

  if (!name?.trim()) return apiError(res, 400, false, "Designation name is required");

  const exists = await Designation.findOne({
    name:       { $regex: `^${name.trim()}$`, $options: "i" },
    department: department || null,
  });
  if (exists) return apiError(res, 409, false, "Designation already exists for this department");

  const desig = await Designation.create({ name: name.trim(), department, staffType });
  return res.status(201).json(new apiResponse(201, desig, "Designation created successfully"));
});

// ── UPDATE ───────────────────────────────────────────────────
export const updateDesignation = asyncHandler(async (req, res) => {
  const Designation = getDesignationModel(req.db);
  const { name, department, staffType, isActive } = req.body;

  const desig = await Designation.findByIdAndUpdate(
    req.params.id,
    {
      ...(name       !== undefined && { name: name.trim() }),
      ...(department !== undefined && { department }),
      ...(staffType  !== undefined && { staffType }),
      ...(isActive   !== undefined && { isActive }),
    },
    { new: true, runValidators: true }
  );
  if (!desig) return apiError(res, 404, false, "Designation not found");
  return res.status(200).json(new apiResponse(200, desig, "Designation updated successfully"));
});

// ── DELETE ───────────────────────────────────────────────────
export const deleteDesignation = asyncHandler(async (req, res) => {
  const Designation = getDesignationModel(req.db);
  const desig = await Designation.findByIdAndDelete(req.params.id);
  if (!desig) return apiError(res, 404, false, "Designation not found");
  return res.status(200).json(new apiResponse(200, null, "Designation deleted successfully"));
});
