import Tenant from "../models/tenant.model.js";
import TenantSubscription from "../models/TenantSubscription.modal.js";
import FreeTrialPackage from "../models/FreeTrialPackage.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { getTenantDB } from "../utils/dbManager.js";
import { getUserModel } from "../models/tenant/user.model.js";
import mongoose from "mongoose";
import { sendMail } from "../utils/mailer.js";
import { logFromReq } from "../utils/logActivity.js";

/* ─────────────────────────────────────────────────────────────
   POST /api/schools  — Register a new franchise tenant
───────────────────────────────────────────────────────────── */
export const registerTenant = asyncHandler(async (req, res) => {
    const {
        schoolName,       // franchiseName stored as schoolName for compatibility
        subdomain,
        schoolEmail,
        schoolContact,
        logo,
        dbUri,
        description,
        // Franchise-specific fields
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
        return res.status(400).json(new apiResponse(400, null, "Franchise name & subdomain are required"));
    }

    const cleanSubdomain = subdomain.toLowerCase().trim();

    const exists = await Tenant.findOne({ subdomain: cleanSubdomain });
    if (exists) {
        return res.status(400).json(new apiResponse(400, null, "Subdomain already exists"));
    }

    const finalDbUri = dbUri
        ? dbUri
        : `${process.env.BASE_DB_URI.replace(/\/$/, '')}/${cleanSubdomain}`;

    // Create tenant record
    const tenant = await Tenant.create({
        schoolName,
        schoolEmail,
        schoolContact,
        subdomain: cleanSubdomain,
        dbUri: finalDbUri,
        logo,
        description,
        isActive: true,
        ...(franchiseCode       && { franchiseCode }),
        ...(businessType        && { businessType }),
        ...(gstNo               && { gstNo }),
        ...(franchiseAdminName  && { franchiseAdminName }),
        ...(franchiseAdminEmail && { franchiseAdminEmail }),
        ...(franchiseAdminPhone && { franchiseAdminPhone }),
        ...(addressLine1        && { addressLine1 }),
        ...(city                && { city }),
        ...(state               && { state }),
        ...(country             && { country }),
        ...(pincode             && { pincode }),
    });

    // Connect to tenant DB and create default admin users
    const tenantDB = await getTenantDB(finalDbUri);
    const User = getUserModel(tenantDB);

    const superAdminUserId = `superadmin_${cleanSubdomain}`;
    const superAdminPassword = Math.random().toString(36).slice(-8);
    const adminUserId = `admin_${cleanSubdomain}`;
    const adminPassword = Math.random().toString(36).slice(-8);

    await User.create({
        userId: superAdminUserId,
        password: superAdminPassword,
        role: "SuperAdmin",
        name: "Super Admin",
        isNew: false,
        isActive: true,
    });

    await User.create({
        userId: adminUserId,
        password: adminPassword,
        role: "Admin",
        name: "Franchise Admin",
        isNew: false,
        isActive: true,
    });

    // Send credentials email
    const emailTo = franchiseAdminEmail || schoolEmail;
    if (emailTo) {
        try {
            await sendMail({
                to: emailTo,
                subject: `Franchise Portal — Login Credentials for ${schoolName}`,
                html: `
                  <h2>Welcome to the Franchise Portal!</h2>
                  <p>Your franchise <strong>${schoolName}</strong> has been registered.</p>
                  <h3>Super Admin Credentials</h3>
                  <p>User ID: <strong>${superAdminUserId}</strong><br/>Password: <strong>${superAdminPassword}</strong></p>
                  <h3>Admin Credentials</h3>
                  <p>User ID: <strong>${adminUserId}</strong><br/>Password: <strong>${adminPassword}</strong></p>
                  <p>Login at: your franchise portal URL with subdomain <strong>${cleanSubdomain}</strong></p>
                `,
            });
        } catch (emailErr) {
            console.warn('[registerTenant] Email send failed:', emailErr.message);
        }
    }

    // Auto-assign free trial subscription
    let trialPkg = null;
    try {
        trialPkg = await FreeTrialPackage.findOne({ isDefault: true, isActive: true }).lean();
        if (!trialPkg) {
            trialPkg = await FreeTrialPackage.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
        }
    } catch (_) { /* no trial available */ }

    if (trialPkg) {
        const trialStart = new Date();
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + (trialPkg.durationDays || 0));

        await TenantSubscription.create({
            tenantId:          tenant._id,
            isTrial:           true,
            trialEndDate:      trialEnd,
            status:            "TRIAL",
            paidStatus:        "PAID",
            totalStudentLimit: trialPkg.studentLimit || 0,
            usedStudents:      0,
            totalAmount:       0,
            usedTrialPackageIds: [trialPkg._id],
            currentPlan: {
                name:         trialPkg.name,
                price:        0,
                pricingModel: "FIXED",
                studentLimit: trialPkg.studentLimit || 0,
                billingCycle: "Monthly",
                startDate:    trialStart,
                endDate:      trialEnd,
            },
            history: [{
                type:         "TRIAL_START",
                name:         trialPkg.name,
                price:        0,
                studentLimit: trialPkg.studentLimit || 0,
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

    logFromReq(req, {
        action: `Created Franchise: ${schoolName}`,
        target: schoolName,
        module: "Franchise",
        type:   "Create",
    });

    return res.status(201).json(
        new apiResponse(201, {
            tenant,
            adminCredentials: { userId: adminUserId, password: adminPassword },
            superAdminCredentials: { userId: superAdminUserId, password: superAdminPassword },
        }, "Franchise registered successfully 🚀")
    );
});

/* ─────────────────────────────────────────────────────────────
   GET /api/schools  — List all franchise tenants
───────────────────────────────────────────────────────────── */
export const getAllTenants = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 10,
        search,
        subdomain,
        isActive,
        isPagination = "true",
    } = req.query;

    const match = {};
    if (isActive !== undefined) match.isActive = isActive === "true";
    if (subdomain) match.subdomain = subdomain;

    let pipeline = [{ $match: match }];

    if (search) {
        const words = search.trim().split(/\s+/).map(w => new RegExp(w, "i"));
        pipeline.push({
            $match: {
                $or: words.flatMap(regex => [
                    { schoolName: { $regex: regex } },
                    { subdomain:  { $regex: regex } },
                ]),
            },
        });
    }

    const totalArr = await Tenant.aggregate([...pipeline, { $count: "count" }]);
    const total = totalArr[0]?.count || 0;

    pipeline.push({ $sort: { createdAt: -1 } });

    if (isPagination === "true") {
        pipeline.push(
            { $skip: (Number(page) - 1) * Number(limit) },
            { $limit: Number(limit) }
        );
    }

    pipeline.push(
        { $lookup: { from: "tenantsubscriptions", localField: "_id", foreignField: "tenantId", as: "subscription" } },
        { $addFields: { subscription: { $arrayElemAt: ["$subscription", 0] } } },
        {
            $addFields: {
                planName:    "$subscription.currentPlan.name",
                planStatus:  "$subscription.status",
                planEndDate: "$subscription.currentPlan.endDate",
                isTrial:     "$subscription.isTrial",
            },
        }
    );

    const tenants = await Tenant.aggregate(pipeline);

    return res.status(200).json(
        new apiResponse(200, {
            tenants,
            total,
            totalPages:  isPagination === "true" ? Math.ceil(total / Number(limit)) : 1,
            currentPage: isPagination === "true" ? Number(page) : null,
        }, "Tenants fetched successfully 🚀")
    );
});

/* ─────────────────────────────────────────────────────────────
   GET /api/schools/:id  — Get franchise by ID with credentials
───────────────────────────────────────────────────────────── */
export const getTenantById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json(new apiResponse(400, null, "Invalid tenant id"));
    }

    const tenant = await Tenant.findById(id);
    if (!tenant) return res.status(404).json(new apiResponse(404, null, "Tenant not found"));

    // Get admin credentials from tenant DB
    let superAdminCreds = null;
    let adminCreds = null;
    try {
        const tenantDB = await getTenantDB(tenant.dbUri);
        const User = getUserModel(tenantDB);
        [superAdminCreds, adminCreds] = await Promise.all([
            User.findOne({ role: "SuperAdmin" }).select("userId password role name"),
            User.findOne({ role: "Admin" }).select("userId password role name"),
        ]);
    } catch (dbErr) {
        console.error(`[getTenantById] DB error for ${tenant.subdomain}:`, dbErr.message);
    }

    const subscription = await TenantSubscription.findOne({ tenantId: tenant._id }).lean();

    return res.status(200).json(
        new apiResponse(200, {
            tenant,
            credentials: superAdminCreds,
            superAdminCredentials: superAdminCreds,
            adminCredentials: adminCreds,
            subscription: {
                status:            subscription?.status || null,
                isTrial:           subscription?.isTrial || false,
                trialEndDate:      subscription?.trialEndDate || null,
                totalStudentLimit: subscription?.totalStudentLimit || 0,
                usedStudents:      subscription?.usedStudents || 0,
                currentPlan:       subscription?.currentPlan || null,
            },
        }, "Tenant fetched successfully 🚀")
    );
});

