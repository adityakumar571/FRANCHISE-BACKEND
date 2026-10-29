/* eslint-disable */
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { getMedicineModel } from "../../../models/tenant/franchise/Medicine.model.js";
import { getMedicineBatchModel } from "../../../models/tenant/franchise/MedicineBatch.model.js";
import { getRackModel } from "../../../models/tenant/franchise/Rack.model.js";
import { getCounterModel } from "../../../models/tenant/franchise/Counter.model.js";
import SupplierMaster from "../../../models/SupplierMaster.model.js";

// ── GET /api/franchise/medicines?search=&category=&formulation=&company=&status=&page=&limit=&withLocation=
export const getMedicines = asyncHandler(async (req, res) => {
  // Defensive check for req.db
  if (!req.db) {
    console.error("❌ req.db is undefined in getMedicines");
    return res
      .status(500)
      .json(new apiResponse(500, null, "Database connection not initialized"));
  }

  const {
    search = "",
    category = "",
    formulation = "",
    company = "",
    status = "",
    page = 1,
    limit = 20,
    withLocation = false,
    rackId = "",
  } = req.query;
  const Medicine = getMedicineModel(req.db);

  const filter = {
    isActive:
      status !== "Inactive" ? (status === "Active" ? true : undefined) : false,
  };
  if (filter.isActive === undefined) delete filter.isActive;
  if (search)
    filter.$or = [
      { name: new RegExp(search, "i") },
      { salt: new RegExp(search, "i") },
      { genericName: new RegExp(search, "i") },
    ];
  if (category) filter.category = new RegExp(category, "i");
  if (formulation) filter.formulation = new RegExp(formulation, "i");
  if (company) filter.company = new RegExp(company, "i");
  if (rackId) filter["rackLocation.rackId"] = rackId;
  if (status === "Low Stock") {
    delete filter.isActive;
    filter.isActive = true;
    filter.$expr = { $lte: ["$currentStock", "$reorderLevel"] };
    filter.currentStock = { $gt: 0 };
  }

  const skip = (Number(page) - 1) * Number(limit);
  const Counter = getCounterModel(req.db);

  const [meds, total] = await Promise.all([
    Medicine.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Medicine.countDocuments(filter),
  ]);

  // Get unique category, formulation, company values from medicines (they will be names now)
  const allMeds = await Medicine.find({ isActive: true })
    .select("category formulation company")
    .lean();
  // (keeping these for backward compatibility, but will be overridden in response)

  const totalMeds = await Medicine.countDocuments({});
  const activeMeds = await Medicine.countDocuments({ isActive: true });
  const inactiveMeds = await Medicine.countDocuments({ isActive: false });
  const lowStock = await Medicine.countDocuments({
    $expr: { $lte: ["$currentStock", "$reorderLevel"] },
    currentStock: { $gt: 0 },
    isActive: true,
  });

  // Get category and company names from SupplierMaster for mapping IDs to names
  const categoryLookup = {};
  const companyLookup = {};
  const formulationLookup = {}; // ← Fetch full formulation objects
  const counterLookup = {}; // ← Fetch full counter objects

  try {
    const masters = await SupplierMaster.find({ isActive: true }).lean();
    masters.forEach((m) => {
      if (m.type === "category") categoryLookup[m._id.toString()] = m.name;
      if (m.type === "company") companyLookup[m._id.toString()] = m.name;
      if (m.type === "formulation") {
        // Store full object for formulation - lookup by BOTH ID and name
        const formulationObj = {
          _id: m._id.toString(),
          name: m.name,
          type: m.type,
        };
        formulationLookup[m._id.toString()] = formulationObj;
        formulationLookup[m.name] = formulationObj;
      }
    });
  } catch (e) {
    console.log("Master lookup failed:", e.message);
  }

  // Lookup counter objects
  try {
    const counters = await Counter.find({ isActive: true }).lean();
    counters.forEach((c) => {
      counterLookup[c._id.toString()] = {
        _id: c._id,
        name: c.name,
        code: c.code,
        isActive: c.isActive,
      };
    });
  } catch (e) {
    console.log("Counter lookup failed:", e.message);
  }

  const result = meds.map((m) => {
    // Map IDs to names if available, otherwise use as-is
    let categoryName = categoryLookup[String(m.category)] || m.category;
    let companyName = companyLookup[String(m.company)] || m.company;

    // Get full formulation object - try by ID first, then by name
    let formulationObj = formulationLookup[String(m.formulation)] ||
      formulationLookup[m.formulation] || {
        _id: m.formulation,
        name: m.formulation,
        type: "formulation",
      };

    // Get full counter object
    let counterObj = counterLookup[String(m.counterId)] || {
      _id: m.counterId,
      name: m.counterId,
      code: m.counterId,
      isActive: true,
    };

    return {
      _id: m._id,
      name: m.name,
      salt: m.salt,
      genericName: m.genericName,
      strength: m.strength,
      formulation: formulationObj, // ← Full object
      category: categoryName,
      company: companyName,
      packSize: m.packSize,
      mrp: m.mrp,
      purchasePrice: m.purchasePrice,
      gstPercent: m.gstPercent,
      currentStock: m.currentStock,
      reorderLevel: m.reorderLevel,
      sku: m.sku,
      barcode: m.barcode,
      imageUrl: m.imageUrl,
      counterId: counterObj, // ← Full object
      counterName: counterObj?.name || counterObj?.code || "—",
      rackLabel: m.rackLocation?.position || "—",
      rackLocation: m.rackLocation,
      isActive: m.isActive,
      stock: m.currentStock,
      status:
        m.currentStock <= 0
          ? "Out of Stock"
          : m.currentStock <= m.reorderLevel
            ? "Low Stock"
            : "In Stock",
    };
  });

  // ← Only include categories/formulations/companies + KPI if specifically requested (e.g., for AddMedicine)
  const response = {
    medicines: result,
    total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
  };

  // Only add categories/formulations/companies if not layout request
  if (!req.query.layout) {
    response.kpi = { totalMeds, activeMeds, inactiveMeds, lowStock };

    // Build unique dropdowns from masters (not from medicines)
    const uniqueCategories = new Set();
    const uniqueFormulations = new Set();
    const uniqueCompanies = new Set();

    try {
      const allMasters = await SupplierMaster.find({ isActive: true }).lean();
      allMasters.forEach((m) => {
        if (m.type === "category") uniqueCategories.add(m.name);
        if (m.type === "formulation") uniqueFormulations.add(m.name);
        if (m.type === "company") uniqueCompanies.add(m.name);
      });
    } catch (e) {
      console.log("Dropdown fetch failed:", e.message);
    }

    // Also add formulations from actual medicine records (in case they're stored as names/IDs not in masters)
    try {
      const allMeds = await Medicine.find({ isActive: true }).select("formulation").lean();
      allMeds.forEach((m) => {
        if (m.formulation) {
          uniqueFormulations.add(m.formulation);
        }
      });
    } catch (e) {
      console.log("Medicine formulation fetch failed:", e.message);
    }

    response.categories = [
      "All Categories",
      ...Array.from(uniqueCategories).sort(),
    ];
    response.formulations = [
      "All Formulations",
      ...Array.from(uniqueFormulations).sort(),
    ];
    response.companies = [
      "All Companies",
      ...Array.from(uniqueCompanies).sort(),
    ];
  }

  return res
    .status(200)
    .json(new apiResponse(200, response, "Medicines fetched"));
});

