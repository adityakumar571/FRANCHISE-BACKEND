import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { getUserModel } from "../../../models/tenant/user.model.js";
import { getSessionModel } from "../../../models/tenant/master/Session.model.js";
import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";
import { getTeacherModel } from "../../../models/tenant/teacher/Teacher.model.js";
import { sendEmail } from "../../../utils/sendEmail.js";

export const tenantLogin = asyncHandler(async (req, res) => {
  const { userId, password } = req.body;

  if (!userId || !password) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "userId and password required"));
  }

  const User = getUserModel(req.db);

  const user = await User.findOne({ userId });

  if (!user) {
    return res.status(404).json(new apiResponse(404, null, "User not found"));
  }

  let isMatch = false;

  if (user.comparePassword) {
    isMatch = await user.comparePassword(password);
  } else {
    isMatch = user.password === password;
  }

  if (!isMatch) {
    return res
      .status(401)
      .json(new apiResponse(401, null, "Invalid credentials"));
  }

  const token = user.generateAuthToken();

  return res.status(200).json(
    new apiResponse(
      200,
      {
        user,
        token,
        tenant: req.tenant.subdomain,
      },
      "Tenant login successful 🚀",
    ),
  );
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
    // 🔹 Find user by userId
    const existingUser = await User.findOne({ userId });

    if (!existingUser) {
      return res.status(400).json(new apiResponse(400, null, "User not found"));
    }

    if (existingUser.activeStatus === false) {
      return res
        .status(403)
        .json(new apiResponse(403, null, "User is blocked and cannot login"));
    }

    // 🔹 Check password exists
    if (!existingUser.password) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Password is not set for this user"));
    }

    // 🔹 Plain-text password comparison (as per your logic)
    if (existingUser.password !== password) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid password"));
    }

    // 🔹 Generate JWT
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

  if (!userId) {
    return res.status(401).json(new apiResponse(401, null, "Unauthorized"));
  }

  const { fcmToken } = req.body;

  if (!fcmToken) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "fcmToken is required"));
  }

  const User = getUserModel(req.db);

  const user = await User.findByIdAndUpdate(
    userId,
    { fcmToken },
    { new: true },
  ).select("-password -otp -otpExpiration");

  if (!user) {
    return res.status(404).json(new apiResponse(404, null, "User not found"));
  }

  return res
    .status(200)
    .json(
      new apiResponse(
        200,
        { fcmToken: user.fcmToken },
        "FCM token updated successfully",
      ),
    );
});

export const getTenentProfile = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    return res.status(401).json(new apiResponse(401, null, "Unauthorized"));
  }

  const User = getUserModel(req.db);
  const Session = getSessionModel(req.db);
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const Teacher = getTeacherModel(req.db);

  const user = await User.findById(userId).select(
    "-password -otp -otpExpiration",
  );

  if (!user) {
    return res.status(404).json(new apiResponse(404, null, "User not found"));
  }

  let profile = null;
  let history = [];
  let totalSessions = 0;

  const currentSession = await Session.findOne({
    isCurrent: true,
    isActive: true,
  });

  if (!currentSession) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Current session not found"));
  }

  if (user.role === "Student") {
    profile = await StudentEnrolment.findOne({
      userId,
      session: currentSession._id,
    })
      .populate("currentClass", "name")
      .populate("currentSection", "name")
      .populate("session", "sessionName")
     .populate("routeId", "routeName")
      .populate("stopId", "stopName")
    history = await StudentEnrolment.find({
      userId,
      session: { $ne: currentSession._id },
    })
      .populate("currentClass", "name")
      .populate("currentSection", "name")
      .populate("session", "sessionName")
    
      .sort({ admissionDate: -1, createdAt: -1 });

    totalSessions = history.length + (profile ? 1 : 0);
  } else if (user.role === "Teacher") {
    profile = await Teacher.findOne({ userId })
      .populate("userId", "phone email name gender")
      .populate("classesAssigned.classId", "name")
      .populate("classesAssigned.sectionId", "name")
      .populate("classesAssigned.subjectId", "name")
      .populate({
        path: "classesAssigned.stream",
        select: "name",
      });

    history = [];
    totalSessions = profile ? 1 : 0;
  } else if (["Admin", "SuperAdmin", "Accountant"].includes(user.role)) {
    profile = null;
    history = [];
    totalSessions = 0;
  }

  return res.status(200).json(
    new apiResponse(
      200,
      {
        role: user.role,
        user,
        profile,
        history,
        currentSession: currentSession.sessionName,
        totalSessions,
      },
      "Profile fetched successfully 🚀",
    ),
  );
});

