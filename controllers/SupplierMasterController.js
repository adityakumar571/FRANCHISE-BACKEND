import SupplierMaster from "../models/SupplierMaster.model.js";
import { apiResponse } from "../utils/apiResponse.js";
import { apiError } from "../utils/apiError.js";

/* ─── No auto-seeding. Data must be added via admin or migration ─── */

/* ══════════════════════════════════════════
   GET /api/suppliers/masters?type=category
   Returns all active entries for a given type
══════════════════════════════════════════ */
export const getMasters = async (req, res) => {
  try {
    const { type } = req.query;
    if (!type || !["category", "unit", "company"].includes(type)) {
      return apiError(
        res,
        400,
        false,
        "type query param required: category | unit | company",
      );
    }

    const data = await SupplierMaster.find({ type })
      .sort({ sortOrder: 1, name: 1 })
      .select("_id name description sortOrder isActive")
      .lean();

    return res
      .status(200)
      .json(new apiResponse(200, data, `${type} list fetched`));
  } catch (err) {
    return apiError(res, 500, false, "Failed to fetch masters", err.message);
  }
};

/* ══════════════════════════════════════════
   GET /api/suppliers/masters/all
   Returns categories + units + companies in one call
   (used by MedicineManagement dropdown init)
══════════════════════════════════════════ */
export const getAllMasters = async (req, res) => {
  try {
    const [categories, units, companies] = await Promise.all([
      SupplierMaster.find({ type: "category" })
        .sort({ sortOrder: 1, name: 1 })
        .select("_id name description sortOrder isActive")
        .lean(),
      SupplierMaster.find({ type: "unit" })
        .sort({ sortOrder: 1, name: 1 })
        .select("_id name description sortOrder isActive")
        .lean(),
      SupplierMaster.find({ type: "company" })
        .sort({ sortOrder: 1, name: 1 })
        .select("_id name description sortOrder isActive")
        .lean(),
    ]);

    return res
      .status(200)
      .json(
        new apiResponse(
          200,
          { categories, units, companies },
          "All masters fetched",
        ),
      );
  } catch (err) {
    return apiError(res, 500, false, "Failed to fetch masters", err.message);
  }
};

/* ══════════════════════════════════════════
   POST /api/suppliers/masters
   Body: { type, name, description?, sortOrder? }
══════════════════════════════════════════ */
export const createMaster = async (req, res) => {
  try {
    const { type, name, description = "", sortOrder = 0 } = req.body;

    if (!type || !["category", "unit", "company"].includes(type)) {
      return apiError(
        res,
        400,
        false,
        "Invalid type. Must be: category | unit | company",
      );
    }
    if (!name?.trim()) {
      return apiError(res, 400, false, "Name is required");
    }

    const existing = await SupplierMaster.findOne({ type, name: name.trim() });
    if (existing) {
      return apiError(res, 409, false, `${name} already exists in ${type}`);
    }

    const doc = await SupplierMaster.create({
      type,
      name: name.trim(),
      description,
      sortOrder,
    });
    return res
      .status(201)
      .json(new apiResponse(201, doc, `${type} created successfully`));
  } catch (err) {
    if (err.code === 11000)
      return apiError(res, 409, false, "Entry already exists");
    return apiError(res, 500, false, "Failed to create", err.message);
  }
};

/* ══════════════════════════════════════════
   PUT /api/suppliers/masters/:id
   Body: { name?, description?, sortOrder?, isActive? }
══════════════════════════════════════════ */
export const updateMaster = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, sortOrder, isActive } = req.body;

    const doc = await SupplierMaster.findById(id);
    if (!doc) return apiError(res, 404, false, "Entry not found");

    // Check duplicate name within same type
    if (name && name.trim() !== doc.name) {
      const dup = await SupplierMaster.findOne({
        type: doc.type,
        name: name.trim(),
        _id: { $ne: id },
      });
      if (dup) return apiError(res, 409, false, `${name} already exists`);
    }

    if (name !== undefined) doc.name = name.trim();
    if (description !== undefined) doc.description = description;
    if (sortOrder !== undefined) doc.sortOrder = sortOrder;
    if (isActive !== undefined) doc.isActive = isActive;

    await doc.save();
    return res
      .status(200)
      .json(new apiResponse(200, doc, "Updated successfully"));
  } catch (err) {
    return apiError(res, 500, false, "Failed to update", err.message);
  }
};

/* ══════════════════════════════════════════
   DELETE /api/suppliers/masters/:id
   Soft delete (sets isActive = false)
══════════════════════════════════════════ */
export const deleteMaster = async (req, res) => {
  try {
    const doc = await SupplierMaster.findById(req.params.id);
    if (!doc) return apiError(res, 404, false, "Entry not found");

    doc.isActive = false;
    await doc.save();
    return res
      .status(200)
      .json(new apiResponse(200, null, "Deleted successfully"));
  } catch (err) {
    return apiError(res, 500, false, "Failed to delete", err.message);
  }
};