// ── POST /api/franchise/medicines
export const createMedicine = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const Rack = getRackModel(req.db);

  // Validate required fields
  if (!req.body.name || !req.body.salt || !req.body.mrp) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Name, Salt, and MRP are required"));
  }

  // NOTE: Batches are now optional - they can be added via GRN / Quick Stock Entry
  // If batches provided, they will be created; otherwise medicine will be created with empty batches
  const batches = req.body.batches || [];

  // Validate counter & rack - simplified approach
  // Frontend sends: { counterId, rackId } OR { rackLocation: { rackId, shelf, row, column } }
  let rackLocation = req.body.rackLocation;

  if (!rackLocation) {
    // NEW: Accept simple counterId + rackId from frontend
    if (!req.body.counterId || !req.body.rackId) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Counter and Rack are required"));
    }

    // Look up rack to get its code
    const rack = await Rack.findById(req.body.rackId).lean();
    if (!rack) {
      return res.status(400).json(new apiResponse(400, null, "Rack not found"));
    }

    // Auto-generate default rackLocation with shelves/rows/columns
    // Position format: RACK-CODE-1-A-1 (rackCode-shelf-row-column)
    rackLocation = {
      rackId: rack.code, // Use rack code (e.g. "RACK-A")
      shelf: 1, // Default shelf
      row: "A", // Default row
      column: 1, // Default column
      position: `${rack.code}-1-A-1`, // Auto-generated position
    };

    console.log(
      "🔧 [createMedicine] Auto-generated rackLocation:",
      rackLocation,
    );
  } else if (rackLocation && !rackLocation.position) {
    // If rackLocation provided but position missing, generate it
    const { rackId, shelf, row, column } = rackLocation;
    if (rackId && shelf && row && column) {
      rackLocation.position = `${rackId}-${shelf}-${row}-${column}`;
    }
  }

  // Check if barcode already exists (if provided)
  if (req.body.barcode) {
    const existing = await Medicine.findOne({ barcode: req.body.barcode });
    if (existing) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Barcode already exists"));
    }
  }

  // Get category, formulation, company names from SupplierMaster
  let categoryName = "",
    formulationName = "",
    companyName = "";

  if (req.body.categoryId) {
    try {
      const cat = await SupplierMaster.findById(req.body.categoryId)
        .select("name")
        .lean();
      if (cat) categoryName = cat.name;
    } catch (e) {
      console.log("Category lookup failed:", e.message);
    }
  }

  if (req.body.formulationId) {
    try {
      const form = await SupplierMaster.findById(req.body.formulationId)
        .select("name")
        .lean();
      if (form) formulationName = form.name;
    } catch (e) {
      console.log("Formulation lookup failed:", e.message);
    }
  }

  if (req.body.companyId) {
    try {
      const comp = await SupplierMaster.findById(req.body.companyId)
        .select("name")
        .lean();
      if (comp) companyName = comp.name;
    } catch (e) {
      console.log("Company lookup failed:", e.message);
    }
  }

  // Create medicine with batches
  const med = await Medicine.create({
    name: req.body.name,
    salt: req.body.salt,
    genericName: req.body.genericName || "",
    category: categoryName || req.body.categoryId || req.body.category || "", // Store name, fallback to ID
    formulation:
      formulationName || req.body.formulationId || req.body.formulation || "", // Store name, fallback to ID
    company: companyName || req.body.companyId || req.body.company || "",
    strength: req.body.strength || "",
    packSize: req.body.packSize || "",
    mrp: req.body.mrp,
    purchasePrice: req.body.purchasePrice || 0,
    gstPercent: req.body.gstPercent || 12,
    reorderLevel: req.body.reorderLevel || 20,
    barcode: req.body.barcode || "",
    imageUrl: req.body.imageUrl || "",
    sku: req.body.sku || "",
    counterId: req.body.counterId,
    rackLocation,
    batches: batches,
    isBatchTracked: true,
    createdBy: req.user?._id,
  });

  console.log(
    "✅ Medicine created:",
    med.name,
    "Counter:",
    req.body.counterId,
    "Rack:",
    req.body.rackId,
    "Location:",
    rackLocation.position,
    "Image:",
    med.imageUrl,
  );

  return res.status(201).json(
    new apiResponse(
      201,
      {
        _id: med._id,
        name: med.name,
        barcode: med.barcode,
        imageUrl: med.imageUrl, // ← ADD THIS
        counterId: med.counterId,
        rackLocation: med.rackLocation,
        currentStock: med.currentStock,
        batches: med.batches,
      },
      "Medicine created successfully",
    ),
  );
});

