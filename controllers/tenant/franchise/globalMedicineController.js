/**
 * Global Medicine Import Controller
 * Tenant franchises can browse and import global medicines created by SuperAdmin
 */

import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { getMedicineModel } from "../../../models/tenant/franchise/Medicine.model.js";
import mongoose from "mongoose";

// ── GET /api/franchise/medicines/global-available
// List all global medicines available for import (with status: already imported or not)
export const getAvailableGlobalMedicines = asyncHandler(async (req, res) => {
  if (!req.db) {
    return res
      .status(500)
      .json(new apiResponse(500, null, "Database connection not initialized"));
  }

  const { search = "", page = 1, limit = 20 } = req.query;

  // Get global medicines from MAIN DB
  const GlobalMedicine = getMedicineModel(mongoose.connection);
  const TenantMedicine = getMedicineModel(req.db);

  try {
    // Fetch global medicines
    const filter = { isGlobal: true, isActive: true };
    if (search) {
      filter.$or = [
        { generic_name: new RegExp(search, "i") },
        { brand_names: new RegExp(search, "i") },
        { manufacturer: new RegExp(search, "i") },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [globalMedicines, totalGlobal] = await Promise.all([
      GlobalMedicine.find(filter)
        .select(
          "medicine_id generic_name brand_names manufacturer mrp medical_system primary_specialty dosage_adult"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      GlobalMedicine.countDocuments(filter),
    ]);

    // Check which ones are already imported in tenant DB
    const globalIds = globalMedicines.map((m) => m._id);
    const importedMedicines = await TenantMedicine.find({
      linkedGlobalMedicineId: { $in: globalIds },
    })
      .select("linkedGlobalMedicineId")
      .lean();

    const importedSet = new Set(
      importedMedicines.map((m) => m.linkedGlobalMedicineId.toString())
    );

    // Enrich response
    const enriched = globalMedicines.map((med) => ({
      ...med,
      globalId: med._id,
      _id: undefined,
      isImported: importedSet.has(med._id.toString()),
    }));

    return res.status(200).json(
      new apiResponse(
        200,
        {
          medicines: enriched,
          total: totalGlobal,
          totalPages: Math.ceil(totalGlobal / Number(limit)),
          currentPage: Number(page),
          imported: importedSet.size,
        },
        "Available global medicines fetched"
      )
    );
  } catch (error) {
    console.error("Error fetching global medicines:", error.message);
    return res
      .status(500)
      .json(new apiResponse(500, null, error.message));
  }
});

// ── POST /api/franchise/medicines/import-global/:globalMedicineId
// Import a single global medicine into tenant DB
export const importGlobalMedicine = asyncHandler(async (req, res) => {
  if (!req.db) {
    return res
      .status(500)
      .json(new apiResponse(500, null, "Database connection not initialized"));
  }

  const { globalMedicineId } = req.params;
  const { counterId, rackId, customMrp } = req.body;

  if (!mongoose.Types.ObjectId.isValid(globalMedicineId)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid global medicine ID"));
  }

  try {
    // Get global medicine from MAIN DB
    const GlobalMedicine = getMedicineModel(mongoose.connection);
    const TenantMedicine = getMedicineModel(req.db);

    const globalMed = await GlobalMedicine.findById(globalMedicineId).lean();
    if (!globalMed || !globalMed.isGlobal) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Global medicine not found"));
    }

    // Check if already imported
    const existing = await TenantMedicine.findOne({
      linkedGlobalMedicineId: globalMedicineId,
    });
    if (existing) {
      return res.status(400).json(
        new apiResponse(
          400,
          null,
          "This medicine is already imported to your pharmacy"
        )
      );
    }

    // Check for duplicate medicine_id in tenant DB
    if (globalMed.medicine_id) {
      const duplicateId = await TenantMedicine.findOne({
        medicine_id: globalMed.medicine_id,
      });
      if (duplicateId) {
        return res.status(400).json(
          new apiResponse(
            400,
            null,
            "Medicine ID already exists in your pharmacy"
          )
        );
      }
    }

    // Create local copy with link to global
    const tenantMedicine = await TenantMedicine.create({
      // Excel fields (from global)
      medicine_id: globalMed.medicine_id,
      generic_name: globalMed.generic_name,
      brand_names: globalMed.brand_names || [],
      manufacturer: globalMed.manufacturer,
      medical_system: globalMed.medical_system,
      primary_specialty: globalMed.primary_specialty,
      secondary_specialties: globalMed.secondary_specialties || [],
      patient_conditions: globalMed.patient_conditions || [],
      sub_category: globalMed.sub_category,
      formulation: globalMed.formulation,
      strength: globalMed.strength,

      // Basic fields (from global)
      name: globalMed.generic_name || globalMed.name,
      genericName: globalMed.generic_name || globalMed.genericName,
      brand: globalMed.brand_names?.[0],
      category: globalMed.sub_category || globalMed.category,
      company: globalMed.manufacturer || globalMed.company,

      // Pricing (can be customized)
      mrp: customMrp || globalMed.mrp,
      purchasePrice: globalMed.purchasePrice || 0,
      gstPercent: globalMed.gstPercent || 12,

      // Tenant-specific fields
      counterId: counterId || null,
      rackId: rackId || null,

      // Global sync fields
      linkedGlobalMedicineId: globalMedicineId,
      isLinkedToGlobal: true,
      globalMedicineData: {
        medicine_id: globalMed.medicine_id,
        generic_name: globalMed.generic_name,
        brand_names: globalMed.brand_names,
        manufacturer: globalMed.manufacturer,
        medical_system: globalMed.medical_system,
        primary_specialty: globalMed.primary_specialty,
        secondary_specialties: globalMed.secondary_specialties,
        patient_conditions: globalMed.patient_conditions,
        sub_category: globalMed.sub_category,
        indications_symptoms: globalMed.indications_symptoms,
        benefits_summary: globalMed.benefits_summary,
        common_side_effects: globalMed.common_side_effects,
        contraindications: globalMed.contraindications,
        drug_interactions: globalMed.drug_interactions,
        dosage_adult: globalMed.dosage_adult,
        dosage_pediatric: globalMed.dosage_pediatric,
        pregnancy_category: globalMed.pregnancy_category,
        storage_conditions: globalMed.storage_conditions,
        expiry_months: globalMed.expiry_months,
        vet_safe: globalMed.vet_safe,
        keywords_synonyms: globalMed.keywords_synonyms,
        regulatory_status: globalMed.regulatory_status,
        source: globalMed.source,
        notes: globalMed.notes,
        importedAt: new Date(),
      },

      isActive: true,
      createdBy: req.user?._id,
    });

    console.log(
      `✅ Medicine imported: ${tenantMedicine.name} from global ${globalMedicineId}`
    );

    return res.status(201).json(
      new apiResponse(
        201,
        {
          _id: tenantMedicine._id,
          name: tenantMedicine.name,
          genericName: tenantMedicine.genericName,
          mrp: tenantMedicine.mrp,
          linkedGlobalMedicineId: tenantMedicine.linkedGlobalMedicineId,
          importedAt: tenantMedicine.globalMedicineData.importedAt,
        },
        "Medicine imported successfully"
      )
    );
  } catch (error) {
    console.error("Import error:", error.message);
    return res
      .status(500)
      .json(new apiResponse(500, null, `Import failed: ${error.message}`));
  }
});

// ── POST /api/franchise/medicines/bulk-import-global
// Import multiple global medicines at once
export const bulkImportGlobalMedicines = asyncHandler(async (req, res) => {
  if (!req.db) {
    return res
      .status(500)
      .json(new apiResponse(500, null, "Database connection not initialized"));
  }

  const { globalMedicineIds = [], defaultCounterId, customPricing = {} } =
    req.body;

  if (!Array.isArray(globalMedicineIds) || globalMedicineIds.length === 0) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "No medicines specified"));
  }

  try {
    const GlobalMedicine = getMedicineModel(mongoose.connection);
    const TenantMedicine = getMedicineModel(req.db);

    const results = {
      imported: 0,
      failed: 0,
      imported_ids: [],
      errors: [],
    };

    for (const globalMedId of globalMedicineIds) {
      if (!mongoose.Types.ObjectId.isValid(globalMedId)) {
        results.errors.push({
          globalMedId,
          error: "Invalid ID format",
        });
        results.failed++;
        continue;
      }

      try {
        const globalMed = await GlobalMedicine.findById(globalMedId).lean();
        if (!globalMed || !globalMed.isGlobal) {
          results.errors.push({
            globalMedId,
            error: "Global medicine not found",
          });
          results.failed++;
          continue;
        }

        // Check if already imported
        const alreadyImported = await TenantMedicine.findOne({
          linkedGlobalMedicineId: globalMedId,
        });
        if (alreadyImported) {
          results.errors.push({
            globalMedId,
            error: "Already imported",
          });
          results.failed++;
          continue;
        }

        // Create import
        const tenantMed = await TenantMedicine.create({
          medicine_id: globalMed.medicine_id,
          generic_name: globalMed.generic_name,
          brand_names: globalMed.brand_names || [],
          manufacturer: globalMed.manufacturer,
          medical_system: globalMed.medical_system,
          name: globalMed.generic_name || globalMed.name,
          genericName: globalMed.generic_name,
          brand: globalMed.brand_names?.[0],
          category: globalMed.sub_category || globalMed.category,
          company: globalMed.manufacturer || globalMed.company,
          mrp: customPricing[globalMedId] || globalMed.mrp,
          counterId: defaultCounterId || null,
          linkedGlobalMedicineId: globalMedId,
          isLinkedToGlobal: true,
          globalMedicineData: {
            medicine_id: globalMed.medicine_id,
            generic_name: globalMed.generic_name,
            brand_names: globalMed.brand_names,
            manufacturer: globalMed.manufacturer,
            medical_system: globalMed.medical_system,
            primary_specialty: globalMed.primary_specialty,
            secondary_specialties: globalMed.secondary_specialties,
            patient_conditions: globalMed.patient_conditions,
            sub_category: globalMed.sub_category,
            indications_symptoms: globalMed.indications_symptoms,
            benefits_summary: globalMed.benefits_summary,
            common_side_effects: globalMed.common_side_effects,
            contraindications: globalMed.contraindications,
            drug_interactions: globalMed.drug_interactions,
            dosage_adult: globalMed.dosage_adult,
            dosage_pediatric: globalMed.dosage_pediatric,
            pregnancy_category: globalMed.pregnancy_category,
            storage_conditions: globalMed.storage_conditions,
            expiry_months: globalMed.expiry_months,
            vet_safe: globalMed.vet_safe,
            keywords_synonyms: globalMed.keywords_synonyms,
            regulatory_status: globalMed.regulatory_status,
            source: globalMed.source,
            notes: globalMed.notes,
            importedAt: new Date(),
          },
          isActive: true,
          createdBy: req.user?._id,
        });

        results.imported++;
        results.imported_ids.push(tenantMed._id);
      } catch (err) {
        results.errors.push({
          globalMedId,
          error: err.message,
        });
        results.failed++;
      }
    }

    console.log(`✅ Bulk import completed: ${results.imported} imported, ${results.failed} failed`);

    return res.status(200).json(
      new apiResponse(
        200,
        results,
        `${results.imported} medicines imported, ${results.failed} failed`
      )
    );
  } catch (error) {
    console.error("Bulk import error:", error.message);
    return res
      .status(500)
      .json(new apiResponse(500, null, `Bulk import failed: ${error.message}`));
  }
});

