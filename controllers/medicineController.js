import Medicine         from "../models/Medicine.model.js";
import MedicineBrand    from "../models/MedicineBrand.model.js";
import MedicineCategory from "../models/MedicineCategory.model.js";
import { apiResponse }  from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logFromReq }   from "../utils/logActivity.js";

/* ═══════════════════════════════════════════════════════════
   MEDICINES
═══════════════════════════════════════════════════════════ */

/* GET /api/medicine  — paginated + search + filters */
export const getAllMedicines = asyncHandler(async (req, res) => {
  let { page = 1, limit = 20, search = "", category, isActive, isPagination = "true" } = req.query;
  page  = Math.max(1, parseInt(page));
  limit = Math.min(100, Math.max(1, parseInt(limit)));

  const match = {};
  if (isActive !== undefined) match.isActive = isActive === "true";
  if (category) match.category = { $regex: new RegExp(`^${category.trim()}$`, "i") };

  if (search.trim()) {
    const rx = new RegExp(search.trim(), "i");
    match.$or = [
      { name:    { $regex: rx } },
      { generic: { $regex: rx } },
      { barcode: { $regex: rx } },
      { brand:   { $regex: rx } },
    ];
  }

  const total = await Medicine.countDocuments(match);

  let query = Medicine.find(match).sort({ createdAt: -1 });
  if (isPagination === "true") {
    query = query.skip((page - 1) * limit).limit(limit);
  }
  const medicines = await query.lean();

  return res.status(200).json(new apiResponse(200, {
    medicines, total,
    totalPages:  Math.ceil(total / limit),
    currentPage: page,
  }, "Medicines fetched ✅"));
});

/* GET /api/medicine/stats */
export const getMedicineStats = asyncHandler(async (req, res) => {
  const [total, active, inactive, genericMapped] = await Promise.all([
    Medicine.countDocuments({}),
    Medicine.countDocuments({ isActive: true }),
    Medicine.countDocuments({ isActive: false }),
    Medicine.countDocuments({ generic: { $exists: true, $ne: "" } }),
  ]);
  const categories = await Medicine.distinct("category");
  return res.status(200).json(new apiResponse(200, {
    total, active, inactive, genericMapped, categoryCount: categories.length,
  }, "Stats fetched ✅"));
});

/* POST /api/medicine */
export const createMedicine = asyncHandler(async (req, res) => {
  const { name, generic, brand, strength, form, pack, unit, hsn, gst, barcode, category, controlled, isActive } = req.body;
  if (!name?.trim()) return res.status(400).json(new apiResponse(400, null, "Medicine name is required"));

  const medicine = await Medicine.create({
    name: name.trim(), generic, brand, strength, form, pack, unit, hsn, gst, barcode, category, controlled,
    isActive: isActive !== undefined ? isActive : true,
  });

  logFromReq(req, { action: `Created Medicine: ${medicine.name}`, target: medicine.name, module: "Other", type: "Create" });
  return res.status(201).json(new apiResponse(201, medicine, "Medicine created ✅"));
});

/* PUT /api/medicine/:id */
export const updateMedicine = asyncHandler(async (req, res) => {
  const { name, ...rest } = req.body;
  const updates = { ...rest };
  if (name) updates.name = name.trim();

  const medicine = await Medicine.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!medicine) return res.status(404).json(new apiResponse(404, null, "Medicine not found"));

  logFromReq(req, { action: `Updated Medicine: ${medicine.name}`, target: medicine.name, module: "Other", type: "Update" });
  return res.status(200).json(new apiResponse(200, medicine, "Medicine updated ✅"));
});

/* PATCH /api/medicine/:id/toggle */
export const toggleMedicine = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) return res.status(404).json(new apiResponse(404, null, "Medicine not found"));

  medicine.isActive = !medicine.isActive;
  await medicine.save();
  return res.status(200).json(new apiResponse(200, { _id: medicine._id, isActive: medicine.isActive },
    `Medicine ${medicine.isActive ? "activated ✅" : "deactivated ❌"}`));
});

/* DELETE /api/medicine/:id */
export const deleteMedicine = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findByIdAndDelete(req.params.id);
  if (!medicine) return res.status(404).json(new apiResponse(404, null, "Medicine not found"));

  logFromReq(req, { action: `Deleted Medicine: ${medicine.name}`, target: medicine.name, module: "Other", type: "Delete" });
  return res.status(200).json(new apiResponse(200, null, "Medicine deleted ✅"));
});

/* ═══════════════════════════════════════════════════════════
   BRANDS
═══════════════════════════════════════════════════════════ */

export const getAllBrands = asyncHandler(async (req, res) => {
  let { page = 1, limit = 20, search = "", isActive, isPagination = "true" } = req.query;
  page  = Math.max(1, parseInt(page));
  limit = Math.min(100, Math.max(1, parseInt(limit)));

  const match = {};
  if (isActive !== undefined) match.isActive = isActive === "true";
  if (search.trim()) match.name = { $regex: new RegExp(search.trim(), "i") };

  const total  = await MedicineBrand.countDocuments(match);
  let query = MedicineBrand.find(match).sort({ name: 1 });
  if (isPagination === "true") query = query.skip((page - 1) * limit).limit(limit);
  const brands = await query.lean();

  // Attach medicine count per brand
  const brandNames = brands.map(b => b.name);
  const countDocs  = await Medicine.aggregate([
    { $match: { brand: { $in: brandNames } } },
    { $group: { _id: "$brand", count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(countDocs.map(d => [d._id, d.count]));
  const brandsWithCount = brands.map(b => ({ ...b, count: countMap[b.name] || 0 }));

  return res.status(200).json(new apiResponse(200, {
    brands: brandsWithCount, total, totalPages: Math.ceil(total / limit), currentPage: page,
  }, "Brands fetched ✅"));
});

export const createBrand = asyncHandler(async (req, res) => {
  const { name, manufacturer } = req.body;
  if (!name?.trim()) return res.status(400).json(new apiResponse(400, null, "Brand name is required"));

  const exists = await MedicineBrand.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, "i") } });
  if (exists) return res.status(400).json(new apiResponse(400, null, "Brand already exists"));

  const brand = await MedicineBrand.create({ name: name.trim(), manufacturer });
  return res.status(201).json(new apiResponse(201, brand, "Brand created ✅"));
});

