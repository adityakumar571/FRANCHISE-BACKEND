import { getUserModel }  from "../../../models/tenant/user.model.js";
import { apiResponse }    from "../../../utils/apiResponse.js";
import { asyncHandler }   from "../../../utils/asyncHandler.js";
import { apiError }       from "../../../utils/apiError.js";

const HR_ROLES = ["HRManager", "HRStaff"];

// ── CREATE HR USER ───────────────────────────────────────────
// POST /api/hr/users
// Only Admin / SuperAdmin can create HR users
export const createHRUser = asyncHandler(async (req, res) => {
  const User = getUserModel(req.db);
  const { name, userId, password, role, email, phone } = req.body;

  if (!name?.trim())     return apiError(res, 400, false, "Name is required");
  if (!userId?.trim())   return apiError(res, 400, false, "User ID is required");
  if (!password?.trim()) return apiError(res, 400, false, "Password is required");
  if (!role)             return apiError(res, 400, false, "Role is required");

  if (!HR_ROLES.includes(role))
    return apiError(res, 400, false, `Role must be one of: ${HR_ROLES.join(", ")}`);

  if (password.length < 6)
    return apiError(res, 400, false, "Password must be at least 6 characters");

  // Check duplicate userId
  const exists = await User.findOne({ userId: userId.trim() });
  if (exists) return apiError(res, 409, false, "User ID already taken");

  const user = await User.create({
    name:     name.trim(),
    userId:   userId.trim(),
    password,
    role,
    email:    email?.trim() || undefined,
    phone:    phone?.trim() || undefined,
    isNew:    false,
    isActive: true,
  });

  return res.status(201).json(
    new apiResponse(201, {
      _id:    user._id,
      name:   user.name,
      userId: user.userId,
      role:   user.role,
      email:  user.email,
    }, "HR user created successfully")
  );
});

// ── GET ALL HR USERS ─────────────────────────────────────────
// GET /api/hr/users?page=1&limit=20&role=&search=
export const getHRUsers = asyncHandler(async (req, res) => {
  const User = getUserModel(req.db);
  const { page = 1, limit = 20, role, search } = req.query;

  const filter = { role: { $in: HR_ROLES } };
  if (role && HR_ROLES.includes(role)) filter.role = role;
  if (search?.trim()) {
    filter.$or = [
      { name:   { $regex: search.trim(), $options: "i" } },
      { userId: { $regex: search.trim(), $options: "i" } },
      { email:  { $regex: search.trim(), $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("-password -otp -otpExpiration")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    User.countDocuments(filter),
  ]);

  return res.status(200).json(
    new apiResponse(200, { users, total, page: Number(page), limit: Number(limit) }, "HR users fetched")
  );
});

// ── UPDATE HR USER ───────────────────────────────────────────
// PUT /api/hr/users/:id
export const updateHRUser = asyncHandler(async (req, res) => {
  const User = getUserModel(req.db);
  const { name, role, email, phone, isActive, password } = req.body;

  if (role && !HR_ROLES.includes(role))
    return apiError(res, 400, false, `Role must be one of: ${HR_ROLES.join(", ")}`);

  if (password && password.length < 6)
    return apiError(res, 400, false, "Password must be at least 6 characters");

  const updateData = {
    ...(name     && { name: name.trim() }),
    ...(role     && { role }),
    ...(email    && { email: email.trim() }),
    ...(phone    && { phone: phone.trim() }),
    ...(password && { password }),
    ...(isActive !== undefined && { isActive }),
  };

  const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true })
    .select("-password -otp -otpExpiration");

  if (!user) return apiError(res, 404, false, "HR user not found");
  return res.status(200).json(new apiResponse(200, user, "HR user updated successfully"));
});

// ── DELETE HR USER ───────────────────────────────────────────
// DELETE /api/hr/users/:id
export const deleteHRUser = asyncHandler(async (req, res) => {
  const User = getUserModel(req.db);

  const user = await User.findOneAndDelete({ _id: req.params.id, role: { $in: HR_ROLES } });
  if (!user) return apiError(res, 404, false, "HR user not found");

  return res.status(200).json(new apiResponse(200, null, "HR user deleted successfully"));
});

// ── HR LOGIN ─────────────────────────────────────────────────
// POST /api/hr/login  (public — no JWT needed)
export const hrLogin = asyncHandler(async (req, res) => {
  // req.db may be undefined if tenant not resolved — give clear error
  if (!req.db) {
    return res.status(400).json({
      status: false,
      message: "Tenant not found. Make sure 'x-tenant-id' header is set correctly (e.g. x-tenant-id: taha)",
    });
  }

  const User = getUserModel(req.db);
  const { userId, password } = req.body;

  if (!userId?.trim() || !password?.trim())
    return apiError(res, 400, false, "User ID and password are required");

  const user = await User.findOne({ userId: userId.trim() });

  if (!user)
    return apiError(res, 404, false, "User not found");

  if (!HR_ROLES.includes(user.role))
    return apiError(res, 403, false, "Access denied. Not an HR account");

  if (!user.isActive)
    return apiError(res, 403, false, "Your account is deactivated. Contact administrator");

  if (user.password !== password)
    return apiError(res, 401, false, "Invalid password");

  const token = user.generateAuthToken();

  return res.status(200).json(
    new apiResponse(200, {
      _id:       user._id,
      name:      user.name,
      userId:    user.userId,
      role:      user.role,
      email:     user.email,
      authToken: token,
    }, "Login successful")
  );
});