// ── PUT /api/franchise/medicines/:id
export const updateMedicine = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!med)
    return res
      .status(404)
      .json(new apiResponse(404, null, "Medicine not found"));
  return res.status(200).json(new apiResponse(200, med, "Medicine updated"));
});

// ── GET /api/franchise/medicines/:id
export const getMedicineById = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const Counter = getCounterModel(req.db);
  
  const med = await Medicine.findById(req.params.id).lean();
  if (!med)
    return res
      .status(404)
      .json(new apiResponse(404, null, "Medicine not found"));

  // Populate category, formulation, and counter with proper names/objects
  const categoryLookup = {};
  const companyLookup = {};
  const formulationLookup = {};
  const counterLookup = {};

  try {
    const masters = await SupplierMaster.find({ isActive: true }).lean();
    masters.forEach((m) => {
      if (m.type === "category") {
        categoryLookup[m._id.toString()] = { _id: m._id.toString(), name: m.name, type: m.type };
        categoryLookup[m.name] = { _id: m._id.toString(), name: m.name, type: m.type };
      }
      if (m.type === "company") {
        companyLookup[m._id.toString()] = { _id: m._id.toString(), name: m.name, type: m.type };
        companyLookup[m.name] = { _id: m._id.toString(), name: m.name, type: m.type };
      }
      if (m.type === "formulation") {
        const formulationObj = { _id: m._id.toString(), name: m.name, type: m.type };
        formulationLookup[m._id.toString()] = formulationObj;
        formulationLookup[m.name] = formulationObj;
      }
    });
  } catch (e) {
    console.log("Master lookup failed:", e.message);
  }

  // Lookup counter objects
  try {
    const counters = await Counter.find({ isActive: true }).lean();
    counters.forEach((c) => {
      counterLookup[c._id.toString()] = {
        _id: c._id,
        name: c.name,
        code: c.code,
        isActive: c.isActive,
      };
    });
  } catch (e) {
    console.log("Counter lookup failed:", e.message);
  }

  // Enrich medicine with populated objects
  // For formulation: if it's an ID, try to find the name from SupplierMaster
  let formulationObj = formulationLookup[String(med.formulation)] || formulationLookup[med.formulation];
  if (!formulationObj && med.formulation) {
    // Try to fetch from SupplierMaster by ID
    try {
      const formMaster = await SupplierMaster.findById(med.formulation).select("_id name type").lean();
      if (formMaster) {
        formulationObj = { _id: formMaster._id.toString(), name: formMaster.name, type: formMaster.type };
      }
    } catch (e) {
      console.log("Formulation lookup by ID failed:", e.message);
    }
  }
  if (!formulationObj) {
    formulationObj = { _id: med.formulation, name: med.formulation, type: "formulation" };
  }

  const enrichedMed = {
    ...med,
    category: categoryLookup[String(med.category)] || categoryLookup[med.category] || { _id: med.category, name: med.category, type: "category" },
    company: companyLookup[String(med.company)] || companyLookup[med.company] || { _id: med.company, name: med.company, type: "company" },
    formulation: formulationObj,
    counterId: counterLookup[String(med.counterId)] || { _id: med.counterId, name: med.counterId, code: med.counterId },
  };

  return res.status(200).json(new apiResponse(200, enrichedMed, "Medicine fetched"));
});