export const updateBrand = asyncHandler(async (req, res) => {
  const brand = await MedicineBrand.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!brand) return res.status(404).json(new apiResponse(404, null, "Brand not found"));
  return res.status(200).json(new apiResponse(200, brand, "Brand updated ✅"));
});

export const toggleBrand = asyncHandler(async (req, res) => {
  const brand = await MedicineBrand.findById(req.params.id);
  if (!brand) return res.status(404).json(new apiResponse(404, null, "Brand not found"));
  brand.isActive = !brand.isActive;
  await brand.save();
  return res.status(200).json(new apiResponse(200, { _id: brand._id, isActive: brand.isActive },
    `Brand ${brand.isActive ? "activated ✅" : "deactivated ❌"}`));
});

export const deleteBrand = asyncHandler(async (req, res) => {
  const brand = await MedicineBrand.findByIdAndDelete(req.params.id);
  if (!brand) return res.status(404).json(new apiResponse(404, null, "Brand not found"));
  return res.status(200).json(new apiResponse(200, null, "Brand deleted ✅"));
});

/* ═══════════════════════════════════════════════════════════
   CATEGORIES
═══════════════════════════════════════════════════════════ */

export const getAllCategories = asyncHandler(async (req, res) => {
  let { page = 1, limit = 20, search = "", isActive, isPagination = "true" } = req.query;
  page  = Math.max(1, parseInt(page));
  limit = Math.min(100, Math.max(1, parseInt(limit)));

  const match = {};
  if (isActive !== undefined) match.isActive = isActive === "true";
  if (search.trim()) match.name = { $regex: new RegExp(search.trim(), "i") };

  const total  = await MedicineCategory.countDocuments(match);
  let query = MedicineCategory.find(match).sort({ name: 1 });
  if (isPagination === "true") query = query.skip((page - 1) * limit).limit(limit);
  const categories = await query.lean();

  // Attach medicine count per category
  const catNames   = categories.map(c => c.name);
  const countDocs  = await Medicine.aggregate([
    { $match: { category: { $in: catNames } } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(countDocs.map(d => [d._id, d.count]));
  const catsWithCount = categories.map(c => ({ ...c, count: countMap[c.name] || 0 }));

  return res.status(200).json(new apiResponse(200, {
    categories: catsWithCount, total, totalPages: Math.ceil(total / limit), currentPage: page,
  }, "Categories fetched ✅"));
});

export const createCategory = asyncHandler(async (req, res) => {
  const { name, type } = req.body;
  if (!name?.trim()) return res.status(400).json(new apiResponse(400, null, "Category name is required"));

  const exists = await MedicineCategory.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, "i") } });
  if (exists) return res.status(400).json(new apiResponse(400, null, "Category already exists"));

  const category = await MedicineCategory.create({ name: name.trim(), type });
  return res.status(201).json(new apiResponse(201, category, "Category created ✅"));
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await MedicineCategory.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!category) return res.status(404).json(new apiResponse(404, null, "Category not found"));
  return res.status(200).json(new apiResponse(200, category, "Category updated ✅"));
});

export const toggleCategory = asyncHandler(async (req, res) => {
  const category = await MedicineCategory.findById(req.params.id);
  if (!category) return res.status(404).json(new apiResponse(404, null, "Category not found"));
  category.isActive = !category.isActive;
  await category.save();
  return res.status(200).json(new apiResponse(200, { _id: category._id, isActive: category.isActive },
    `Category ${category.isActive ? "activated ✅" : "deactivated ❌"}`));
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await MedicineCategory.findByIdAndDelete(req.params.id);
  if (!category) return res.status(404).json(new apiResponse(404, null, "Category not found"));
  return res.status(200).json(new apiResponse(200, null, "Category deleted ✅"));
});

/* ═══════════════════════════════════════════════════════════
   TAX / HSN CONFIG  (static list, seeded in DB if empty)
═══════════════════════════════════════════════════════════ */

const HSN_SEED = [
  { hsn: "3004", desc: "Medicaments (excluding goods of heading 3002, 3005 or 3006)", gst: "12", isActive: true },
  { hsn: "3002", desc: "Human blood; animal blood for therapeutic uses; antisera",     gst: "5",  isActive: true },
  { hsn: "3005", desc: "Wadding, gauze, bandages and similar articles",                gst: "5",  isActive: true },
  { hsn: "3006", desc: "Pharmaceutical goods specified in Note 4 to this Chapter",     gst: "12", isActive: true },
  { hsn: "2941", desc: "Antibiotics",                                                  gst: "5",  isActive: true },
  { hsn: "3001", desc: "Glands and other organs for organo-therapeutic uses",          gst: "0",  isActive: true },
];

export const getHsnList = asyncHandler(async (req, res) => {
  // Return static seed — no DB needed for HSN codes
  return res.status(200).json(new apiResponse(200, { hsnList: HSN_SEED }, "HSN list fetched ✅"));
});