/* ─────────────────────────────────────────────────────────────
   PUT /api/schools/:id  — Update franchise
───────────────────────────────────────────────────────────── */
export const updateTenant = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json(new apiResponse(400, null, "Invalid tenant id"));
    }
    const updated = await Tenant.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json(new apiResponse(404, null, "Tenant not found"));
    logFromReq(req, { action: `Updated Franchise: ${updated.schoolName}`, target: updated.schoolName, module: "Franchise", type: "Update" });
    return res.status(200).json(new apiResponse(200, updated, "Tenant updated successfully"));
});

/* ─────────────────────────────────────────────────────────────
   DELETE /api/schools/:id  — Delete franchise
───────────────────────────────────────────────────────────── */
export const deleteTenant = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json(new apiResponse(400, null, "Invalid tenant id"));
    }
    const tenant = await Tenant.findById(id);
    if (!tenant) return res.status(404).json(new apiResponse(404, null, "Tenant not found"));
    await tenant.deleteOne();
    logFromReq(req, { action: `Deleted Franchise: ${tenant.schoolName}`, target: tenant.schoolName, module: "Franchise", type: "Delete" });
    return res.status(200).json(new apiResponse(200, null, "Tenant deleted successfully"));
});

/* ─────────────────────────────────────────────────────────────
   PATCH /api/schools/toggle-status/:id  — Toggle active status
───────────────────────────────────────────────────────────── */
export const toggleTenantStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json(new apiResponse(400, null, "Invalid tenant id"));
    }
    const tenant = await Tenant.findById(id);
    if (!tenant) return res.status(404).json(new apiResponse(404, null, "Tenant not found"));
    tenant.isActive = !tenant.isActive;
    await tenant.save();
    return res.status(200).json(
        new apiResponse(200, { tenantId: tenant._id, isActive: tenant.isActive },
            `Franchise is now ${tenant.isActive ? "ACTIVE ✅" : "INACTIVE ❌"}`)
    );
});