// ── GET /api/franchise/medicines/:id/check-global-update
// Check if global medicine has updates
export const checkGlobalMedicineUpdates = asyncHandler(async (req, res) => {
  if (!req.db) {
    return res
      .status(500)
      .json(new apiResponse(500, null, "Database connection not initialized"));
  }

  const { id } = req.params;

  try {
    const TenantMedicine = getMedicineModel(req.db);
    const GlobalMedicine = getMedicineModel(mongoose.connection);

    const tenantMed = await TenantMedicine.findById(id).lean();
    if (!tenantMed || !tenantMed.isLinkedToGlobal) {
      return res
        .status(404)
        .json(
          new apiResponse(
            404,
            null,
            "Medicine not linked to global or not found"
          )
        );
    }

    const globalMed = await GlobalMedicine.findById(
      tenantMed.linkedGlobalMedicineId
    ).lean();
    if (!globalMed) {
      return res.status(404).json(
        new apiResponse(404, null, "Original global medicine no longer available")
      );
    }

    // Compare key fields
    const fieldsToCheck = [
      "brand_names",
      "dosage_adult",
      "common_side_effects",
      "contraindications",
      "storage_conditions",
    ];

    const updates = {};
    let hasUpdates = false;

    fieldsToCheck.forEach((field) => {
      const globalVal = globalMed[field];
      const localVal = tenantMed.globalMedicineData?.[field];

      if (JSON.stringify(globalVal) !== JSON.stringify(localVal)) {
        updates[field] = {
          old: localVal,
          new: globalVal,
        };
        hasUpdates = true;
      }
    });

    return res.status(200).json(
      new apiResponse(
        200,
        {
          hasUpdates,
          updates,
          lastSyncedAt: tenantMed.globalMedicineData?.lastSyncedAt || null,
        },
        hasUpdates ? "Updates available" : "No updates available"
      )
    );
  } catch (error) {
    console.error("Check update error:", error.message);
    return res
      .status(500)
      .json(new apiResponse(500, null, error.message));
  }
});

