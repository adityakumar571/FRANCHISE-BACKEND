/**
 * FreeTrialPackage.controller.js
 *
 * Admin CRUD for dynamic free trial packages.
 *
 * Routes (all require verifyMainJWT):
 *  POST   /api/free-trial-packages                          → createFreeTrialPackage
 *  GET    /api/free-trial-packages                          → getAllFreeTrialPackages
 *  GET    /api/free-trial-packages/:id                      → getFreeTrialPackageById
 *  PUT    /api/free-trial-packages/:id                      → updateFreeTrialPackage
 *  DELETE /api/free-trial-packages/:id                      → deleteFreeTrialPackage
 *  PATCH  /api/free-trial-packages/:id/toggle               → toggleFreeTrialPackageStatus
 *  PATCH  /api/free-trial-packages/:id/set-default          → setDefaultFreeTrialPackage
 *  POST   /api/free-trial-packages/:id/assign/:tenantId     → assignFreeTrialToSchool
 *  PATCH  /api/free-trial-packages/reset-eligibility/:tenantId → resetTrialEligibility
 */

import mongoose from "mongoose";
import FreeTrialPackage from "../models/FreeTrialPackage.model.js";
import TenantSubscription from "../models/TenantSubscription.modal.js";
import Tenant from "../models/tenant.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ────────────────────────────────────────────────────────────────
   CREATE
────────────────────────────────────────────────────────────────── */
export const createFreeTrialPackage = asyncHandler(async (req, res) => {
    const {
        name,
        description,
        durationDays,
        studentLimit,
        features,
        isDefault,
        eligibleOnce,
        isActive,
    } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json(new apiResponse(400, null, "Package name is required"));
    }
    if (!durationDays || Number(durationDays) < 1) {
        return res.status(400).json(new apiResponse(400, null, "Trial duration (durationDays) must be at least 1 day"));
    }
    if (studentLimit !== undefined && Number(studentLimit) < 1) {
        return res.status(400).json(new apiResponse(400, null, "Student limit must be at least 1"));
    }

    const existing = await FreeTrialPackage.findOne({ name: name.trim() });
    if (existing) {
        return res.status(400).json(new apiResponse(400, null, "A free trial package with this name already exists"));
    }

    // If isDefault = true, the pre-save hook will unset all others
    const pkg = await FreeTrialPackage.create({
        name:         name.trim(),
        description:  description || "",
        durationDays: Number(durationDays),
        studentLimit: studentLimit !== undefined ? Number(studentLimit) : 350,
        features:     Array.isArray(features) ? features : [],
        isDefault:    isDefault === true || isDefault === "true",
        eligibleOnce: eligibleOnce !== false && eligibleOnce !== "false",
        isActive:     isActive !== false && isActive !== "false",
        createdBy:    req.user?.name || req.user?._id?.toString() || "admin",
        updatedBy:    req.user?.name || req.user?._id?.toString() || "admin",
    });

    return res.status(201).json(new apiResponse(201, pkg, "Free trial package created successfully"));
});

/* ────────────────────────────────────────────────────────────────
   GET ALL (with pagination + search)
────────────────────────────────────────────────────────────────── */
export const getAllFreeTrialPackages = asyncHandler(async (req, res) => {
    const {
        page         = 1,
        limit        = 10,
        isPagination = "true",
        search       = "",
        isActive,
    } = req.query;

    const match = {};

    if (isActive !== undefined && isActive !== "") {
        match.isActive = isActive === "true";
    }

    if (search.trim()) {
        match.name = { $regex: search.trim(), $options: "i" };
    }

    const total = await FreeTrialPackage.countDocuments(match);

    let query = FreeTrialPackage.find(match).sort({ isDefault: -1, createdAt: -1 });

    if (isPagination === "true") {
        query = query
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit));
    }

    const packages = await query.lean();

    return res.status(200).json(
        new apiResponse(200, {
            packages,
            total,
            totalPages:  Math.ceil(total / Number(limit)),
            currentPage: Number(page),
        }, "Free trial packages fetched successfully")
    );
});

/* ────────────────────────────────────────────────────────────────
   GET BY ID
────────────────────────────────────────────────────────────────── */
export const getFreeTrialPackageById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
        return res.status(400).json(new apiResponse(400, null, "Invalid package ID"));
    }

    const pkg = await FreeTrialPackage.findById(id).lean();
    if (!pkg) {
        return res.status(404).json(new apiResponse(404, null, "Free trial package not found"));
    }

    return res.status(200).json(new apiResponse(200, pkg, "Package fetched successfully"));
});

