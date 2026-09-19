import User from "../models/user.modal.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logFromReq } from "../utils/logActivity.js";

/* ─────────────────────────────────────────────────────────────
   GET /api/admins/me  — Current logged-in admin's profile
─────────────────────────────────────────────────────────────── */
export const getMyProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  if (!user) return res.status(404).json(new apiResponse(404, null, "User not found"));
  return res.status(200).json(new apiResponse(200, user, "Profile fetched ✅"));
});

/* ─────────────────────────────────────────────────────────────
   PUT /api/admins/me  — Update current admin's profile
   Body: { name, phone, gender, profilePic }
─────────────────────────────────────────────────────────────── */
export const updateMyProfile = asyncHandler(async (req, res) => {
  // Only safe fields — no role/email/password change here
  const { name, phone, gender, profilePic } = req.body;

  const updated = await User.findByIdAndUpdate(
    req.user._id,
    { name, phone, gender, profilePic },
    { new: true, runValidators: true }
  ).select("-password");

  if (!updated) return res.status(404).json(new apiResponse(404, null, "User not found"));

  logFromReq(req, {
    action: "Updated Profile",
    target: updated.name,
    module: "Users",
    type:   "Update",
  });

  return res.status(200).json(new apiResponse(200, updated, "Profile updated ✅"));
});

/* ─────────────────────────────────────────────────────────────
   PUT /api/admins/me/change-password
   Body: { currentPassword, newPassword }
─────────────────────────────────────────────────────────────── */
export const changeMyPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json(new apiResponse(400, null, "currentPassword and newPassword are required"));
  }

  if (newPassword.length < 6) {
    return res.status(400).json(new apiResponse(400, null, "New password must be at least 6 characters"));
  }

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json(new apiResponse(404, null, "User not found"));

  // Plain-text comparison (matching existing pattern in codebase)
  if (user.password !== currentPassword) {
    return res.status(400).json(new apiResponse(400, null, "Current password is incorrect"));
  }

  user.password = newPassword;
  await user.save();

  logFromReq(req, {
    action: "Changed Password",
    target: "Profile",
    module: "Auth",
    type:   "Update",
  });

  return res.status(200).json(new apiResponse(200, null, "Password changed successfully ✅"));
});

