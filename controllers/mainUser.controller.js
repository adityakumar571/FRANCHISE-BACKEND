import User from "../models/user.modal.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";

export const createUser = asyncHandler(async (req, res) => {
    let {
        phone,
        userId,
        name,
        gender,
        role,
        password,
    } = req.body;

    // ===============================
    // 🔥 AUTO GENERATE USER ID
    // ===============================
    if (!userId) {
        const random = Math.floor(1000 + Math.random() * 9000);
        userId = `ADMIN_${random}`;
    }

    // ===============================
    // 🔥 CHECK UNIQUE USER ID
    // ===============================
    let exists = await User.findOne({ userId });

    while (exists) {
        const random = Math.floor(1000 + Math.random() * 9000);
        userId = `ADMIN_${random}`;
        exists = await User.findOne({ userId });
    }

    // ===============================
    // 🔐 AUTO GENERATE PASSWORD
    // ===============================
    let plainPassword = password;

    if (!password) {
        plainPassword = Math.random().toString(36).slice(-5);
    }

    // ===============================
    // ⚠️ (IMPORTANT) HASH PASSWORD
    // ===============================
    // 👉 strongly recommended
    // const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // ===============================
    // ✅ CREATE USER
    // ===============================
    const user = await User.create({
        phone,
        userId,
        name,
        gender,
        role: role || "Admin",
        password: plainPassword, // 👉 replace with hashedPassword in production
    });

    // ===============================
    // 📤 RESPONSE
    // ===============================
    return res.status(201).json(
        new apiResponse(
            201,
            {
                user,
                credentials: {
                    userId,
                    password: plainPassword, // 🔥 only return once
                },
            },
            "User created 🚀"
        )
    );
});

export const loginUser = asyncHandler(async (req, res) => {
    const { userId, password, email } = req.body;

    // ===============================
    // ❗ VALIDATION
    // ===============================
    if ((!userId && !email) || !password) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "userId/email and password required"));
    }

    // ===============================
    // 🔍 FIND USER — by email or userId
    // ===============================
    const query = email ? { email: email.toLowerCase().trim() } : { userId }
    console.log("🔍 LOGIN ATTEMPT —", JSON.stringify(query), "| password:", JSON.stringify(password));
    const user = await User.findOne(query).populate("tenantId", "schoolName logo subdomain");
    console.log("🔍 USER FOUND:", user ? `YES — stored password: ${JSON.stringify(user.password)}` : "NO");

    if (!user) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "User not found"));
    }

    if (user.isActive === false) {
        return res
            .status(403)
            .json(new apiResponse(403, null, "Account is deactivated"));
    }

    // ===============================
    // 🔐 PASSWORD CHECK
    // ===============================
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

    // ===============================
    // 🎟️ TOKEN GENERATE
    // ===============================
    const token = user.generateAuthToken();
    user.lastLogin = new Date();
    await user.save();

    // ===============================
    // 📤 RESPONSE
    // ===============================
    return res.status(200).json(
        new apiResponse(
            200,
            {
                user,
                token,
                schoolName: user.tenantId?.schoolName || null,
            },
            "Login successful 🚀"
        )
    );
});

export const getProfile = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        return res
            .status(401)
            .json(new apiResponse(401, null, "Unauthorized"));
    }

    const user = await User.findById(userId)
        .select("-password -otp -otpExpiration")
        .populate("tenantId", "schoolName logo subdomain");

    if (!user) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "User not found"));
    }

    return res.status(200).json(
        new apiResponse(
            200,
            {
                user,
            },
            "Profile fetched successfully 🚀"
        )
    );
});