/* ────────────────────────────────────────────────────────────────
   UPDATE
────────────────────────────────────────────────────────────────── */
export const updateFreeTrialPackage = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
        return res.status(400).json(new apiResponse(400, null, "Invalid package ID"));
    }

    const pkg = await FreeTrialPackage.findById(id);
    if (!pkg) {
        return res.status(404).json(new apiResponse(404, null, "Free trial package not found"));
    }

    const {
        name,
        description,
        durationDays,
        studentLimit,
        features,
        eligibleOnce,
        isActive,
    } = req.body;

    // Name uniqueness check (excluding current)
    if (name && name.trim() !== pkg.name) {
        const clash = await FreeTrialPackage.findOne({ name: name.trim(), _id: { $ne: id } });
        if (clash) {
            return res.status(400).json(new apiResponse(400, null, "Another package with this name already exists"));
        }
        pkg.name = name.trim();
    }

    if (description !== undefined) pkg.description  = description;
    if (durationDays !== undefined) {
        if (Number(durationDays) < 1) {
            return res.status(400).json(new apiResponse(400, null, "durationDays must be at least 1"));
        }
        pkg.durationDays = Number(durationDays);
    }
    if (studentLimit !== undefined) {
        if (Number(studentLimit) < 1) {
            return res.status(400).json(new apiResponse(400, null, "studentLimit must be at least 1"));
        }
        pkg.studentLimit = Number(studentLimit);
    }
    if (Array.isArray(features))   pkg.features     = features;
    if (eligibleOnce !== undefined) pkg.eligibleOnce = eligibleOnce === true || eligibleOnce === "true";
    if (isActive !== undefined)     pkg.isActive     = isActive === true || isActive === "true";

    pkg.updatedBy = req.user?.name || req.user?._id?.toString() || "admin";

    await pkg.save();

    return res.status(200).json(new apiResponse(200, pkg, "Package updated successfully"));
});

/* ────────────────────────────────────────────────────────────────
   DELETE
────────────────────────────────────────────────────────────────── */
export const deleteFreeTrialPackage = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
        return res.status(400).json(new apiResponse(400, null, "Invalid package ID"));
    }

    const pkg = await FreeTrialPackage.findById(id);
    if (!pkg) {
        return res.status(404).json(new apiResponse(404, null, "Free trial package not found"));
    }

    if (pkg.isDefault) {
        return res.status(400).json(
            new apiResponse(400, null, "Cannot delete the default trial package. Please set another package as default first.")
        );
    }

    await pkg.deleteOne();

    return res.status(200).json(new apiResponse(200, null, "Free trial package deleted successfully"));
});

/* ────────────────────────────────────────────────────────────────
   TOGGLE STATUS (active / inactive)
────────────────────────────────────────────────────────────────── */
export const toggleFreeTrialPackageStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
        return res.status(400).json(new apiResponse(400, null, "Invalid package ID"));
    }

    const pkg = await FreeTrialPackage.findById(id);
    if (!pkg) {
        return res.status(404).json(new apiResponse(404, null, "Free trial package not found"));
    }

    // Don't allow deactivating the only default package
    if (pkg.isDefault && pkg.isActive) {
        const otherActive = await FreeTrialPackage.countDocuments({
            _id:      { $ne: id },
            isActive: true,
            isDefault: true,
        });
        // Allow deactivation — admin may want to disable all trial for now
        // Just warn in logs; actual block can be added if business requires it
    }

    pkg.isActive  = !pkg.isActive;
    pkg.updatedBy = req.user?.name || req.user?._id?.toString() || "admin";
    await pkg.save();

    return res.status(200).json(
        new apiResponse(200, pkg, `Package ${pkg.isActive ? "activated" : "deactivated"} successfully`)
    );
});

/* ────────────────────────────────────────────────────────────────
   SET AS DEFAULT
────────────────────────────────────────────────────────────────── */
export const setDefaultFreeTrialPackage = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
        return res.status(400).json(new apiResponse(400, null, "Invalid package ID"));
    }

    const pkg = await FreeTrialPackage.findById(id);
    if (!pkg) {
        return res.status(404).json(new apiResponse(404, null, "Free trial package not found"));
    }

    if (!pkg.isActive) {
        return res.status(400).json(
            new apiResponse(400, null, "Cannot set an inactive package as default. Please activate it first.")
        );
    }

    if (pkg.isDefault) {
        return res.status(200).json(new apiResponse(200, pkg, "This package is already the default"));
    }

    // Unset all others + set this one — pre-save hook handles the unset
    pkg.isDefault = true;
    pkg.updatedBy = req.user?.name || req.user?._id?.toString() || "admin";
    await pkg.save();

    return res.status(200).json(new apiResponse(200, pkg, "Default trial package updated successfully"));
});

