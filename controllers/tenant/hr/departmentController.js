import { getDepartmentModel } from "../../../models/tenant/hr/Department.model.js";
import { apiResponse }         from "../../../utils/apiResponse.js";
import { asyncHandler }        from "../../../utils/asyncHandler.js";
import { apiError }            from "../../../utils/apiError.js";

// ── GET ALL ──────────────────────────────────────────────────
export const getDepartments = asyncHandler(async (req, res) => {
  const Department = getDepartmentModel(req.db);

  const { search, isActive, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (search)   filter.name = { $regex: search.trim(), $options: "i" };
  if (isActive !== undefined) filter.isActive = isActive === "true";

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Department.countDocuments(filter);
  const departments = await Department.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  return res.status(200).json(
    new apiResponse(200, { departments, total, page: Number(page), limit: Number(limit) }, "Departments fetched")
  );
});

// ── GET ONE ──────────────────────────────────────────────────
export const getDepartmentById = asyncHandler(async (req, res) => {
  const Department = getDepartmentModel(req.db);
  const dept = await Department.findById(req.params.id).lean();
  if (!dept) return apiError(res, 404, false, "Department not found");
  return res.status(200).json(new apiResponse(200, dept, "Department fetched"));
});

// ── CREATE ───────────────────────────────────────────────────
export const createDepartment = asyncHandler(async (req, res) => {
  const Department = getDepartmentModel(req.db);
  const { name, description } = req.body;

  if (!name?.trim()) return apiError(res, 400, false, "Department name is required");

  const exists = await Department.findOne({ name: { $regex: `^${name.trim()}$`, $options: "i" } });
  if (exists) return apiError(res, 409, false, "Department already exists");

  const dept = await Department.create({ name: name.trim(), description });
  return res.status(201).json(new apiResponse(201, dept, "Department created successfully"));
});

// ── UPDATE ───────────────────────────────────────────────────
export const updateDepartment = asyncHandler(async (req, res) => {
  const Department = getDepartmentModel(req.db);
  const { name, description, isActive } = req.body;

  if (name) {
    const exists = await Department.findOne({
      name: { $regex: `^${name.trim()}$`, $options: "i" },
      _id: { $ne: req.params.id },
    });
    if (exists) return apiError(res, 409, false, "Another department with this name already exists");
  }

  const dept = await Department.findByIdAndUpdate(
    req.params.id,
    { ...(name && { name: name.trim() }), ...(description !== undefined && { description }), ...(isActive !== undefined && { isActive }) },
    { new: true, runValidators: true }
  );
  if (!dept) return apiError(res, 404, false, "Department not found");
  return res.status(200).json(new apiResponse(200, dept, "Department updated successfully"));
});

// ── DELETE ───────────────────────────────────────────────────
export const deleteDepartment = asyncHandler(async (req, res) => {
  const Department = getDepartmentModel(req.db);
  const dept = await Department.findByIdAndDelete(req.params.id);
  if (!dept) return apiError(res, 404, false, "Department not found");
  return res.status(200).json(new apiResponse(200, null, "Department deleted successfully"));
});