// ── PATCH /api/franchise/medicines/:id/status
export const toggleMedicineStatus = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id);
  if (!med)
    return res.status(404).json(new apiResponse(404, null, "Not found"));
  med.isActive = !med.isActive;
  await med.save();
  return res
    .status(200)
    .json(
      new apiResponse(
        200,
        { isActive: med.isActive },
        `Medicine ${med.isActive ? "activated" : "deactivated"}`,
      ),
    );
});

// ── GET /api/franchise/medicines/:id/batches
export const getMedicineBatches = asyncHandler(async (req, res) => {
  const MedicineBatch = getMedicineBatchModel(req.db);
  const batches = await MedicineBatch.find({
    medicineId: req.params.id,
    isActive: true,
  })
    .sort({ expiryDate: 1 })
    .lean();
  const now = new Date();
  const result = batches.map((b) => ({
    _id: b._id,
    batchNo: b.batchNo,
    expiryDate: new Date(b.expiryDate).toLocaleDateString("en-IN"),
    qty: b.qty,
    purchasePrice: b.purchasePrice,
    mrp: b.mrp,
    rackLabel: b.rackLabel,
    daysLeft: Math.ceil((new Date(b.expiryDate) - now) / 86400000),
  }));
  return res.status(200).json(new apiResponse(200, result, "Batches fetched"));
});

// ── GET /api/franchise/medicines/:id/alternatives
export const getAlternatives = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id).lean();
  if (!med)
    return res.status(404).json(new apiResponse(404, null, "Not found"));
  const alts = await Medicine.find({
    salt: med.salt,
    _id: { $ne: med._id },
    isActive: true,
  })
    .limit(10)
    .lean();
  return res
    .status(200)
    .json(new apiResponse(200, alts, "Alternatives fetched"));
});

// ── GET /api/franchise/medicines/:id/barcode
export const getMedicineBarcode = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id).lean();
  if (!med)
    return res.status(404).json(new apiResponse(404, null, "Not found"));
  return res.status(200).json(
    new apiResponse(
      200,
      {
        barcode: med.barcode || `MED${String(med._id).slice(-8).toUpperCase()}`,
        name: med.name,
        mrp: med.mrp,
        packSize: med.packSize,
      },
      "Barcode data fetched",
    ),
  );
});