/* ────────────────────────────────────────────────────────────────
   ASSIGN FREE TRIAL TO A PARTICULAR SCHOOL (admin utility)
   POST /api/free-trial-packages/:id/assign/:tenantId

   Body (optional):
     { force: true }  → bypass eligibleOnce check (admin override)

   Flow:
   1. Validate packageId + tenantId
   2. Check package is active
   3. Check school (tenant) exists
   4. Check eligibleOnce — block if already used (unless force: true)
   5. Upsert TenantSubscription with trial data
   6. Push packageId into usedTrialPackageIds
────────────────────────────────────────────────────────────────── */
export const assignFreeTrialToSchool = asyncHandler(async (req, res) => {
    const { id: packageId, tenantId } = req.params;
    const { force = false } = req.body;

    if (!isValidId(packageId)) {
        return res.status(400).json(new apiResponse(400, null, "Invalid package ID"));
    }
    if (!isValidId(tenantId)) {
        return res.status(400).json(new apiResponse(400, null, "Invalid tenant ID"));
    }

    // 1. Load package
    const pkg = await FreeTrialPackage.findById(packageId);
    if (!pkg) {
        return res.status(404).json(new apiResponse(404, null, "Free trial package not found"));
    }
    if (!pkg.isActive) {
        return res.status(400).json(
            new apiResponse(400, null, "This package is inactive and cannot be assigned")
        );
    }

    // 2. Check school exists
    const tenant = await Tenant.findById(tenantId).select("schoolName isActive");
    if (!tenant) {
        return res.status(404).json(new apiResponse(404, null, "School (tenant) not found"));
    }
    if (!tenant.isActive) {
        return res.status(400).json(
            new apiResponse(400, null, `School "${tenant.schoolName}" is inactive. Activate the school first.`)
        );
    }

    // 3. Get or create subscription record for this tenant
    let subscription = await TenantSubscription.findOne({ tenantId });
    if (!subscription) {
        subscription = new TenantSubscription({ tenantId, usedTrialPackageIds: [] });
    }

    // 4. eligibleOnce check
    const alreadyUsed = subscription.usedTrialPackageIds
        ?.some((usedId) => usedId.toString() === packageId);

    if (pkg.eligibleOnce && alreadyUsed && !force) {
        return res.status(400).json(
            new apiResponse(
                400,
                null,
                `School "${tenant.schoolName}" has already used this trial package. Pass { force: true } to override.`
            )
        );
    }

    // 5. Compute trial dates
    const now      = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + pkg.durationDays);

    // 6. Apply trial to subscription
    subscription.isTrial      = true;
    subscription.trialEndDate = trialEnd;
    subscription.status       = "TRIAL";
    subscription.totalStudentLimit = pkg.studentLimit;

    // Populate currentPlan with trial package info (no planId since it's a trial)
    subscription.currentPlan = {
        name:         pkg.name,
        price:        0,
        originalPrice: 0,
        studentLimit: pkg.studentLimit,
        startDate:    now,
        endDate:      trialEnd,
        billingCycle: "Trial",
    };

    // Track usage — add only if not already present
    if (!alreadyUsed) {
        subscription.usedTrialPackageIds.push(pkg._id);
    }

    // History entry
    subscription.history.push({
        type:         "TRIAL_START",
        name:         pkg.name,
        price:        0,
        studentLimit: pkg.studentLimit,
        startDate:    now,
        endDate:      trialEnd,
        createdAt:    now,
    });

    await subscription.save();

    return res.status(200).json(
        new apiResponse(
            200,
            {
                tenantId,
                schoolName:    tenant.schoolName,
                packageId:     pkg._id,
                packageName:   pkg.name,
                durationDays:  pkg.durationDays,
                studentLimit:  pkg.studentLimit,
                trialStartDate: now,
                trialEndDate:  trialEnd,
                status:        subscription.status,
            },
            `Free trial "${pkg.name}" assigned to "${tenant.schoolName}" successfully`
        )
    );
});

/* ────────────────────────────────────────────────────────────────
   RESET USER TRIAL ELIGIBILITY (admin utility)
   PATCH /api/free-trial-packages/reset-eligibility/:tenantId
   Removes the trialPackageId tracking so the tenant can receive a trial again.
────────────────────────────────────────────────────────────────── */
export const resetTrialEligibility = asyncHandler(async (req, res) => {
    const { tenantId } = req.params;

    if (!isValidId(tenantId)) {
        return res.status(400).json(new apiResponse(400, null, "Invalid tenantId"));
    }

    const subscription = await TenantSubscription.findOne({ tenantId });
    if (!subscription) {
        return res.status(404).json(new apiResponse(404, null, "No subscription found for this tenant"));
    }

    subscription.usedTrialPackageIds = [];
    subscription.updatedAt = new Date();
    await subscription.save();

    return res.status(200).json(
        new apiResponse(200, null, "Trial eligibility reset successfully. Tenant can now receive a free trial again.")
    );
});