// ── Helper: Generate Password ─────────────────────────────────────────────────
const generatePassword = (name = "Admin") => {
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${name.replace(/\s+/g, "")}@${random}`;
};

/* ─────────────────────────────────────────────────────────────
   POST /api/admins/login  (also aliased as /api/auth/superadmin/login)
   Body: { email, password }  OR  { userId, password }
   Returns JWT token for SuperAdmin / Admin users
───────────────────────────────────────────────────────────── */
export const superAdminLogin = asyncHandler(async (req, res) => {
  const { email, userId, password } = req.body;

  if ((!email && !userId) || !password) {
    return res.status(400).json(new apiResponse(400, null, "Credentials are required"));
  }

  // Support both email and userId login
  const query = email ? { email: email.toLowerCase().trim() } : { userId: userId.trim() };
  const user = await User.findOne(query);

  if (!user) {
    return res.status(401).json(new apiResponse(401, null, "Invalid credentials"));
  }

  if (user.password !== password) {
    return res.status(401).json(new apiResponse(401, null, "Invalid credentials"));
  }

  if (!user.isActive) {
    return res.status(403).json(new apiResponse(403, null, "Account is inactive. Contact support."));
  }

  const token = user.generateAuthToken();

  user.lastLogin = new Date();
  await user.save();

  // Log the login activity
  logFromReq(req, {
    user:   user.name,
    userId: user._id,
    action: "Login",
    target: "System",
    module: "Auth",
    type:   "Login",
  });

  return res.status(200).json(
    new apiResponse(200, {
      token,
      user: {
        _id:    user._id,
        userId: user.userId,
        name:   user.name,
        email:  user.email,
        role:   user.role,
        phone:  user.phone,
      },
    }, "Login successful ✅")
  );
});

/* ─────────────────────────────────────────────────────────────
   POST /api/admins/create
───────────────────────────────────────────────────────────── */
export const createAdmin = asyncHandler(async (req, res) => {
  try {
    let { name, email, phone, gender, role } = req.body;

    if (!name) return res.status(400).json(new apiResponse(400, null, "Name is required"));
    if (!email) return res.status(400).json(new apiResponse(400, null, "Email is required"));

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json(new apiResponse(400, null, "Invalid email format"));
    }

    const emailExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (emailExists) {
      return res.status(400).json(new apiResponse(400, null, "Email already exists"));
    }

    const allowedRoles = ["Admin", "SuperAdmin"];
    const finalRole = allowedRoles.includes(role) ? role : "Admin";
    const prefix = finalRole === "SuperAdmin" ? "SADM" : "ADMIN";

    let userId = `${prefix}_${Math.floor(1000 + Math.random() * 9000)}`;
    let exists = await User.findOne({ userId });
    while (exists) {
      userId = `${prefix}_${Math.floor(1000 + Math.random() * 9000)}`;
      exists = await User.findOne({ userId });
    }

    const plainPassword = generatePassword(name);

    const admin = await User.create({
      name,
      email: email.toLowerCase().trim(),
      phone,
      gender,
      role: finalRole,
      userId,
      password: plainPassword,
      isActive: true,
    });

    // Log the creation
    logFromReq(req, {
      action: `Created Admin: ${admin.name}`,
      target: admin.name,
      module: "Users",
      type:   "Create",
    });

    return res.status(201).json(
      new apiResponse(201, {
        admin: { ...admin.toObject(), password: undefined },
        credentials: { userId, password: plainPassword },
      }, "Admin created successfully ✅")
    );
  } catch (error) {
    console.error("CREATE ADMIN ERROR:", error);
    return res.status(500).json(new apiResponse(500, null, error.message || "Something went wrong"));
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/admins  — Paginated list with search & filters
───────────────────────────────────────────────────────────── */
export const getAdmins = asyncHandler(async (req, res) => {
  let { page = 1, limit = 10, search = "", role, isActive } = req.query;

  page  = parseInt(page);
  limit = parseInt(limit);

  const query = { role: { $in: ["Admin", "SuperAdmin"] } };

  if (search) {
    query.$or = [
      { name:  { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { userId:{ $regex: search, $options: "i" } },
    ];
  }

  if (role && ["Admin", "SuperAdmin"].includes(role)) {
    query.role = role;
  }

  if (isActive !== undefined) {
    query.isActive = isActive === "true";
  }

  const total  = await User.countDocuments(query);
  const admins = await User.find(query)
    .select("-password")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return res.status(200).json(
    new apiResponse(200, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: admins,
    }, "Admins fetched successfully ✅")
  );
});

/* ─────────────────────────────────────────────────────────────
   GET /api/admins/:id
───────────────────────────────────────────────────────────── */
export const getAdminById = asyncHandler(async (req, res) => {
  const admin = await User.findOne({
    _id:  req.params.id,
    role: { $in: ["Admin", "SuperAdmin"] },
  }).select("-password");

  if (!admin) return res.status(404).json(new apiResponse(404, null, "Admin not found"));

  return res.status(200).json(new apiResponse(200, admin, "Admin fetched successfully ✅"));
});

/* ─────────────────────────────────────────────────────────────
   PUT /api/admins/:id
───────────────────────────────────────────────────────────── */
export const updateAdmin = asyncHandler(async (req, res) => {
  // Don't allow password or role change through this route
  const { password, ...safeBody } = req.body;

  const updated = await User.findOneAndUpdate(
    { _id: req.params.id, role: { $in: ["Admin", "SuperAdmin"] } },
    safeBody,
    { new: true, runValidators: true }
  ).select("-password");

  if (!updated) return res.status(404).json(new apiResponse(404, null, "Admin not found"));

  logFromReq(req, {
    action: `Updated Admin: ${updated.name}`,
    target: updated.name,
    module: "Users",
    type:   "Update",
  });

  return res.status(200).json(new apiResponse(200, updated, "Admin updated successfully ✅"));
});

/* ─────────────────────────────────────────────────────────────
   DELETE /api/admins/:id
───────────────────────────────────────────────────────────── */
export const deleteAdmin = asyncHandler(async (req, res) => {
  const deleted = await User.findOneAndDelete({
    _id:  req.params.id,
    role: { $in: ["Admin", "SuperAdmin"] },
  });

  if (!deleted) return res.status(404).json(new apiResponse(404, null, "Admin not found"));

  logFromReq(req, {
    action: `Deleted Admin: ${deleted.name}`,
    target: deleted.name,
    module: "Users",
    type:   "Delete",
  });

  return res.status(200).json(new apiResponse(200, null, "Admin deleted successfully ✅"));
});

/* ─────────────────────────────────────────────────────────────
   PATCH /api/admins/:id/toggle  — Toggle active/inactive
───────────────────────────────────────────────────────────── */
export const toggleAdminStatus = asyncHandler(async (req, res) => {
  const admin = await User.findOne({
    _id:  req.params.id,
    role: { $in: ["Admin", "SuperAdmin"] },
  });

  if (!admin) return res.status(404).json(new apiResponse(404, null, "Admin not found"));

  admin.isActive = !admin.isActive;
  await admin.save();

  return res.status(200).json(
    new apiResponse(200, { _id: admin._id, isActive: admin.isActive },
      `Admin is now ${admin.isActive ? "ACTIVE ✅" : "INACTIVE ❌"}`)
  );
});
