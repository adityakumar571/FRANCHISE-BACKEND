import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { getUserModel } from "../../../models/tenant/user.model.js";

export const tenantLogin = asyncHandler(async (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) {
    return res.status(400).json(new apiResponse(400, null, "userId and password required"));
  }
  const User = getUserModel(req.db);
  const user = await User.findOne({ userId });
  if (!user) return res.status(404).json(new apiResponse(404, null, "User not found"));
  if (user.password !== password) return res.status(401).json(new apiResponse(401, null, "Invalid credentials"));
  const token = user.generateAuthToken();
  user.lastLogin = new Date();
  await user.save();
  return res.status(200).json(new apiResponse(200, { user, token, tenant: req.tenant.subdomain }, "Login successful 🚀"));
});

export const loginWithPassword = asyncHandler(async (req, res) => {
  const { userId, password } = req.body;

  if (!userId || !password) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "UserId and password are required"));
  }

  const User = getUserModel(req.db);

  try {
    const existingUser = await User.findOne({ userId });

    if (!existingUser) {
      return res.status(400).json(new apiResponse(400, null, "User not found"));
    }

    if (existingUser.activeStatus === false) {
      return res
        .status(403)
        .json(new apiResponse(403, null, "User is blocked and cannot login"));
    }

    if (!existingUser.password) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Password is not set for this user"));
    }

    if (existingUser.password !== password) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid password"));
    }

    const token = existingUser.generateAuthToken();

    const userData = {
      _id: existingUser._id,
      userId: existingUser.userId,
      phone: existingUser.phone,
      role: existingUser.role,
      name: existingUser.name,
      email: existingUser.email,
      gender: existingUser.gender,
      isNew: existingUser.isNew,
      createdAt: existingUser.createdAt,
      updatedAt: existingUser.updatedAt,
      authToken: token,
    };

    return res
      .status(200)
      .json(new apiResponse(200, userData, "Login successful"));
  } catch (error) {
    return res
      .status(500)
      .json(new apiResponse(500, null, `Error: ${error.message}`));
  }
});

export const updateFcmToken = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  const { fcmToken } = req.body;
  if (!fcmToken) return res.status(400).json(new apiResponse(400, null, "fcmToken required"));
  const User = getUserModel(req.db);
  const user = await User.findByIdAndUpdate(userId, { fcmToken }, { new: true }).select("-password");
  if (!user) return res.status(404).json(new apiResponse(404, null, "User not found"));
  return res.status(200).json(new apiResponse(200, { fcmToken: user.fcmToken }, "FCM token updated"));
});

export const getTenentProfile = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  const User = getUserModel(req.db);
  const user = await User.findById(userId).select("-password -otp -otpExpiration");
  if (!user) return res.status(404).json(new apiResponse(404, null, "User not found"));
  return res.status(200).json(new apiResponse(200, { user }, "Profile fetched"));
});

export const changePassword = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json(new apiResponse(400, null, "Both passwords required"));
  if (newPassword.length < 6) return res.status(400).json(new apiResponse(400, null, "Min 6 characters"));
  const User = getUserModel(req.db);
  const user = await User.findById(userId);
  if (!user) return res.status(404).json(new apiResponse(404, null, "User not found"));
  if (user.password !== oldPassword) return res.status(400).json(new apiResponse(400, null, "Old password incorrect"));
  user.password = newPassword;
  await user.save();
  return res.status(200).json(new apiResponse(200, null, "Password changed successfully"));
});
