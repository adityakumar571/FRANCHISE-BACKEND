import { getStaffModel } from "../../../models/tenant/hr/Staff.model.js";
import { apiResponse }   from "../../../utils/apiResponse.js";
import { asyncHandler }  from "../../../utils/asyncHandler.js";
import { apiError }      from "../../../utils/apiError.js";

const MOBILE_REGEX = /^\d{10}$/;

// ── Populate options ──────────────────────────────────────────────────────────
const STAFF_POPULATE = [
  { path: "department",  select: "name" },
  { path: "designation", select: "name staffType" },
];

// ── GET ALL ───────────────────────────────────────────────────────────────────
export const getAllStaff = asyncHandler(async (req, res) => {
  const Staff = getStaffModel(req.db);

  const {
    search, staffType, department, employmentType,
    isActive, page = 1, limit = 20,
  } = req.query;

  const filter = {};
  if (search) {
    filter.$or = [
      { employeeName: { $regex: search.trim(), $options: "i" } },
      { employeeCode: { $regex: search.trim(), $options: "i" } },
      { mobile:       { $regex: search.trim(), $options: "i" } },
    ];
  }
  if (staffType)       filter.staffType       = staffType;
  if (department)      filter.department      = department;
  if (employmentType)  filter.employmentType  = employmentType;
  if (isActive !== undefined && isActive !== "") {
    filter.isActive = isActive === "true";
  }

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Staff.countDocuments(filter);

  const staff = await Staff.find(filter)
    .populate(STAFF_POPULATE)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  return res.status(200).json(
    new apiResponse(200, { staff, total, page: Number(page), limit: Number(limit) },
      "Staff fetched successfully")
  );
});

// ── GET ONE ───────────────────────────────────────────────────────────────────
export const getStaffById = asyncHandler(async (req, res) => {
  const Staff = getStaffModel(req.db);

  const member = await Staff.findById(req.params.id)
    .populate(STAFF_POPULATE)
    .lean();

  if (!member) return apiError(res, 404, false, "Staff not found");

  // Normalise flat bank fields into a nested object for frontend StaffProfile
  const result = {
    ...member,
    dob: member.dateOfBirth,   // alias used by StaffProfile
    bankDetails: {
      bankName:      member.bankName      || "",
      accountNumber: member.accountNumber || "",
      ifsc:          member.ifscCode      || "",
    },
  };

  return res.status(200).json(new apiResponse(200, result, "Staff fetched successfully"));
});

// ── CREATE ────────────────────────────────────────────────────────────────────
export const createStaff = asyncHandler(async (req, res) => {
  const Staff = getStaffModel(req.db);

  const {
    employeeCode, employeeName, staffType, department, designation,
    mobile, email, gender, dateOfBirth, dateOfJoining, address,
    employmentType, monthlySalary,
    bankName, accountNumber, ifscCode, photo,
  } = req.body;

  // Required-field validation
  if (!employeeName?.trim()) return apiError(res, 400, false, "Employee name is required");
  if (!staffType)            return apiError(res, 400, false, "Staff type is required");
  if (!department)           return apiError(res, 400, false, "Department is required");
  if (!designation)          return apiError(res, 400, false, "Designation is required");
  if (!mobile?.trim())       return apiError(res, 400, false, "Mobile number is required");
  if (!MOBILE_REGEX.test(mobile)) return apiError(res, 400, false, "Enter valid 10-digit mobile number");
  if (!dateOfJoining)        return apiError(res, 400, false, "Date of joining is required");

  // Duplicate employee code check
  if (employeeCode?.trim()) {
    const codeExists = await Staff.findOne({ employeeCode: employeeCode.trim() });
    if (codeExists) return apiError(res, 409, false, "Employee code already exists");
  }

  const member = await Staff.create({
    employeeCode:   employeeCode?.trim(),
    employeeName:   employeeName.trim(),
    staffType,
    department,
    designation,
    mobile:         mobile.trim(),
    email:          email?.trim()   || undefined,
    gender,
    dateOfBirth,
    dateOfJoining,
    address:        address?.trim() || undefined,
    employmentType,
    monthlySalary:  monthlySalary ? Number(monthlySalary) : 0,
    bankName:       bankName?.trim()      || undefined,
    accountNumber:  accountNumber?.trim() || undefined,
    ifscCode:       ifscCode?.trim()      || undefined,
    photo,
  });

  await member.populate(STAFF_POPULATE);

  return res.status(201).json(new apiResponse(201, member, "Staff created successfully"));
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
export const updateStaff = asyncHandler(async (req, res) => {
  const Staff = getStaffModel(req.db);

  if (req.body.mobile && !MOBILE_REGEX.test(req.body.mobile)) {
    return apiError(res, 400, false, "Enter valid 10-digit mobile number");
  }

  if (req.body.monthlySalary !== undefined) {
    req.body.monthlySalary = Number(req.body.monthlySalary) || 0;
  }

  const member = await Staff.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  ).populate(STAFF_POPULATE);

  if (!member) return apiError(res, 404, false, "Staff not found");
  return res.status(200).json(new apiResponse(200, member, "Staff updated successfully"));
});

// ── DELETE ────────────────────────────────────────────────────────────────────
export const deleteStaff = asyncHandler(async (req, res) => {
  const Staff  = getStaffModel(req.db);
  const member = await Staff.findByIdAndDelete(req.params.id);
  if (!member) return apiError(res, 404, false, "Staff not found");
  return res.status(200).json(new apiResponse(200, null, "Staff deleted successfully"));
});