/* ─────────────────────────────────────────────────────────────
   POST /api/schools/:id/login-as  — Quick login as tenant user
───────────────────────────────────────────────────────────── */
export const loginAsTenantUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role = "Admin" } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json(new apiResponse(400, null, "Invalid tenant id"));
    }
    const tenant = await Tenant.findById(id);
    if (!tenant) return res.status(404).json(new apiResponse(404, null, "Tenant not found"));
    if (!tenant.isActive) return res.status(403).json(new apiResponse(403, null, "Tenant is inactive"));

    const tenantDB = await getTenantDB(tenant.dbUri);
    const User = getUserModel(tenantDB);
    const targetRole = ["Admin", "SuperAdmin"].includes(role) ? role : "Admin";
    const user = await User.findOne({ role: targetRole });

    if (!user) return res.status(404).json(new apiResponse(404, null, `No ${targetRole} found for this franchise`));

    const token = user.generateAuthToken();
    return res.status(200).json(
        new apiResponse(200, {
            token,
            user: { _id: user._id, userId: user.userId, name: user.name, role: user.role },
            subdomain:  tenant.subdomain,
            tenantName: tenant.schoolName,
        }, `Logged in as ${targetRole} of ${tenant.schoolName} ✅`)
    );
});

/* ─────────────────────────────────────────────────────────────
   POST /api/franchise/login  — Franchise portal login
───────────────────────────────────────────────────────────── */
export const franchiseLogin = asyncHandler(async (req, res) => {
    const { userId, password } = req.body;

    if (!userId || !password) {
        return res.status(400).json(new apiResponse(400, null, "userId and password are required"));
    }
    if (!req.tenant) {
        return res.status(400).json(new apiResponse(400, null, "Franchise not identified. Send x-tenant-id header."));
    }

    const tenant = req.tenant;
    if (!tenant.isActive) return res.status(403).json(new apiResponse(403, null, "This franchise account is inactive."));
    if (!req.db) return res.status(500).json(new apiResponse(500, null, "Franchise database unavailable."));

    const User = getUserModel(req.db);
    const user = await User.findOne({ userId });
    if (!user) return res.status(401).json(new apiResponse(401, null, "Invalid credentials."));
    if (user.password !== password) return res.status(401).json(new apiResponse(401, null, "Invalid credentials."));
    if (!user.isActive) return res.status(403).json(new apiResponse(403, null, "Your account is inactive."));

    const token = user.generateAuthToken();
    user.lastLogin = new Date();
    await user.save();

    return res.status(200).json(
        new apiResponse(200, {
            token,
            user:      { _id: user._id, userId: user.userId, name: user.name, role: user.role },
            franchise: {
                _id:           tenant._id,
                franchiseName: tenant.schoolName,
                franchiseCode: tenant.franchiseCode || tenant.schoolCode,
                subdomain:     tenant.subdomain,
                logo:          tenant.logo,
            },
        }, "Franchise login successful ✅")
    );
});
