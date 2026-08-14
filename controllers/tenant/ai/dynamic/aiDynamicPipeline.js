// dynamic/aiDynamicPipeline.js
import mongoose from "mongoose";

/* ══════════════════════════════════════════════════════════════
   SECURITY: allowed collections + stages + blocked fields
══════════════════════════════════════════════════════════════ */
export const ALLOWED_COLLECTIONS = new Set([
  // Core
  "studentenrolments","classes","sections","sessions","teachers",
  "streams","subjects",
  // Attendance & Homework & Notices
  "attendances","homeworks","notices",
  // Fee
  "feestructures","feeinstallments","installmenttypes",
  "additionalfees","additionalfeewaivers",
  "studentpayments","studentpaymentallocations",
  "latefees","latefeesettings",
  // Transport
  "transportfees","transportfeewaivers","studenttransports",
  "routemasters","routestops","busmasters","busroutes",
  // Exams & Results
  "examlists","exammasters","marksheets",
]);

export const ALLOWED_STAGES = new Set([
  "$match","$group","$project","$lookup","$unwind","$sort","$limit",
  "$skip","$addFields","$count","$bucket","$bucketAuto","$facet",
  "$replaceRoot","$set","$unset","$sample","$redact","$expr",
]);

export const BLOCKED_FIELDS = [
  "$out","$merge","$indexStats","$currentOp","$listSessions",
  "password","token","secret",
  "aadhaarNo","studentAdhaarNumber","fatherAdhaarNumber","motherAdhaarNumber",
  "gatewaySignature","gatewayPaymentId","gatewayOrderId",
  "phone","bankAccount","accountNumber","ifsc",
];

export function validatePipeline(collection, pipeline) {
  if (!ALLOWED_COLLECTIONS.has(collection.toLowerCase()))
    return `Collection "${collection}" not allowed`;
  if (!Array.isArray(pipeline) || pipeline.length === 0)
    return "Pipeline must be a non-empty array";
  if (pipeline.length > 20)
    return "Pipeline too long (max 20 stages)";

  const str = JSON.stringify(pipeline).toLowerCase();
  for (const b of BLOCKED_FIELDS)
    if (str.includes(b.toLowerCase())) return `Blocked field: "${b}"`;

  for (const stage of pipeline) {
    const key = Object.keys(stage)[0];
    if (!ALLOWED_STAGES.has(key)) return `Stage "${key}" not allowed`;
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════
   SANITIZE RAW ROWS — strip ObjectIds before sending to AI
══════════════════════════════════════════════════════════════ */
export const TECH_FIELDS = new Set([
  "_id", "sessionId", "classId", "sectionId", "studentId",
  "feeStructureId", "feeInstallmentId", "teacherId", "streamId",
  "examListId", "examMasterId", "paymentId", "referenceId",
  "routeId", "stopId", "busId", "transportFeeId", "additionalFeeId",
  "userId", "clerkId", "waivedBy", "siblingStudentId", "subjectId",
  "__v",
  // createdAt / updatedAt kept intentionally — used for "recent admissions" etc.
  // Only strip if the pipeline explicitly excludes them via $project
]);

export function sanitizeRows(rows) {
  if (!rows?.length) return rows;

  return rows.map(row => {
    const clean = {};
    for (const [key, value] of Object.entries(row)) {
      // Skip technical field names
      if (TECH_FIELDS.has(key)) continue;
      // Skip raw ObjectId objects
      if (value && typeof value === "object" && value._bsontype === "ObjectId") continue;
      // Skip 24-char hex strings (raw ObjectIds)
      if (typeof value === "string" && /^[a-f0-9]{24}$/.test(value)) continue;
      // Recursively sanitize nested objects/arrays
      if (Array.isArray(value)) {
        clean[key] = sanitizeRows(value);
      } else if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
        const nested = sanitizeRows([value]);
        clean[key] = nested[0];
      } else {
        clean[key] = value;
      }
    }
    return clean;
  });
}

/* ══════════════════════════════════════════════════════════════
   HYDRATE — { "$oid": "..." } → ObjectId, { "$date": "..." } → Date
══════════════════════════════════════════════════════════════ */
export function hydrate(obj) {
  if (Array.isArray(obj)) return obj.map(hydrate);
  if (obj && typeof obj === "object") {
    if ("$oid"  in obj) return new mongoose.Types.ObjectId(String(obj.$oid));
    if ("$date" in obj) return new Date(obj.$date);
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = hydrate(v);
    return out;
  }
  return obj;
}

/* ══════════════════════════════════════════════════════════════
   FALLBACK FORMATTER (when Mistral Pass-2 fails)
══════════════════════════════════════════════════════════════ */

/** Convert ISO date strings to DD-MM-YYYY (IST) */
function formatDateValue(val) {
  if (typeof val !== "string") return val;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
    try {
      const IST = 5.5 * 60 * 60 * 1000;
      const d   = new Date(new Date(val).getTime() + IST);
      return `${String(d.getUTCDate()).padStart(2,"0")}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${d.getUTCFullYear()}`;
    } catch { /* ignore */ }
  }
  return val;
}

export function fallbackFormat(rows, _description, lang) {
  const isHindi = lang !== "english";
  if (!rows?.length)
    return isHindi ? "Koi record nahi mila is query ke liye." : "No records found for this query.";

  const formatVal = (k, v) => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "number" && /amount|fee|paid|balance|collection|pending|due|total/i.test(k))
      return `₹${Number(v).toLocaleString("en-IN")}`;
    if (typeof v === "string") return formatDateValue(v);
    return String(v);
  };

  if (rows.length === 1) {
    const parts = Object.entries(rows[0]).map(([k, v]) => {
      const label = k.replace(/([A-Z])/g, " $1").trim();
      return `• **${label}:** ${formatVal(k, v)}`;
    });
    return parts.join("\n");
  }

  const lines = rows.slice(0, 25).map((r, i) => {
    const parts = Object.entries(r).map(([k, v]) => `${k}: ${formatVal(k, v)}`);
    return `${i + 1}. ${parts.join(" | ")}`;
  });
  if (rows.length > 25)
    lines.push(isHindi ? `...aur ${rows.length - 25} records hain` : `...and ${rows.length - 25} more`);
  return lines.join("\n");
}