// ── GET /api/franchise/generic-mapping?salt=
export const getGenericMapping = asyncHandler(async (req, res) => {
  const { salt = "" } = req.query;
  const Medicine = getMedicineModel(req.db);
  const meds = await Medicine.find({
    salt: new RegExp(salt, "i"),
    isActive: true,
  }).lean();
  const salts = [...new Set(meds.map((m) => m.salt).filter(Boolean))];
  return res.status(200).json(
    new apiResponse(
      200,
      {
        salt: salt || "All",
        medicines: meds.map((m) => ({
          _id: m._id,
          name: m.name,
          salt: m.salt,
          company: m.company,
          mrp: m.mrp,
        })),
        uniqueSalts: salts,
      },
      "Generic mapping fetched",
    ),
  );
});

// ── GET /api/franchise/rack-management
export const getRackManagement = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const Rack = getRackModel(req.db);
  const racks = await Rack.find({ isActive: true }).lean();
  const result = await Promise.all(
    racks.map(async (rack) => {
      // Fixed: Use rackLocation.rackId instead of rackLabel (which doesn't exist)
      const meds = await Medicine.find({
        "rackLocation.rackId": rack.code,
        isActive: true,
      }).lean();
      return {
        ...rack,
        medicines: meds.map((m) => ({
          _id: m._id,
          name: m.name,
          stock: m.currentStock,
        })),
      };
    }),
  );
  return res
    .status(200)
    .json(new apiResponse(200, result, "Rack management fetched"));
});

// ── PUT /api/franchise/rack-management/:rackId — assign medicine to rack
export const assignMedicineRack = asyncHandler(async (req, res) => {
  const { medicineId, rackLocation } = req.body;
  const Medicine = getMedicineModel(req.db);

  // Validate rackLocation structure
  if (!rackLocation || !rackLocation.rackId) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid rackLocation object required"));
  }

  // Update medicine with rackLocation object (not rackLabel string)
  await Medicine.findByIdAndUpdate(medicineId, { rackLocation });
  return res
    .status(200)
    .json(new apiResponse(200, { medicineId, rackLocation }, "Rack assigned"));
});

// ── GET /api/franchise/medicines/meta
// Return distinct categories, formulations, companies for dropdowns
export const getMedicineMeta = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const [categories, formulations, companies] = await Promise.all([
    Medicine.distinct("category"),
    Medicine.distinct("formulation"),
    Medicine.distinct("company"),
  ]);
  return res.status(200).json(
    new apiResponse(
      200,
      {
        categories: categories.filter(Boolean).sort(),
        formulations: formulations.filter(Boolean).sort(),
        companies: companies.filter(Boolean).sort(),
      },
      "Meta fetched",
    ),
  );
});

// ── GET /api/franchise/medicines/:id/generic
export const getMedicineGenericMapping = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id).lean();
  if (!med)
    return res.status(404).json(new apiResponse(404, null, "Not found"));
  // Find all medicines with same salt/genericName
  const generics = await Medicine.find({
    $or: [
      { salt: med.salt, salt: { $exists: true, $ne: "" } },
      { genericName: med.genericName, genericName: { $exists: true, $ne: "" } },
    ],
    _id: { $ne: med._id },
    isActive: true,
  })
    .select("name company mrp formulation salt genericName currentStock")
    .lean();
  return res
    .status(200)
    .json(
      new apiResponse(
        200,
        { medicine: med, generics },
        "Generic mapping fetched",
      ),
    );
});

// ── DELETE /api/franchise/medicines/:id/generic/:brandId
// Not applicable as generics are computed — return success
export const deleteGenericMapping = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new apiResponse(200, null, "Generic mapping removed"));
});

// ── DELETE /api/franchise/medicines/:id/alternatives/:altId
export const deleteAlternative = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id);
  if (!med)
    return res.status(404).json(new apiResponse(404, null, "Not found"));
  // Remove altId from alternatives array if it exists
  if (Array.isArray(med.alternatives)) {
    med.alternatives = med.alternatives.filter(
      (a) => String(a) !== req.params.altId,
    );
    await med.save();
  }
  return res
    .status(200)
    .json(new apiResponse(200, null, "Alternative removed"));
});

