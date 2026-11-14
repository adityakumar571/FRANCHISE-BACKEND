/* 
  MedicineMasterController.js
  
  Superadmin only - Create global medicines that all franchises can use
  Uses same Medicine model, but with isGlobal: true flag
  Stored in MAIN DB (uses mongoose.connection)
*/

import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { getMedicineModel } from "../models/tenant/franchise/Medicine.model.js";
import xlsx from "xlsx";
import mongoose from "mongoose";

// ── GET /api/superadmin/medicines?search=&page=&limit=&sortBy=&sortOrder=
export const getGlobalMedicines = asyncHandler(async (req, res) => {
  const {
    search = "",
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Validate pagination params
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20)); // Max 100 per page
  const sortDir = sortOrder === "asc" ? 1 : -1;

  // Use main DB connection
  const connection = mongoose.connection;

  if (!connection || connection.readyState !== 1) {
    return res
      .status(500)
      .json(new apiResponse(500, null, "Database connection not available"));
  }

  const Medicine = getMedicineModel(connection);

  const filter = {
    isGlobal: true,
    isActive: true,
  };

  if (search) {
    filter.$or = [
      { name: new RegExp(search, "i") },
      { genericName: new RegExp(search, "i") },
      { company: new RegExp(search, "i") },
      { brand_names: new RegExp(search, "i") },
    ];
  }

  const skip = (pageNum - 1) * limitNum;
  const sortObj = { [sortBy]: sortDir };

  const [medicines, total] = await Promise.all([
    Medicine.find(filter).sort(sortObj).skip(skip).limit(limitNum).lean(),
    Medicine.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limitNum);
  const hasNextPage = pageNum < totalPages;
  const hasPrevPage = pageNum > 1;

  return res.status(200).json(
    new apiResponse(
      200,
      {
        medicines,
        pagination: {
          total,
          totalPages,
          currentPage: pageNum,
          pageSize: limitNum,
          hasNextPage,
          hasPrevPage,
          skip,
        },
      },
      "Global medicines fetched successfully",
    ),
  );
});

// ── POST /api/superadmin/medicines
export const createGlobalMedicine = asyncHandler(async (req, res) => {
  const {
    medicine_id,
    generic_name,
    brand_names,
    manufacturer,
    medical_system,
    primary_specialty,
    secondary_specialties,
    patient_conditions,
    sub_category,
    formulation,
    strength,
    pack_size,
    mrp,
    prescription_required,
    indications_symptoms,
    benefits_summary,
    common_side_effects,
    contraindications,
    drug_interactions,
    dosage_adult,
    dosage_pediatric,
    pregnancy_category,
    storage_conditions,
    expiry_months,
    vet_safe,
    keywords_synonyms,
    regulatory_status,
    notes,
  } = req.body;

  if (!generic_name || !mrp) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "generic_name and mrp are required"));
  }

  const connection = mongoose.connection;
  if (!connection || connection.readyState !== 1) {
    return res
      .status(500)
      .json(new apiResponse(500, null, "Database connection not available"));
  }

  const Medicine = getMedicineModel(connection);

  const medicine = await Medicine.create({
    // Excel fields
    medicine_id,
    generic_name,
    brand_names: Array.isArray(brand_names)
      ? brand_names
      : brand_names?.split(",").map((b) => b.trim()),
    manufacturer,
    medical_system,
    primary_specialty,
    secondary_specialties: Array.isArray(secondary_specialties)
      ? secondary_specialties
      : secondary_specialties?.split(",").map((s) => s.trim()),
    patient_conditions: Array.isArray(patient_conditions)
      ? patient_conditions
      : patient_conditions?.split(",").map((p) => p.trim()),
    sub_category,
    formulation,
    strength,
    indications_symptoms,
    benefits_summary,
    common_side_effects: Array.isArray(common_side_effects)
      ? common_side_effects
      : common_side_effects?.split(",").map((s) => s.trim()),
    contraindications: Array.isArray(contraindications)
      ? contraindications
      : contraindications?.split(",").map((c) => c.trim()),
    drug_interactions: Array.isArray(drug_interactions)
      ? drug_interactions
      : drug_interactions?.split(",").map((d) => d.trim()),
    dosage_adult,
    dosage_pediatric,
    pregnancy_category,
    storage_conditions,
    expiry_months,
    vet_safe,
    keywords_synonyms: Array.isArray(keywords_synonyms)
      ? keywords_synonyms
      : keywords_synonyms?.split(",").map((k) => k.trim()),
    regulatory_status,
    notes,

    // Core fields
    name: generic_name,
    genericName: generic_name,
    brand: brand_names
      ? Array.isArray(brand_names)
        ? brand_names[0]
        : brand_names.split(",")[0]
      : undefined,
    packSize: pack_size,
    category: sub_category,
    company: manufacturer,
    mrp,
    requiresPrescription: prescription_required,
    prescription_required,

    isGlobal: true,
    isActive: true,
    createdBy: req.user?._id,
  });

  console.log("✅ Global medicine created:", medicine.generic_name);

  return res.status(201).json(
    new apiResponse(
      201,
      {
        _id: medicine._id,
        medicine_id: medicine.medicine_id,
        generic_name: medicine.generic_name,
      },
      "Medicine created successfully",
    ),
  );
});

