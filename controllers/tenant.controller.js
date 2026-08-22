import Tenant from "../models/tenant.model.js";
import TenantSubscription from "../models/TenantSubscription.modal.js";
import FreeTrialPackage from "../models/FreeTrialPackage.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { getTenantDB } from "../utils/dbManager.js";
import { getUserModel } from "../models/tenant/user.model.js";
import { getSessionModel } from "../models/tenant/master/Session.model.js";
import mongoose from "mongoose";
import { getTeacherModel } from "../models/tenant/teacher/Teacher.model.js";
import { getSectionModel } from "../models/tenant/master/Section.modal.js";
import { getStudentEnrolmentModel } from "../models/tenant/student/StudentEnrolment.model.js";
import { getClassModel } from "../models/tenant/master/Class.modal.js";
import { setupDefaultMasters }
    from "../utils/setupDefaultMasters.js";
import { sendSchoolCredentials }
    from "../utils/sendSchoolCredentials.js";
const getCurrentSession = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0 = Jan, 3 = April

    if (month >= 3) {
        return `${year}-${year + 1}`;
    } else {
        return `${year - 1}-${year}`;
    }
};

export const registerTenant = asyncHandler(async (req, res) => {
    const {
        schoolName,
        subdomain,
        schoolCode,
        schoolEmail,
        estNo,
        schoolContactAlt,
        schoolAddress,
        schoolContact,
        logo,
        dbUri,
        description,
        razorpayKey,
        razorpaySecret,
        affiliationLine,
        schoolMedium,
        msmeRegNo,
        isoRegNo,
        regInfo,
        nitiAayog,
        managedBy,
        // ── Franchise-specific fields ──
        franchiseCode,
        businessType,
        gstNo,
        franchiseAdminName,
        franchiseAdminEmail,
        franchiseAdminPhone,
        addressLine1,
        city,
        state,
        country,
        pincode,
    } = req.body;

    if (!schoolName || !subdomain) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "schoolName & subdomain required"));
    }

    const cleanSubdomain = subdomain.toLowerCase().trim();

    // ===============================
    // 🔥 CHECK SUBDOMAIN UNIQUE
    // ===============================
    const exists = await Tenant.findOne({ subdomain: cleanSubdomain });

    if (exists) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Subdomain already exists"));
    }

    // ===============================
    // 🔥 DB URI GENERATE
    // ===============================
    const finalDbUri = dbUri
        ? dbUri
        : `${process.env.BASE_DB_URI.replace(/\/$/, '')}/${cleanSubdomain}`;

    // ===============================
    // ✅ CREATE TENANT
    // ===============================
    const tenant = await Tenant.create({
        schoolName,
        schoolCode,
        schoolEmail,
        estNo,
        schoolContactAlt,
        schoolAddress,
        schoolContact,
        subdomain: cleanSubdomain,
        dbUri: finalDbUri,
        logo,
        description,
        razorpayKey,
        razorpaySecret,
        affiliationLine,
        schoolMedium,
        msmeRegNo,
        isoRegNo,
        regInfo,
        nitiAayog,
        managedBy,
        // franchise fields
        ...(franchiseCode      && { franchiseCode }),
        ...(businessType       && { businessType }),
        ...(gstNo              && { gstNo }),
        ...(franchiseAdminName  && { franchiseAdminName }),
        ...(franchiseAdminEmail && { franchiseAdminEmail }),
        ...(franchiseAdminPhone && { franchiseAdminPhone }),
        ...(addressLine1       && { addressLine1 }),
        ...(city               && { city }),
        ...(state              && { state }),
        ...(country            && { country }),
        ...(pincode            && { pincode }),
    });

    // ===============================
    // 🏢 CREATE TENANT DB CONNECTION
    // ===============================
    const tenantDB = await getTenantDB(finalDbUri);

    const User = getUserModel(tenantDB);
    const Session = getSessionModel(tenantDB);

    // ===============================
    // 🔐 DEFAULT ADMIN
    // ===============================
    // const adminUserId = `superadmin_${cleanSubdomain}`;
    // const adminPassword = "SuperAdmin@123"; 



    // const admin = await User.create({
    //     userId: adminUserId,
    //     password: adminPassword,
    //     role: "SuperAdmin",
    //     name: "Super Admin",
    //     isNew: false,
    // });
    // ===============================
    // 🔐 SUPER ADMIN
    // ===============================

    const superAdminUserId =
        `superadmin_${cleanSubdomain}`;

    const superAdminPassword =
        Math.random()
            .toString(36)
            .slice(-8);

    await User.create({

        userId:
            superAdminUserId,

        password:
            superAdminPassword,

        role:
            "SuperAdmin",

        name:
            "Super Admin",

        isNew: false,

    });

    // ===============================
    // 🔐 ADMIN
    // ===============================

    const adminUserId =
        `admin_${cleanSubdomain}`;

    const adminPassword =
        Math.random()
            .toString(36)
            .slice(-8);

    await User.create({

        userId:
            adminUserId,

        password:
            adminPassword,

        role:
            "Admin",

        name:
            "School Admin",

        isNew: false,

    });