export const changePassword = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  const { oldPassword, newPassword } = req.body;

  // ===============================
  // VALIDATION
  // ===============================
  if (!oldPassword || !newPassword) {
    return res
      .status(400)
      .json(
        new apiResponse(
          400,
          null,
          "Old password and new password are required",
        ),
      );
  }

  // ===============================
  // PASSWORD LENGTH
  // ===============================
  if (newPassword.length < 6) {
    return res
      .status(400)
      .json(
        new apiResponse(400, null, "Password must be at least 6 characters"),
      );
  }

  // ===============================
  // SAME PASSWORD CHECK
  // ===============================
  if (oldPassword === newPassword) {
    return res
      .status(400)
      .json(
        new apiResponse(
          400,
          null,
          "New password cannot be same as old password",
        ),
      );
  }

  const User = getUserModel(req.db);

  const user = await User.findById(userId);

  // ===============================
  // USER CHECK
  // ===============================
  if (!user) {
    return res.status(404).json(new apiResponse(404, null, "User not found"));
  }

  // ===============================
  // OLD PASSWORD CHECK
  // ===============================
  if (user.password !== oldPassword) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Old password is incorrect"));
  }

  // ===============================
  // UPDATE PASSWORD
  // ===============================
  user.password = newPassword;

  await user.save();

  return res
    .status(200)
    .json(new apiResponse(200, null, "Password changed successfully"));
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  // ===============================
  // VALIDATION
  // ===============================
  if (!userId) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "User ID is required"));
  }

  const User = getUserModel(req.db);
  const StudentEnrolment = getStudentEnrolmentModel(req.db);

  // ===============================
  // SEARCH USER
  // ===============================
  let user = await User.findOne({ userId });

  let email = "";
  let isStudent = false;

  console.log("USER =====>", user);

  // ===============================
  // IF USER FOUND
  // ===============================
  if (user) {
    // Admin / Teacher / User email
    email = user?.email || "";

    // ===============================
    // IF EMAIL NOT FOUND IN USER
    // ===============================
    if (!email) {
      const studentData = await StudentEnrolment.findOne({
        studentId: userId,
      });

      console.log("STUDENT DATA =====>", studentData);

      if (studentData) {
        email =
          studentData?.address?.present?.Email ||
          studentData?.address?.present?.email ||
          studentData?.email ||
          "";

        isStudent = true;
      }
    }
  } else {
    // ===============================
    // SEARCH DIRECTLY IN STUDENT
    // ===============================
    user = await StudentEnrolment.findOne({
      studentId: userId,
    });

    isStudent = true;

    console.log("DIRECT STUDENT =====>", user);

    if (!user) {
      return res.status(404).json(new apiResponse(404, null, "User not found"));
    }

    email =
      user?.address?.present?.Email ||
      user?.address?.present?.email ||
      user?.email ||
      "";
  }

  console.log("FINAL EMAIL =====>", email);

  // ===============================
  // EMAIL CHECK
  // ===============================
  if (!email) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "User email not found"));
  }

  // ===============================
  // GENERATE OTP
  // ===============================
  const otp = Math.floor(100000 + Math.random() * 900000);

  user.otp = otp;

  user.otpExpiration = Date.now() + 5 * 60 * 1000;

  await user.save();

  // ===============================
  // SEND EMAIL
  // ===============================
  await sendEmail(email, "Password Reset OTP", otp);

  return res.status(200).json(
    new apiResponse(
      200,
      {
        email,
        isStudent,
      },
      "OTP sent successfully to email",
    ),
  );
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { userId, otp, newPassword } = req.body;

  // ===============================
  // VALIDATION
  // ===============================
  if (!userId || !otp || !newPassword) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "All fields are required"));
  }

  // ===============================
  // PASSWORD VALIDATION
  // ===============================
  if (newPassword.length < 6) {
    return res
      .status(400)
      .json(
        new apiResponse(400, null, "Password must be at least 6 characters"),
      );
  }

  const User = getUserModel(req.db);
  const StudentEnrolment = getStudentEnrolmentModel(req.db);

  // ===============================
  // SEARCH USER
  // ===============================
  let user = await User.findOne({ userId });

  let isStudent = false;

  // ===============================
  // IF USER NOT FOUND
  // ===============================
  if (!user) {
    user = await StudentEnrolment.findOne({
      studentId: userId,
    });

    isStudent = true;

    if (!user) {
      return res.status(404).json(new apiResponse(404, null, "User not found"));
    }
  }

  // ===============================
  // OTP CHECK
  // ===============================
  if (!user.otp || !user.otpExpiration) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "OTP not generated"));
  }

  // ===============================
  // OTP VERIFY
  // ===============================
  if (
    String(user.otp) !== String(otp) ||
    new Date(user.otpExpiration).getTime() < Date.now()
  ) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid or expired OTP"));
  }

  // ===============================
  // SAME PASSWORD CHECK
  // ===============================
  if (user.password === newPassword) {
    return res
      .status(400)
      .json(
        new apiResponse(
          400,
          null,
          "New password cannot be same as old password",
        ),
      );
  }

  // ===============================
  // UPDATE PASSWORD
  // ===============================
  user.password = newPassword;

  // ===============================
  // CLEAR OTP
  // ===============================
  user.otp = null;
  user.otpExpiration = null;

  await user.save();

  return res.status(200).json(
    new apiResponse(
      200,
      {
        isStudent,
      },
      "Password reset successful",
    ),
  );
});