// ── POST /api/superadmin/medicines/bulk-upload-chunk (Store chunk)
export const bulkUploadChunk = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Chunk file required"));
  }

  const { chunkIndex, totalChunks, fileName } = req.body;

  if (chunkIndex === undefined || !totalChunks || !fileName) {
    return res.status(400).json(new apiResponse(400, null, "Missing metadata"));
  }

  try {
    // Initialize session storage
    if (!req.session?.uploadChunks) {
      req.session.uploadChunks = {};
    }
    if (!req.session.uploadChunks[fileName]) {
      req.session.uploadChunks[fileName] = {
        chunks: {},
        totalChunks: parseInt(totalChunks),
      };
    }

    // Store chunk in session
    req.session.uploadChunks[fileName].chunks[chunkIndex] = req.file.buffer;
    const received = Object.keys(
      req.session.uploadChunks[fileName].chunks,
    ).length;

    console.log(
      `✅ Chunk ${parseInt(chunkIndex) + 1}/${totalChunks} (${received}/${totalChunks})`,
    );

    // Return 200 - chunk accepted
    return res
      .status(200)
      .json(
        new apiResponse(
          200,
          { chunkIndex, totalChunks, received },
          "Chunk uploaded",
        ),
      );
  } catch (error) {
    console.error("❌ Chunk error:", error.message);
    return res.status(500).json(new apiResponse(500, null, error.message));
  }
});

