import mongoose from "mongoose";

/**
 * ConductCertificate Model
 * Serial No is assigned in the controller (not via pre-save hook)
 * because multi-tenant dynamic connections don't support
 * post-compile schema hooks reliably.
 */
const ConductCertificateSchema = new mongoose.Schema(
  {
    /* ── Certificate Type ── */
    type: {
      type: String,
      enum: ["character", "transfer"],
      default: "character",
      index: true,
    },

    /* ── Serial / Reference ── */
    serialNo: {
      type: Number,
      // assigned in controller before .create()
    },
    refNo: {
      type: String,
      trim: true,
    },

    /* ── School info (snapshot so cert is self-contained) ── */
    schoolName:       { type: String, trim: true },
    schoolSubtitle:   { type: String, trim: true },
    schoolInfo:       { type: String, trim: true },
    estd:             { type: String, trim: true },
    affiliationNo:    { type: String, trim: true },   // CBSE affiliation number
    schoolCode:       { type: String, trim: true },   // School code
    schoolPhone:      { type: String, trim: true },   // School phone number
    schoolEmail:      { type: String, trim: true },   // School email
    bookNo:           { type: String, trim: true },   // TC book number
    slNo:             { type: String, trim: true },   // SL No
    registrationNo:   { type: String, trim: true },   // Registration No
    renewedUpto:      { type: String, trim: true },   // License renewed upto
    statusOfSchool:   { type: String, trim: true },   // e.g. Secondary/Sr Secondary

    /* ── Student reference ── */
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentEnrolment",
      required: true,
    },

    /* ── Student snapshot fields ── */
    studentName:    { type: String, required: true, trim: true },
    admissionNo:    { type: String, trim: true },
    category:       { type: String, trim: true },   // SC/ST/OBC/General
    relation: {
      type: String,
      enum: ["Son", "Daughter", "Ward"],
      default: "Son",
    },
    fatherName:          { type: String, trim: true },
    motherName:          { type: String, trim: true },
    dateOfBirth:         { type: String, trim: true },
    dateOfBirthInWords:  { type: String, trim: true },   // CBSE: DOB in words
    nationality:         { type: String, trim: true, default: "Indian" },
    gender: {
      type: String,
      enum: ["He", "She", "They"],
      default: "He",
    },
    scheduleCasteTribe:  { type: String, trim: true },   // Whether SC/ST/OBC
    admittedClass:       { type: String, trim: true },
    admittedDate:        { type: String, trim: true },
    currentClass:        { type: String, trim: true },
    className:           { type: String, trim: true },
    section:             { type: String, trim: true },
    rollNo:              { type: String, trim: true },
    classInWords:        { type: String, trim: true },   // Class in words
    leavingDate:         { type: String, trim: true },
    dateStruck:          { type: String, trim: true },   // Date struck off rolls
    subjectStudied:      { type: String, trim: true },
    reasonForLeaving:    { type: String, trim: true },
    feesPaidUpTo:        { type: String, trim: true },   // Month upto which dues paid
    feeConcession:       { type: String, trim: true },   // Any fee concession availed
    anyDues:             { type: String, trim: true },
    failedTimes:         { type: String, trim: true },   // Whether failed once/twice
    promotedClass:       { type: String, trim: true },   // Promoted to class
    promotedClassInWords:{ type: String, trim: true },   // Promoted class in words
    totalWorkingDays:    { type: String, trim: true },   // Total working days
    totalPresent:        { type: String, trim: true },   // Total days present
    nccScoutGuide:       { type: String, trim: true },   // NCC/Scout/Girl Guide
    whetherGovt:         { type: String, trim: true },   // Govt/Minority/Independent
    extraCurricular:     { type: String, trim: true },   // Extra curricular achievements
    boardExamResult:     { type: String, trim: true },   // Board/Annual exam last taken with result
    fromDate:            { type: String, trim: true },
    toDate:              { type: String, trim: true },
    lastExam:            { type: String, trim: true },

    /* ── Conduct & Character ── */
    conductRating: {
      type: String,
      enum: ["excellent", "good", "satisfactory", "fair"],
      default: "good",
    },
    characterRating: {
      type: String,
      enum: ["excellent", "good", "satisfactory", "fair"],
      default: "good",
    },
    behaviour: {
      type: String,
      enum: ["exemplary", "well-disciplined", "satisfactory"],
    },
    academicPerformance: {
      type: String,
      enum: ["outstanding", "excellent", "good", "average"],
    },
    extracurricular: { type: String, trim: true },   // CC

    /* ── Signatory ── */
    principalName:        { type: String, trim: true, default: "Principal" },
    principalDesignation: { type: String, trim: true, default: "Principal" },
    schoolAddressLine1: { type: String, trim: true },
    schoolAddressLine2: { type: String, trim: true },
    schoolAddressLine3: { type: String, trim: true },

    /* ── Metadata ── */
    issueDate:  { type: Date, default: Date.now },
    issuedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    remarks:    { type: String, trim: true },
    status: {
      type: String,
      enum: ["issued", "cancelled"],
      default: "issued",
    },
  },
  { timestamps: true }
);

export const getConductCertificateModel = (connection) => {
  return (
    connection.models.ConductCertificate ||
    connection.model("ConductCertificate", ConductCertificateSchema)
  );
};