await sendSchoolCredentials({

    to: schoolEmail,

    schoolName,

    schoolSubdomain: cleanSubdomain,

    superAdminUserId,

    superAdminPassword,

    adminUserId,

    adminPassword,

});

    const currentSession = getCurrentSession();

    const newSession = await Session.create({
        sessionName: currentSession,
        isCurrent: true,
        isActive: true,
    });

    await setupDefaultMasters(
        tenantDB
    );

    // ── Auto-assign Dynamic Free Trial subscription ──────────────
    // Admin panel se configured default active trial package use karo.
    const trialStart = new Date();
    let trialPkg = null;
    try {
        trialPkg = await FreeTrialPackage.findOne({ isDefault: true, isActive: true }).lean();
        if (!trialPkg) {
            trialPkg = await FreeTrialPackage.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
        }
    } catch (_) { /* fallback: no trial */ }

    const TRIAL_STUDENT_LIMIT = trialPkg ? trialPkg.studentLimit : 0;
    const TRIAL_DAYS          = trialPkg ? trialPkg.durationDays : 0;
    const trialEnd            = trialPkg ? (() => {
        const d = new Date();
        d.setDate(d.getDate() + TRIAL_DAYS);
        return d;
    })() : null;

    if (trialPkg && trialEnd) {
        await TenantSubscription.create({
            tenantId:          tenant._id,
            isTrial:           true,
            trialEndDate:      trialEnd,
            status:            "TRIAL",
            paidStatus:        "PAID",
            totalStudentLimit: TRIAL_STUDENT_LIMIT,
            usedStudents:      0,
            totalAmount:       0,
            usedTrialPackageIds: [trialPkg._id],
            currentPlan: {
                name:         trialPkg.name,
                price:        0,
                pricingModel: "FIXED",
                studentLimit: TRIAL_STUDENT_LIMIT,
                billingCycle: "Monthly",
                startDate:    trialStart,
                endDate:      trialEnd,
            },
            history: [{
                type:         "TRIAL_START",
                name:         trialPkg.name,
                price:        0,
                studentLimit: TRIAL_STUDENT_LIMIT,
                startDate:    trialStart,
                endDate:      trialEnd,
            }],
        });
    } else {
        await TenantSubscription.create({
            tenantId:          tenant._id,
            isTrial:           false,
            totalStudentLimit: 0,
            totalAmount:       0,
            status:            "PENDING",
            history:           [],
        });
    }

    // ===============================
    // 📤 RESPONSE
    // ===============================
    return res.status(201).json(
        new apiResponse(
            201,
            {
                tenant,
                adminCredentials: {
                    userId: adminUserId,
                    password: adminPassword,
                },
            },
            "School registered & admin created 🚀"
        )
    );
});

export const getAllTenants = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 10,
        search,
        subdomain,
        isActive,
        isPagination = "true", // 🔥 new
    } = req.query;

    const match = {};

    // 🔹 isActive filter
    if (isActive !== undefined) {
        match.isActive = isActive === "true";
    }

    if (subdomain) {
        match.subdomain = subdomain;
    }

    let pipeline = [{ $match: match }];

    // ================= SEARCH (MULTI WORD) =================
    if (search) {
        const words = search
            .trim()
            .split(/\s+/)
            .map((word) => new RegExp(word, "i"));

        const orConditions = words.flatMap((regex) => [
            { schoolName: { $regex: regex } },
            { subdomain: { $regex: regex } },
        ]);

        pipeline.push({
            $match: {
                $or: orConditions,
            },
        });
    }

    // ================= TOTAL COUNT =================
    const totalArr = await Tenant.aggregate([
        ...pipeline,
        { $count: "count" },
    ]);

    const total = totalArr[0]?.count || 0;

    // ================= SORT =================
    pipeline.push({ $sort: { createdAt: -1 } });

    // ================= PAGINATION =================
    if (isPagination === "true") {
        pipeline.push(
            { $skip: (Number(page) - 1) * Number(limit) },
            { $limit: Number(limit) }
        );
    }

    // ================= SUBSCRIPTION LOOKUP =================
    pipeline.push(
        {
            $lookup: {
                from: "tenantsubscriptions",
                localField: "_id",
                foreignField: "tenantId",
                as: "subscription",
            },
        },
        {
            $addFields: {
                subscription: { $arrayElemAt: ["$subscription", 0] },
            },
        },
        {
            $addFields: {
                planName: "$subscription.currentPlan.name",
                planStatus: "$subscription.status",
                planEndDate: "$subscription.currentPlan.endDate",
                isTrial: "$subscription.isTrial",
                studentLimit: "$subscription.totalStudentLimit",
            },
        }
    );

    // ================= EXECUTE =================
    const tenants = await Tenant.aggregate(pipeline);

    return res.status(200).json(
        new apiResponse(
            200,
            {
                tenants,
                total,
                totalPages:
                    isPagination === "true"
                        ? Math.ceil(total / limit)
                        : 1,
                currentPage:
                    isPagination === "true" ? Number(page) : null,
            },
            "Tenants fetched successfully 🚀"
        )
    );
});