// ── POST /api/superadmin/medicines/bulk-upload-finalize (Process & insert)
export const bulkUploadFinalize = asyncHandler(async (req, res) => {
  const { fileName } = req.body;

  if (!fileName) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "fileName required"));
  }

  try {
    if (!req.session?.uploadChunks?.[fileName]) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Upload not found"));
    }

    const uploadData = req.session.uploadChunks[fileName];
    const chunks = Object.keys(uploadData.chunks).sort(
      (a, b) => parseInt(a) - parseInt(b),
    );

    if (chunks.length !== uploadData.totalChunks) {
      return res
        .status(400)
        .json(
          new apiResponse(
            400,
            null,
            `Incomplete: ${chunks.length}/${uploadData.totalChunks}`,
          ),
        );
    }

    console.log(`📤 Assembling ${chunks.length} chunks...`);

    // Assemble chunks - ensure all are Buffers
    const buffers = chunks.map((i) => {
      const chunk = uploadData.chunks[i];
      // Convert to Buffer if it's not already
      if (Buffer.isBuffer(chunk)) {
        return chunk;
      }
      if (
        typeof chunk === "object" &&
        chunk.data &&
        Array.isArray(chunk.data)
      ) {
        // If serialized, reconstruct from data array
        return Buffer.from(chunk.data);
      }
      // Fallback
      return Buffer.from(chunk);
    });

    const fullBuffer = Buffer.concat(buffers);

    console.log(
      `✅ Assembled: ${(fullBuffer.length / 1024 / 1024).toFixed(2)}MB`,
    );

    // Parse Excel
    const workbook = xlsx.read(fullBuffer, { type: "buffer" });
    const data = xlsx.utils.sheet_to_json(
      workbook.Sheets[workbook.SheetNames[0]],
    );

    if (!data.length) {
      delete req.session.uploadChunks[fileName];
      return res.status(400).json(new apiResponse(400, null, "Empty file"));
    }

    const connection = mongoose.connection;
    if (!connection?.readyState) {
      return res.status(500).json(new apiResponse(500, null, "DB error"));
    }

    const Medicine = getMedicineModel(connection);
    const MEDICAL_SYSTEM_ENUM = [
      "Allopathy",
      "Ayurveda",
      "Homeopathy",
      "Unani",
      "Siddha",
    ];
    const REGULATORY_STATUS_ENUM = ["Approved", "Under Review", "Banned"];

    // Validate & build medicines array
    const medicines = [];
    const skippedRows = [];

    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex];
      const genericName = row.generic_name?.trim();
      const mrpRaw = row.mrp;

      if (!genericName || !mrpRaw) {
        skippedRows.push({
          row: rowIndex + 2,
          reason: !genericName ? "Missing generic_name" : "Missing mrp",
        });
        continue;
      }

      const mrp = parseFloat(mrpRaw);
      if (isNaN(mrp) || mrp <= 0) {
        skippedRows.push({
          row: rowIndex + 2,
          reason: `Invalid mrp: "${mrpRaw}"`,
        });
        continue;
      }

      medicines.push({
        medicine_id: row.medicine_id?.trim(),
        generic_name: genericName,
        brand_names: row.brand_names
          ? row.brand_names
              .split(",")
              .map((b) => b.trim())
              .filter((b) => b)
          : [],
        manufacturer: row.manufacturer?.trim(),
        medical_system: MEDICAL_SYSTEM_ENUM.includes(row.medical_system?.trim())
          ? row.medical_system.trim()
          : "Allopathy",
        primary_specialty: row.primary_specialty?.trim(),
        secondary_specialties: row.secondary_specialties
          ? row.secondary_specialties
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s)
          : [],
        patient_conditions: row.patient_conditions
          ? row.patient_conditions
              .split(",")
              .map((p) => p.trim())
              .filter((p) => p)
          : [],
        sub_category: row.sub_category?.trim(),
        indications_symptoms: row.indications_symptoms?.trim(),
        benefits_summary: row.benefits_summary?.trim(),
        common_side_effects: row.common_side_effects
          ? row.common_side_effects
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s)
          : [],
        contraindications: row.contraindications
          ? row.contraindications
              .split(",")
              .map((c) => c.trim())
              .filter((c) => c)
          : [],
        drug_interactions: row.drug_interactions
          ? row.drug_interactions
              .split(",")
              .map((d) => d.trim())
              .filter((d) => d)
          : [],
        dosage_adult: row.dosage_adult?.trim(),
        dosage_pediatric: row.dosage_pediatric?.trim(),
        pregnancy_category: row.pregnancy_category?.trim(),
        storage_conditions: row.storage_conditions?.trim(),
        expiry_months: parseInt(row.expiry_months) || undefined,
        vet_safe: row.vet_safe?.toLowerCase() === "yes",
        keywords_synonyms: row.keywords_synonyms
          ? row.keywords_synonyms
              .split(",")
              .map((k) => k.trim())
              .filter((k) => k)
          : [],
        regulatory_status: REGULATORY_STATUS_ENUM.includes(
          row.regulatory_status?.trim(),
        )
          ? row.regulatory_status.trim()
          : "Approved",
        source: row.source?.trim(),
        notes: row.notes?.trim(),
        name: genericName,
        genericName,
        brand: row.brand_names
          ? row.brand_names.split(",")[0].trim()
          : undefined,
        strength: row.strength?.trim(),
        formulation: row.formulation?.trim(),
        category: row.sub_category?.trim(),
        company: row.manufacturer?.trim(),
        mrp,
        requiresPrescription:
          row.prescription_required?.toLowerCase() === "yes",
        prescription_required:
          row.prescription_required?.toLowerCase() === "yes",
        isGlobal: true,
        isActive: true,
        createdBy: req.user?._id,
      });
    }

    if (!medicines.length) {
      delete req.session.uploadChunks[fileName];
      return res.status(201).json(
        new apiResponse(
          201,
          {
            uploaded_count: 0,
            total_count: data.length,
            skipped_count: data.length,
          },
          "No valid medicines",
        ),
      );
    }

    // Batch insert
    const BATCH_SIZE = 100;
    let insertedCount = 0;
    const totalBatches = Math.ceil(medicines.length / BATCH_SIZE);

    console.log(`🔄 Inserting ${medicines.length} medicines...`);

    for (let i = 0; i < medicines.length; i += BATCH_SIZE) {
      const batch = medicines.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      try {
        const result = await Medicine.insertMany(batch, { ordered: false });
        insertedCount += result.length;
        console.log(
          `✅ Batch ${batchNum}/${totalBatches}: ${result.length}/${batch.length}`,
        );
      } catch (batchError) {
        if (batchError.code === 11000 && batchError.result?.insertedIds) {
          insertedCount += batchError.result.insertedIds.length;
        }
      }

      if (batchNum % 5 === 0 && batchNum < totalBatches) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    delete req.session.uploadChunks[fileName];

    console.log(`✅ Complete: ${insertedCount} inserted`);

    return res.status(201).json(
      new apiResponse(
        201,
        {
          uploaded_count: insertedCount,
          total_count: data.length,
          skipped_count: skippedRows.length,
          skipped_details: skippedRows.slice(0, 10),
        },
        `✅ ${insertedCount}/${data.length} uploaded`,
      ),
    );
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (req.session?.uploadChunks?.[fileName]) {
      delete req.session.uploadChunks[fileName];
    }
    return res.status(500).json(new apiResponse(500, null, error.message));
  }
});
export const bulkUploadMedicines = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Excel file is required"));
  }

  // Check file size upfront
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB for safety
  if (req.file.size > MAX_FILE_SIZE) {
    return res
      .status(413)
      .json(
        new apiResponse(
          413,
          null,
          `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
        ),
      );
  }

  try {
    console.log(
      `📥 Processing file: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)}MB)`,
    );

    // Read from memory buffer (memoryStorage)
    const buffer = req.file.buffer;
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Use stream-like reading for large files
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Excel file is empty"));
    }

    console.log(`📊 Total rows to process: ${data.length}`);

    const connection = mongoose.connection;
    if (!connection || connection.readyState !== 1) {
      return res
        .status(500)
        .json(new apiResponse(500, null, "Database connection not available"));
    }

    const Medicine = getMedicineModel(connection);

    // ── Enum values ──
    const MEDICAL_SYSTEM_ENUM = [
      "Allopathy",
      "Ayurveda",
      "Homeopathy",
      "Unani",
      "Siddha",
    ];
    const REGULATORY_STATUS_ENUM = ["Approved", "Under Review", "Banned"];
    const DEFAULT_MEDICAL_SYSTEM = "Allopathy";
    const DEFAULT_REGULATORY_STATUS = "Approved";

    // ── Parse and validate with skipping logic ──
    // Process in chunks to avoid memory overload
    const PARSE_CHUNK_SIZE = 1000; // Parse 1000 rows at a time
    const medicines = [];
    const skippedRows = [];
    let parsedCount = 0;

    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex];
      const excelRowNumber = rowIndex + 2;

      // Required fields validation
      const genericName = row.generic_name?.trim();
      const mrpRaw = row.mrp;

      if (!genericName) {
        skippedRows.push({
          row: excelRowNumber,
          reason: "Missing generic_name",
          data: { generic_name: row.generic_name, mrp: row.mrp },
        });
        continue;
      }

      if (!mrpRaw) {
        skippedRows.push({
          row: excelRowNumber,
          reason: "Missing mrp",
          data: { generic_name: genericName },
        });
        continue;
      }

      // Parse MRP safely
      const mrp = parseFloat(mrpRaw);
      if (isNaN(mrp) || mrp <= 0) {
        skippedRows.push({
          row: excelRowNumber,
          reason: `Invalid mrp: "${mrpRaw}" (must be positive number)`,
          data: { generic_name: genericName, mrp: mrpRaw },
        });
        continue;
      }

      // Parse expiry_months safely
      let expiryMonths = undefined;
      if (row.expiry_months) {
        expiryMonths = parseInt(row.expiry_months, 10);
        if (isNaN(expiryMonths)) {
          expiryMonths = undefined;
        }
      }

      // Validate and default medical_system
      let medicalSystem = row.medical_system?.trim() || DEFAULT_MEDICAL_SYSTEM;
      if (!MEDICAL_SYSTEM_ENUM.includes(medicalSystem)) {
        medicalSystem = DEFAULT_MEDICAL_SYSTEM;
      }

      // Validate and default regulatory_status
      let regulatoryStatus =
        row.regulatory_status?.trim() || DEFAULT_REGULATORY_STATUS;
      if (!REGULATORY_STATUS_ENUM.includes(regulatoryStatus)) {
        regulatoryStatus = DEFAULT_REGULATORY_STATUS;
      }

      // Build medicine object
      medicines.push({
        medicine_id: row.medicine_id?.trim(),
        generic_name: genericName,
        brand_names: row.brand_names
          ? row.brand_names
              .split(",")
              .map((b) => b.trim())
              .filter((b) => b)
          : [],
        manufacturer: row.manufacturer?.trim(),
        medical_system: medicalSystem,
        primary_specialty: row.primary_specialty?.trim(),
        secondary_specialties: row.secondary_specialties
          ? row.secondary_specialties
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s)
          : [],
        patient_conditions: row.patient_conditions
          ? row.patient_conditions
              .split(",")
              .map((p) => p.trim())
              .filter((p) => p)
          : [],
        sub_category: row.sub_category?.trim(),
        indications_symptoms: row.indications_symptoms?.trim(),
        benefits_summary: row.benefits_summary?.trim(),
        common_side_effects: row.common_side_effects
          ? row.common_side_effects
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s)
          : [],
        contraindications: row.contraindications
          ? row.contraindications
              .split(",")
              .map((c) => c.trim())
              .filter((c) => c)
          : [],
        drug_interactions: row.drug_interactions
          ? row.drug_interactions
              .split(",")
              .map((d) => d.trim())
              .filter((d) => d)
          : [],
        dosage_adult: row.dosage_adult?.trim(),
        dosage_pediatric: row.dosage_pediatric?.trim(),
        pregnancy_category: row.pregnancy_category?.trim(),
        storage_conditions: row.storage_conditions?.trim(),
        expiry_months: expiryMonths,
        vet_safe: row.vet_safe?.toLowerCase() === "yes",
        keywords_synonyms: row.keywords_synonyms
          ? row.keywords_synonyms
              .split(",")
              .map((k) => k.trim())
              .filter((k) => k)
          : [],
        regulatory_status: regulatoryStatus,
        source: row.source?.trim(),
        last_updated: new Date(),
        notes: row.notes?.trim(),
        name: genericName,
        genericName,
        brand: row.brand_names
          ? row.brand_names.split(",")[0].trim()
          : undefined,
        strength: row.strength?.trim(),
        formulation: row.formulation?.trim(),
        category: row.sub_category?.trim(),
        company: row.manufacturer?.trim(),
        mrp,
        requiresPrescription:
          row.prescription_required?.toLowerCase() === "yes",
        prescription_required:
          row.prescription_required?.toLowerCase() === "yes",
        isGlobal: true,
        isActive: true,
        createdBy: req.user?._id,
      });

      parsedCount++;
      if (parsedCount % PARSE_CHUNK_SIZE === 0) {
        console.log(
          `✅ Parsed ${parsedCount}/${data.length} rows (${((parsedCount / data.length) * 100).toFixed(1)}%)`,
        );
      }
    }

    if (medicines.length === 0) {
      return res.status(400).json(
        new apiResponse(
          400,
          {
            uploaded_count: 0,
            skipped_count: data.length,
            total_count: data.length,
            skipped_details: skippedRows.slice(0, 10),
            has_more_skipped: skippedRows.length > 10,
            total_skipped: skippedRows.length,
          },
          "No valid medicines found in file - all rows were skipped",
        ),
      );
    }

    // ── Batch insert (100 records per batch, skip duplicates silently) ──
    const BATCH_SIZE = 100;
    let insertedCount = 0;
    const insertErrors = [];
    const duplicateSkipped = [];
    const totalBatches = Math.ceil(medicines.length / BATCH_SIZE);

    console.log(
      `🔄 Starting batch processing: ${totalBatches} batches of ${BATCH_SIZE} records`,
    );

    for (let i = 0; i < medicines.length; i += BATCH_SIZE) {
      const batch = medicines.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      try {
        // Insert with ordered: false to continue on duplicate
        const result = await Medicine.insertMany(batch, { ordered: false });
        insertedCount += result.length;

        const progress = ((batchNum / totalBatches) * 100).toFixed(1);
        console.log(
          `✅ Batch ${batchNum}/${totalBatches} (${progress}%): Inserted ${result.length}/${batch.length}`,
        );
      } catch (batchError) {
        if (batchError.code === 11000) {
          // Duplicate key error - handled gracefully
          if (batchError.result?.insertedIds) {
            const inserted = batchError.result.insertedIds.length;
            insertedCount += inserted;
            const skipped = batch.length - inserted;
            duplicateSkipped.push({
              batch: batchNum,
              skipped_due_to_duplicate: skipped,
              message: `${inserted} inserted, ${skipped} duplicates skipped`,
            });
            console.log(
              `⚠️  Batch ${batchNum}: ${inserted} inserted, ${skipped} duplicates`,
            );
          } else {
            duplicateSkipped.push({
              batch: batchNum,
              skipped_due_to_duplicate: batch.length,
              message: `All ${batch.length} records were duplicates`,
            });
            console.log(`⚠️  Batch ${batchNum}: All records were duplicates`);
          }
        } else {
          // Other errors
          if (batchError.writeErrors) {
            batchError.writeErrors.forEach((err) => {
              insertErrors.push({
                batch: batchNum,
                generic_name: batch[err.index]?.generic_name,
                error: err.errmsg || err.message,
              });
            });
          } else {
            insertErrors.push({
              batch: batchNum,
              error: batchError.message,
            });
          }
          console.error(`❌ Batch ${batchNum} error:`, batchError.message);
        }
      }

      // Pause every 5 batches for stability
      if (batchNum % 5 === 0 && batchNum < totalBatches) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        console.log(
          `⏸️  Batch ${batchNum}: System pause (database stabilization)`,
        );
      }
    }

    const summary = {
      uploaded_count: insertedCount,
      validation_skipped_count: skippedRows.length,
      duplicate_batch_summary: duplicateSkipped,
      total_count: data.length,
      skipped_details: skippedRows.slice(0, 10),
      insert_errors: insertErrors.slice(0, 10),
      has_more_skipped: skippedRows.length > 10,
      has_more_errors: insertErrors.length > 10,
      total_validation_skipped: skippedRows.length,
      total_other_errors: insertErrors.length,
      processing_stats: {
        total_batches: totalBatches,
        batch_size: BATCH_SIZE,
        file_size_mb: (req.file.size / 1024 / 1024).toFixed(2),
        total_rows_parsed: parsedCount,
      },
    };

    console.log(`✅ Upload Complete:
      ✓ Total: ${data.length}
      ✓ Inserted: ${insertedCount}
      ✓ Validation Skipped: ${skippedRows.length}
      ✓ Duplicate Skipped: ${duplicateSkipped.reduce((sum, b) => sum + b.skipped_due_to_duplicate, 0)}
      ✓ Other Errors: ${insertErrors.length}`);

    return res
      .status(201)
      .json(
        new apiResponse(
          201,
          summary,
          `✅ ${insertedCount}/${data.length} medicines uploaded successfully`,
        ),
      );
  } catch (error) {
    console.error("❌ Bulk upload error:", error);
    return res
      .status(500)
      .json(new apiResponse(500, null, `Upload failed: ${error.message}`));
  }
});

// ── GET /api/superadmin/medicines/:id
export const getGlobalMedicineById = asyncHandler(async (req, res) => {
  const connection = mongoose.connection;
  if (!connection || connection.readyState !== 1) {
    return res
      .status(500)
      .json(new apiResponse(500, null, "Database connection not available"));
  }
  const Medicine = getMedicineModel(connection);

  const medicine = await Medicine.findById(req.params.id);
  if (!medicine || !medicine.isGlobal) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Medicine not found"));
  }

  return res
    .status(200)
    .json(new apiResponse(200, medicine, "Medicine fetched"));
});

// ── PUT /api/superadmin/medicines/:id
export const updateGlobalMedicine = asyncHandler(async (req, res) => {
  const connection = mongoose.connection;
  if (!connection || connection.readyState !== 1) {
    return res
      .status(500)
      .json(new apiResponse(500, null, "Database connection not available"));
  }
  const Medicine = getMedicineModel(connection);

  const medicine = await Medicine.findByIdAndUpdate(
    req.params.id,
    {
      ...req.body,
      updatedBy: req.user?._id,
    },
    { new: true, runValidators: true },
  );

  if (!medicine || !medicine.isGlobal) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Medicine not found"));
  }

  console.log("✅ Global medicine updated:", medicine.name);

  return res
    .status(200)
    .json(new apiResponse(200, medicine, "Medicine updated successfully"));
});

// ── DELETE /api/superadmin/medicines/:id
export const deleteGlobalMedicine = asyncHandler(async (req, res) => {
  const connection = mongoose.connection;
  if (!connection || connection.readyState !== 1) {
    return res
      .status(500)
      .json(new apiResponse(500, null, "Database connection not available"));
  }
  const Medicine = getMedicineModel(connection);

  const medicine = await Medicine.findByIdAndDelete(req.params.id);
  if (!medicine || !medicine.isGlobal) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Medicine not found"));
  }

  return res
    .status(200)
    .json(new apiResponse(200, null, "Medicine deleted successfully"));
});

// ── GET /api/superadmin/medicines/export/excel
export const exportMedicinesToExcel = asyncHandler(async (req, res) => {
  const connection = mongoose.connection;
  if (!connection || connection.readyState !== 1) {
    return res
      .status(500)
      .json(new apiResponse(500, null, "Database connection not available"));
  }
  const Medicine = getMedicineModel(connection);

  const medicines = await Medicine.find({
    isGlobal: true,
    isActive: true,
  }).lean();

  if (medicines.length === 0) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "No medicines to export"));
  }

  const data = medicines.map((m) => ({
    medicine_id: m.medicine_id,
    generic_name: m.generic_name,
    brand_names: Array.isArray(m.brand_names)
      ? m.brand_names.join(", ")
      : m.brand_names,
    manufacturer: m.manufacturer,
    strength: m.strength,
    formulation: m.formulation,
    category: m.sub_category,
    company: m.company,
    packSize: m.packSize,
    mrp: m.mrp,
    requiresPrescription: m.requiresPrescription ? "Yes" : "No",
    medical_system: m.medical_system,
    primary_specialty: m.primary_specialty,
    dosage_adult: m.dosage_adult,
    storage_conditions: m.storage_conditions,
  }));

  const worksheet = xlsx.utils.json_to_sheet(data);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Medicines");

  // Generate Excel buffer
  const buffer = xlsx.write(workbook, { bookType: "xlsx", type: "buffer" });

  // Set response headers
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=MedicineMaster_${Date.now()}.xlsx`,
  );

  return res.status(200).send(buffer);
});