// ── GET /api/franchise/medicines/:id/images
export const getMedicineImages = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id).select("images").lean();
  if (!med)
    return res.status(404).json(new apiResponse(404, null, "Not found"));
  return res
    .status(200)
    .json(new apiResponse(200, { images: med.images || [] }, "Images fetched"));
});

// ── POST /api/franchise/medicines/:id/images  (multipart)
export const uploadMedicineImage = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id);
  if (!med)
    return res
      .status(404)
      .json(new apiResponse(404, null, "Medicine not found"));

  // If URL is provided directly (already uploaded)
  if (req.body.url) {
    if (!Array.isArray(med.images)) med.images = [];
    const img = {
      url: req.body.url,
      role: req.body.role || "primary",
      isPrimary: med.images.length === 0,
      createdAt: new Date(),
    };
    med.images.push(img);
    await med.save();
    return res.status(201).json(new apiResponse(201, img, "Image added"));
  }

  // Expect multer file upload
  if (!req.file) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Image file required"));
  }

  // Store file path - will integrate Cloudinary next
  const imageUrl = `/uploads/medicines/${req.file.filename}`;

  if (!Array.isArray(med.images)) med.images = [];

  // Push only URL string (schema expects [String])
  med.images.push(imageUrl);

  // Set as primary image if it's the first one
  if (!med.imageUrl) {
    med.imageUrl = imageUrl;
  }

  await med.save();

  // Return metadata for frontend
  const responseData = {
    url: imageUrl,
    isPrimary: med.imageUrl === imageUrl,
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    createdAt: new Date(),
  };

  return res
    .status(201)
    .json(new apiResponse(201, responseData, "Image uploaded successfully"));
});

// ── DELETE /api/franchise/medicines/:id/images/:imageId
export const deleteMedicineImage = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id);
  if (!med)
    return res.status(404).json(new apiResponse(404, null, "Not found"));

  if (Array.isArray(med.images)) {
    // imageId is the URL or index
    const imageUrl = decodeURIComponent(req.params.imageId);
    const initialLength = med.images.length;
    med.images = med.images.filter((img) => img !== imageUrl);

    // If primary image was deleted, set new primary
    if (med.imageUrl === imageUrl && med.images.length > 0) {
      med.imageUrl = med.images[0];
    }

    await med.save();

    if (med.images.length < initialLength) {
      return res.status(200).json(new apiResponse(200, null, "Image deleted"));
    }
  }
  return res.status(404).json(new apiResponse(404, null, "Image not found"));
});

// ── POST /api/franchise/medicines/:id/images/:imageId/set-primary
export const setPrimaryMedicineImage = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const med = await Medicine.findById(req.params.id);
  if (!med)
    return res.status(404).json(new apiResponse(404, null, "Not found"));

  const imageUrl = decodeURIComponent(req.params.imageId);

  // Check if image exists in array
  if (Array.isArray(med.images) && med.images.includes(imageUrl)) {
    med.imageUrl = imageUrl; // Set as primary
    await med.save();
    return res
      .status(200)
      .json(
        new apiResponse(200, { primaryImage: imageUrl }, "Primary image set"),
      );
  }

  return res.status(404).json(new apiResponse(404, null, "Image not found"));
});

// ══════════════════════════════════════════════════════════════════════════════
// NEW ENDPOINTS - Rack Location & Batch Management
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/franchise/medicines/racks/:rackId
// Get all medicines in a specific rack
export const getMedicinesByRack = asyncHandler(async (req, res) => {
  const { rackId } = req.params;
  const { shelf, row, column } = req.query;
  const Medicine = getMedicineModel(req.db);

  const filter = {
    "rackLocation.rackId": rackId,
    isActive: true,
  };

  if (shelf) filter["rackLocation.shelf"] = parseInt(shelf);
  if (row) filter["rackLocation.row"] = row;
  if (column) filter["rackLocation.column"] = parseInt(column);

  const medicines = await Medicine.find(filter)
    .sort({
      "rackLocation.shelf": 1,
      "rackLocation.row": 1,
      "rackLocation.column": 1,
    })
    .lean();

  return res.status(200).json(
    new apiResponse(
      200,
      {
        rackId,
        count: medicines.length,
        medicines: medicines.map((m) => ({
          _id: m._id,
          name: m.name,
          salt: m.salt,
          stock: m.currentStock,
          position: m.rackLocation?.position,
          shelf: m.rackLocation?.shelf,
          row: m.rackLocation?.row,
          column: m.rackLocation?.column,
          mrp: m.mrp,
          category: m.category,
        })),
      },
      "Medicines in rack fetched",
    ),
  );
});