export const getTenantById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Invalid tenant id"));
    }

    const tenant = await Tenant.findById(id);

    if (!tenant) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Tenant not found"));
    }

    // ── Stats from tenant DB (with safe fallback) ──────────────
    let stats = {
        totalClasses: 0, totalStudents: 0,
        totalMStudents: 0, totalFStudents: 0,
        totalTeachers: 0, totalSections: 0,
    };
    let currentSession = null;
    let superAdminCreds = null;
    let adminCreds = null;

    try {
        const tenantDB = await getTenantDB(tenant.dbUri);

        if (!tenantDB) {
            throw new Error(`getTenantDB returned undefined for ${tenant.subdomain}`);
        }

        const Class   = getClassModel(tenantDB);
        const user    = getUserModel(tenantDB);
        const Student = getStudentEnrolmentModel(tenantDB);
        const Teacher = getTeacherModel(tenantDB);
        const Section = getSectionModel(tenantDB);
        const Session = getSessionModel(tenantDB);

        const [
            totalClasses, totalStudents, totalMStudents,
            totalFStudents, totalTeachers, totalSections,
            session, superAdmin, admin,
        ] = await Promise.all([
            Class.countDocuments({ isActive: true }),
            Student.countDocuments({ status: "Studying" }),
            Student.countDocuments({ status: "Studying", gender: "Male" }),
            Student.countDocuments({ status: "Studying", gender: "Female" }),
            Teacher.countDocuments({ status: "Active" }),
            Section.countDocuments({ isActive: true }),
            Session.findOne({ isCurrent: true }),
            user.findOne({ role: "SuperAdmin" }).select("userId password role name"),
            user.findOne({ role: "Admin" }).select("userId password role name"),
        ]);

        stats = { totalClasses, totalStudents, totalMStudents, totalFStudents, totalTeachers, totalSections };
        currentSession = session;
        superAdminCreds = superAdmin;
        adminCreds = admin;
    } catch (dbErr) {
        console.error(`[getTenantById] tenant DB error for ${tenant.subdomain}:`, dbErr.message);
        // Continue with empty stats — don't crash the whole request
    }

    // ── Subscription (main DB) ──────────────────────────────────
    const subscription = await TenantSubscription.findOne({ tenantId: tenant._id.toString() });

    let activePlan = null;
    let isPlanActive = false;

    if (subscription?.currentPlan) {
        const now = new Date();
        isPlanActive =
            subscription.status === "ACTIVE" &&
            subscription.currentPlan.startDate <= now &&
            subscription.currentPlan.endDate >= now;
        if (isPlanActive) activePlan = subscription.currentPlan;
    }

    return res.status(200).json(
        new apiResponse(200, {
            tenant,
            stats,
            session: currentSession,
            credentials: superAdminCreds,
            superAdminCredentials: superAdminCreds,
            adminCredentials: adminCreds,
            subscription: {
                isPlanActive,
                activePlan,
                isTrial:           subscription?.isTrial || false,
                trialEndDate:      subscription?.trialEndDate || null,
                status:            subscription?.status || null,
                totalStudentLimit: subscription?.totalStudentLimit || 0,
                usedStudents:      subscription?.usedStudents || 0,
                remainingStudents: (subscription?.totalStudentLimit || 0) - (subscription?.usedStudents || 0),
            },
        }, "Tenant with stats fetched successfully 🚀")
    );
});

export const updateTenant = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Invalid tenant id"));
    }

    const updatedTenant = await Tenant.findByIdAndUpdate(
        id,
        req.body,
        { new: true, runValidators: true }
    );

    if (!updatedTenant) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Tenant not found"));
    }

    return res
        .status(200)
        .json(new apiResponse(200, updatedTenant, "Tenant updated successfully"));
});

