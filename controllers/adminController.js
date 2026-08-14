import { getUserModel } from "../models/tenant/user.model.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";


// 🔹 Helper: Generate Password
const generatePassword = (name = "Admin") => {
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${name}${random}`;
};

export const createAdmin = asyncHandler(async (req, res) => {
  try {
    const User = getUserModel(req.db);

    let { name, email, phone, gender, role } = req.body;

    if (!name) {
      return res.status(400).json(new apiResponse(400, null, "Name is required"));
    }

    if (!email) {
      return res.status(400).json(new apiResponse(400, null, "Email is required"));
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json(new apiResponse(400, null, "Invalid email format"));
    }

    const emailExists = await User.findOne({ email });
    if (emailExists) {
      return res.status(400).json(new apiResponse(400, null, "Email already exists"));
    }

    const allowedRoles = ["Admin", "Accountant"];
    const finalRole = allowedRoles.includes(role) ? role : "Admin";
    const prefix = finalRole === "Accountant" ? "ACC" : "ADMIN";

    let userId = `${prefix}_${Math.floor(1000 + Math.random() * 9000)}`;
    let exists = await User.findOne({ userId });

    while (exists) {
      userId = `${prefix}_${Math.floor(1000 + Math.random() * 9000)}`;
      exists = await User.findOne({ userId });
    }

    const plainPassword = generatePassword(name);

    const admin = await User.create({
      name,
      email,
      phone,
      gender,
      role: finalRole,
      userId,
      password: plainPassword,
    });

    return res.status(201).json(
      new apiResponse(
        201,
        {
          admin,
          credentials: {
            userId,
            password: plainPassword,
          },
        },
        "Admin created successfully "
      )
    );

  } catch (error) {
    console.error("CREATE ADMIN ERROR:", error);

    return res.status(500).json(
      new apiResponse(500, null, error.message || "Something went wrong")
    );
  }
});

export const getAdmins = asyncHandler(async (req, res) => {
  const User = getUserModel(req.db); // 🔥 FIX

  let { page = 1, limit = 10, search = "", role, isActive } = req.query;

  page = parseInt(page);
  limit = parseInt(limit);

  let query = {
    role: { $in: ["Admin", "SuperAdmin", "Accountant"] },
  };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  if (role) {
    query.role = role;
  }

  if (isActive !== undefined) {
    query.isActive = isActive === "true";
  }

  const total = await User.countDocuments(query);

  const admins = await User.find(query)

    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return res.status(200).json(
    new apiResponse(
      200,
      {
        total,
        page,
        totalPages: Math.ceil(total / limit),
        data: admins,
      },
      "Admins fetched successfully "
    )
  );
});

export const getAdminById = asyncHandler(async (req, res) => {
  const User = getUserModel(req.db); // 🔥 FIX

  const admin = await User.findOne({
    _id: req.params.id,
    role: { $in: ["Admin", "SuperAdmin"] },
  });

  if (!admin) {
    return res.status(404).json(new apiResponse(404, null, "Admin not found"));
  }

  return res.status(200).json(new apiResponse(200, admin, "Admin fetched successfully"));
});

export const updateAdmin = asyncHandler(async (req, res) => {
  const User = getUserModel(req.db); // 🔥 FIX

  const updated = await User.findOneAndUpdate(
    {
      _id: req.params.id,
      role: { $in: ["Admin", "SuperAdmin"] },
    },
    req.body,
    { new: true }
  ).select("-password");

  if (!updated) {
    return res.status(404).json(new apiResponse(404, null, "Admin not found"));
  }

  return res.status(200).json(
    new apiResponse(200, updated, "Admin updated successfully ")
  );
});

export const deleteAdmin = asyncHandler(async (req, res) => {
  const User = getUserModel(req.db); // 🔥 FIX

  const deleted = await User.findOneAndDelete({
    _id: req.params.id,
    role: { $in: ["Admin", "SuperAdmin"] },
  });

  if (!deleted) {
    return res.status(404).json(new apiResponse(404, null, "Admin not found"));
  }

  return res.status(200).json(
    new apiResponse(200, null, "Admin deleted successfully ")
  );
});