// ── GET /api/franchise/medicines/search-by-location?position=
// Search medicine by exact position
export const searchByLocation = asyncHandler(async (req, res) => {
  const { position } = req.query;
  const Medicine = getMedicineModel(req.db);

  if (!position) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Position query parameter is required"));
  }

  const medicines = await Medicine.find({
    "rackLocation.position": position,
    isActive: true,
  }).lean();

  return res.status(200).json(
    new apiResponse(
      200,
      {
        position,
        count: medicines.length,
        medicines,
      },
      medicines.length > 0
        ? "Medicines found at position"
        : "No medicines at this position",
    ),
  );
});

// ── GET /api/franchise/medicines/occupied-slots?rackId=
// Returns all occupied positions in a given rack (for the slot grid in AddMedicine / EditMedicine)
export const getOccupiedSlots = asyncHandler(async (req, res) => {
  const { rackId } = req.query;
  const Medicine = getMedicineModel(req.db);

  if (!rackId) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "rackId query param required"));
  }

  const medicines = await Medicine.find({
    "rackLocation.rackId": rackId,
    isActive: true,
  })
    .select("_id name rackLocation")
    .lean();

  const slots = medicines
    .map((m) => ({
      medicineId: m._id,
      name: m.name,
      position: m.rackLocation?.position,
      shelf: m.rackLocation?.shelf,
      row: m.rackLocation?.row,
      column: m.rackLocation?.column,
    }))
    .filter((s) => s.position); // only include medicines that have a position set

  return res
    .status(200)
    .json(new apiResponse(200, slots, "Occupied slots fetched"));
});

// ── PUT /api/franchise/medicines/:id/location
// Update medicine rack location
export const updateMedicineLocation = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const { rackId, shelf, row, column } = req.body;

  if (!rackId || !shelf || !row || !column) {
    return res
      .status(400)
      .json(
        new apiResponse(
          400,
          null,
          "Complete location required: rackId, shelf, row, column",
        ),
      );
  }

  const position = `${rackId}-${shelf}-${row}-${column}`;

  const med = await Medicine.findByIdAndUpdate(
    req.params.id,
    {
      rackLocation: {
        rackId,
        shelf: parseInt(shelf),
        row,
        column: parseInt(column),
        position,
      },
      updatedBy: req.user?._id,
    },
    { new: true, runValidators: true },
  );

  if (!med)
    return res
      .status(404)
      .json(new apiResponse(404, null, "Medicine not found"));

  console.log("📍 Medicine location updated:", med.name, "to", position);

  return res.status(200).json(
    new apiResponse(
      200,
      {
        _id: med._id,
        name: med.name,
        rackLocation: med.rackLocation,
      },
      "Medicine location updated",
    ),
  );
});

// ── POST /api/franchise/medicines/:id/batch
// Add a new batch to existing medicine
export const addBatchToMedicine = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const {
    batchNo,
    mfgDate,
    expiryDate,
    quantity,
    mrp,
    purchasePrice,
    supplierName,
  } = req.body;

  if (!batchNo || !expiryDate || !quantity) {
    return res
      .status(400)
      .json(
        new apiResponse(
          400,
          null,
          "Batch number, expiry date, and quantity are required",
        ),
      );
  }

  const med = await Medicine.findById(req.params.id);
  if (!med)
    return res
      .status(404)
      .json(new apiResponse(404, null, "Medicine not found"));

  // Check if batch already exists
  const batchExists = med.batches.some((b) => b.batchNo === batchNo);
  if (batchExists) {
    return res
      .status(400)
      .json(
        new apiResponse(
          400,
          null,
          "Batch number already exists for this medicine",
        ),
      );
  }

  // Add new batch
  med.batches.push({
    batchNo,
    mfgDate: mfgDate || undefined,
    expiryDate,
    quantity: parseInt(quantity),
    availableQty: parseInt(quantity),
    mrp: parseFloat(mrp) || med.mrp,
    purchasePrice: parseFloat(purchasePrice) || med.purchasePrice,
    supplierName: supplierName || "",
    isActive: true,
  });

  await med.save();

  console.log(
    "📦 Batch added to",
    med.name,
    "- Batch:",
    batchNo,
    "Qty:",
    quantity,
  );

  return res.status(200).json(
    new apiResponse(
      200,
      {
        _id: med._id,
        name: med.name,
        currentStock: med.currentStock,
        batches: med.batches,
      },
      "Batch added successfully",
    ),
  );
});