export const deleteTenant = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Invalid tenant id"));
    }

    const tenant = await Tenant.findById(id);

    if (!tenant) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Tenant not found"));
    }

    await tenant.deleteOne();

    return res
        .status(200)
        .json(new apiResponse(200, null, "Tenant deleted successfully"));
});


export const toggleTenantStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Invalid tenant id"));
    }

    const tenant = await Tenant.findById(id);

    if (!tenant) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Tenant not found"));
    }

    // 🔥 TOGGLE STATUS
    tenant.isActive = !tenant.isActive;

    await tenant.save();

    return res.status(200).json(
        new apiResponse(
            200,
            {
                tenantId: tenant._id,
                isActive: tenant.isActive,
            },
            `Tenant is now ${tenant.isActive ? "ACTIVE ✅" : "INACTIVE ❌"}`
        )
    );
});

// ─────────────────────────────────────────────────────────────
// Login As Tenant User (Admin / SuperAdmin)
// POST /api/schools/:id/login-as
// Body: { role: "Admin" | "SuperAdmin" }
// Returns: { token, user, subdomain, tenantName }
// ─────────────────────────────────────────────────────────────
export const loginAsTenantUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role = "Admin" } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json(new apiResponse(400, null, "Invalid tenant id"));
    }

    const tenant = await Tenant.findById(id);
    if (!tenant) {
        return res.status(404).json(new apiResponse(404, null, "Tenant not found"));
    }

    if (!tenant.isActive) {
        return res.status(403).json(new apiResponse(403, null, "Tenant is inactive"));
    }

    // Connect to tenant DB and find the user
    const tenantDB = await getTenantDB(tenant.dbUri);
    const User = getUserModel(tenantDB);

    const targetRole = ["Admin", "SuperAdmin"].includes(role) ? role : "Admin";
    const user = await User.findOne({ role: targetRole });

    if (!user) {
        return res.status(404).json(new apiResponse(404, null, `No ${targetRole} found for this franchise`));
    }

    // Generate JWT token for this tenant user
    const token = user.generateAuthToken();

    return res.status(200).json(
        new apiResponse(200, {
            token,
            user: {
                _id:    user._id,
                userId: user.userId,
                name:   user.name,
                role:   user.role,
            },
            subdomain:  tenant.subdomain,
            tenantName: tenant.schoolName,
        }, `Logged in as ${targetRole} of ${tenant.schoolName} ✅`)
    );
});

// ─────────────────────────────────────────────────────────────
// Franchise Direct Login
// POST /api/franchise/login
// Body: { userId, password }
// Header: x-tenant-id: <subdomain>
// Returns: { token, user, franchise }
// Called from: Franchise Admin Login page
// ─────────────────────────────────────────────────────────────
export const franchiseLogin = asyncHandler(async (req, res) => {
    const { userId, password } = req.body;

    if (!userId || !password) {
        return res.status(400).json(new apiResponse(400, null, "userId and password are required"));
    }

    // Tenant must be identified by tenantMiddleware via x-tenant-id header
    if (!req.tenant) {
        return res.status(400).json(new apiResponse(400, null, "Franchise not identified. Send x-tenant-id header."));
    }

    const tenant = req.tenant;

    if (!tenant.isActive) {
        return res.status(403).json(new apiResponse(403, null, "This franchise account is inactive."));
    }

    // Connect to tenant DB
    if (!req.db) {
        return res.status(500).json(new apiResponse(500, null, "Franchise database unavailable."));
    }

    const User = getUserModel(req.db);
    const user = await User.findOne({ userId });

    if (!user) {
        return res.status(401).json(new apiResponse(401, null, "Invalid credentials."));
    }

    // Password check (plain text comparison — existing system pattern)
    if (user.password !== password) {
        return res.status(401).json(new apiResponse(401, null, "Invalid credentials."));
    }

    if (!user.isActive) {
        return res.status(403).json(new apiResponse(403, null, "Your account is inactive."));
    }

    // Generate token with franchise context
    const token = user.generateAuthToken();

    // Update lastLogin
    user.lastLogin = new Date();
    await user.save();

    return res.status(200).json(
        new apiResponse(200, {
            token,
            user: {
                _id:    user._id,
                userId: user.userId,
                name:   user.name,
                role:   user.role,
            },
            franchise: {
                _id:          tenant._id,
                franchiseName: tenant.schoolName,
                franchiseCode: tenant.franchiseCode || tenant.schoolCode,
                subdomain:    tenant.subdomain,
                logo:         tenant.logo,
            },
        }, "Franchise login successful ✅")
    );
});