// ── PATCH /api/franchise/medicines/:id/update-from-global
// Refresh specific fields from global medicine
export const updateMedicineFromGlobal = asyncHandler(async (req, res) => {
  if (!req.db) {
    return res
      .status(500)
      .json(new apiResponse(500, null, "Database connection not initialized"));
  }

  const { id } = req.params;
  const { fields = [], preserveLocal = [] } = req.body;

  if (!Array.isArray(fields) || fields.length === 0) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "No fields specified to update"));
  }

  try {
    const TenantMedicine = getMedicineModel(req.db);
    const GlobalMedicine = getMedicineModel(mongoose.connection);

    const tenantMed = await TenantMedicine.findById(id);
    if (!tenantMed || !tenantMed.isLinkedToGlobal) {
      return res
        .status(404)
        .json(
          new apiResponse(
            404,
            null,
            "Medicine not linked to global or not found"
          )
        );
    }

    const globalMed = await GlobalMedicine.findById(
      tenantMed.linkedGlobalMedicineId
    ).lean();
    if (!globalMed) {
      return res.status(404).json(
        new apiResponse(404, null, "Original global medicine no longer available")
      );
    }

    // Update specified fields (unless in preserveLocal list)
    const changes = {};
    for (const field of fields) {
      if (preserveLocal.includes(field)) {
        continue; // Skip if in preserve list
      }

      if (globalMed[field] !== undefined) {
        tenantMed[field] = globalMed[field];
        changes[field] = globalMed[field];
      }
    }

    // Update globalMedicineData snapshot
    tenantMed.globalMedicineData.lastSyncedAt = new Date();
    tenantMed.updatedBy = req.user?._id;

    await tenantMed.save();

    console.log(`✅ Medicine ${id} updated from global`);

    return res.status(200).json(
      new apiResponse(
        200,
        {
          _id: tenantMed._id,
          changes,
          updatedAt: tenantMed.updatedAt,
        },
        "Medicine updated from global"
      )
    );
  } catch (error) {
    console.error("Update from global error:", error.message);
    return res
      .status(500)
      .json(new apiResponse(500, null, error.message));
  }
});