// ── GET /api/franchise/medicines/expiring-soon?days=60
// Get medicines with batches expiring within specified days
export const getExpiringSoon = asyncHandler(async (req, res) => {
  const { days = 60 } = req.query;
  const Medicine = getMedicineModel(req.db);

  const expiryThreshold = new Date();
  expiryThreshold.setDate(expiryThreshold.getDate() + parseInt(days));
  const today = new Date();

  const medicines = await Medicine.find({
    isActive: true,
    "batches.isActive": true,
    "batches.availableQty": { $gt: 0 },
    "batches.expiryDate": {
      $gte: today,
      $lte: expiryThreshold,
    },
  }).lean();

  const result = [];
  medicines.forEach((med) => {
    med.batches.forEach((batch) => {
      if (batch.isActive && batch.availableQty > 0) {
        const expDate = new Date(batch.expiryDate);
        if (expDate >= today && expDate <= expiryThreshold) {
          const daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
          result.push({
            medicineId: med._id,
            medicineName: med.name,
            salt: med.salt,
            batchNo: batch.batchNo,
            expiryDate: batch.expiryDate,
            daysLeft,
            quantity: batch.availableQty,
            rackLocation: med.rackLocation?.position,
            category: med.category,
          });
        }
      }
    });
  });

  // Sort by days left (ascending)
  result.sort((a, b) => a.daysLeft - b.daysLeft);

  return res.status(200).json(
    new apiResponse(
      200,
      {
        count: result.length,
        expiringMedicines: result,
      },
      `Found ${result.length} batches expiring within ${days} days`,
    ),
  );
});

// ── GET /api/franchise/medicines/expired
// Get medicines with expired batches
export const getExpiredMedicines = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);
  const today = new Date();

  const medicines = await Medicine.find({
    isActive: true,
    "batches.isActive": true,
    "batches.expiryDate": { $lt: today },
  }).lean();

  const result = [];
  medicines.forEach((med) => {
    med.batches.forEach((batch) => {
      if (batch.isActive && new Date(batch.expiryDate) < today) {
        const daysExpired = Math.ceil(
          (today - new Date(batch.expiryDate)) / (1000 * 60 * 60 * 24),
        );
        result.push({
          medicineId: med._id,
          medicineName: med.name,
          salt: med.salt,
          batchNo: batch.batchNo,
          expiryDate: batch.expiryDate,
          daysExpired,
          quantity: batch.availableQty,
          rackLocation: med.rackLocation?.position,
          value: batch.availableQty * batch.purchasePrice,
        });
      }
    });
  });

  const totalValue = result.reduce((sum, item) => sum + item.value, 0);

  return res.status(200).json(
    new apiResponse(
      200,
      {
        count: result.length,
        totalValue,
        expiredMedicines: result,
      },
      `Found ${result.length} expired batches`,
    ),
  );
});

// ── POST /api/franchise/medicines/barcode/generate
// Generate unique barcode
export const generateBarcode = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);

  let barcode;
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 10) {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    barcode = `MED${timestamp}${random}`;

    exists = await Medicine.findOne({ barcode });
    attempts++;
  }

  if (exists) {
    return res
      .status(500)
      .json(new apiResponse(500, null, "Could not generate unique barcode"));
  }

  return res
    .status(200)
    .json(new apiResponse(200, { barcode }, "Barcode generated"));
});

// ── GET /api/franchise/medicines/rack-summary
// Get summary of all racks with medicine count
export const getRackSummary = asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(req.db);

  const summary = await Medicine.aggregate([
    {
      $match: {
        isActive: true,
        "rackLocation.rackId": { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: "$rackLocation.rackId",
        medicineCount: { $sum: 1 },
        totalStock: { $sum: "$currentStock" },
        totalValue: { $sum: { $multiply: ["$currentStock", "$mrp"] } },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  return res.status(200).json(
    new apiResponse(
      200,
      {
        racks: summary.map((s) => ({
          rackId: s._id,
          medicineCount: s.medicineCount,
          totalStock: s.totalStock,
          totalValue: Math.round(s.totalValue),
        })),
      },
      "Rack summary fetched",
    ),
  );
});