// ── DELETE /api/franchise/medicines/:id/unlink-global
// Unlink medicine from global (but keep local copy)
export const unlinkFromGlobal = asyncHandler(async (req, res) => {
  if (!req.db) {
    return res
      .status(500)
      .json(new apiResponse(500, null, "Database connection not initialized"));
  }

  const { id } = req.params;
  const { action = "keep" } = req.body; // "keep" or "delete"

  try {
    const TenantMedicine = getMedicineModel(req.db);

    const tenantMed = await TenantMedicine.findById(id);
    if (!tenantMed) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Medicine not found"));
    }

    if (action === "delete") {
      await TenantMedicine.findByIdAndDelete(id);
      console.log(`✅ Medicine ${id} deleted`);
      return res.status(200).json(
        new apiResponse(200, null, "Medicine deleted successfully")
      );
    }

    // "keep" action
    tenantMed.linkedGlobalMedicineId = null;
    tenantMed.isLinkedToGlobal = false;
    tenantMed.globalMedicineData = null;
    tenantMed.updatedBy = req.user?._id;

    await tenantMed.save();

    console.log(`✅ Medicine ${id} unlinked from global`);

    return res.status(200).json(
      new apiResponse(
        200,
        {
          _id: tenantMed._id,
          linkedGlobalMedicineId: null,
          isLinkedToGlobal: false,
        },
        "Medicine unlinked from global"
      )
    );
  } catch (error) {
    console.error("Unlink error:", error.message);
    return res
      .status(500)
      .json(new apiResponse(500, null, error.message));
  }
});

// ── POST /api/franchise/medicines/import-all-global
// Bulk import ALL global medicines to franchise (useful for franchise setup)
export const bulkImportAllGlobalMedicines = asyncHandler(async (req, res) => {
  if (!req.db) {
    return res
      .status(500)
      .json(new apiResponse(500, null, "Database connection not initialized"));
  }

  try {
    const GlobalMedicine = getMedicineModel(mongoose.connection);
    const TenantMedicine = getMedicineModel(req.db);

    console.log("🔄 Starting bulk import of all global medicines...");

    // Fetch ALL global medicines
    const globalMedicines = await GlobalMedicine.find({
      isGlobal: true,
      isActive: true,
    })
      .select(
        "_id medicine_id name generic_name brand_names manufacturer medical_system mrp sub_category category strength formulation"
      )
      .lean();

    if (globalMedicines.length === 0) {
      return res.status(400).json(
        new apiResponse(400, null, "No global medicines found to import")
      );
    }

    // Get already imported medicines to skip duplicates
    const alreadyImported = await TenantMedicine.find({
      isLinkedToGlobal: true,
    })
      .select("linkedGlobalMedicineId")
      .lean();

    const importedSet = new Set(
      alreadyImported.map((m) => m.linkedGlobalMedicineId.toString())
    );

    // Filter out already imported
    const toImport = globalMedicines.filter(
      (med) => !importedSet.has(med._id.toString())
    );

    console.log(
      `📦 Found ${globalMedicines.length} global medicines, ${alreadyImported.length} already imported, importing ${toImport.length} new ones`
    );

    if (toImport.length === 0) {
      return res.status(200).json(
        new apiResponse(200, {
          total: globalMedicines.length,
          imported: alreadyImported.length,
          newImports: 0,
          message: "All global medicines already imported"
        }, "All medicines already imported")
      );
    }

    // Prepare medicines for batch insert
    const medicinesToCreate = toImport.map((globalMed) => ({
      medicine_id: globalMed.medicine_id,
      generic_name: globalMed.generic_name,
      brand_names: globalMed.brand_names || [],
      manufacturer: globalMed.manufacturer,
      medical_system: globalMed.medical_system,
      sub_category: globalMed.sub_category,
      formulation: globalMed.formulation,
      strength: globalMed.strength,
      name: globalMed.generic_name || globalMed.name,
      genericName: globalMed.generic_name,
      brand: globalMed.brand_names?.[0],
      category: globalMed.sub_category || globalMed.category,
      company: globalMed.manufacturer,
      mrp: globalMed.mrp,
      gstPercent: 12,
      linkedGlobalMedicineId: globalMed._id,
      isLinkedToGlobal: true,
      globalMedicineData: {
        medicine_id: globalMed.medicine_id,
        generic_name: globalMed.generic_name,
        brand_names: globalMed.brand_names,
        manufacturer: globalMed.manufacturer,
        medical_system: globalMed.medical_system,
        importedAt: new Date(),
      },
      isActive: true,
      createdBy: req.user?._id,
    }));

    // Batch insert in chunks of 1000
    const BATCH_SIZE = 1000;
    let totalInserted = 0;
    const errors = [];

    for (let i = 0; i < medicinesToCreate.length; i += BATCH_SIZE) {
      const batch = medicinesToCreate.slice(i, i + BATCH_SIZE);
      try {
        const result = await TenantMedicine.insertMany(batch, {
          ordered: false,
        });
        totalInserted += result.length;
        console.log(
          `✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: Inserted ${result.length} medicines`
        );
      } catch (batchError) {
        if (batchError.writeErrors) {
          batchError.writeErrors.forEach((err) => {
            errors.push({
              index: i + err.index,
              medicineId: batch[err.index]?.medicine_id,
              error: err.errmsg,
            });
          });
        }
        console.warn(`⚠️  Batch error (continuing):`, batchError.message);
      }
    }

    console.log(
      `✅ Bulk import complete: ${totalInserted} medicines imported, ${errors.length} errors`
    );

    return res.status(201).json(
      new apiResponse(201, {
        total: globalMedicines.length,
        alreadyImported: alreadyImported.length,
        newlyImported: totalInserted,
        failedInserts: errors.length,
        errors: errors.slice(0, 10), // First 10 errors
      }, `${totalInserted} medicines imported successfully`)
    );
  } catch (error) {
    console.error("Bulk import error:", error.message);
    return res
      .status(500)
      .json(new apiResponse(500, null, `Import failed: ${error.message}`));
  }
});
