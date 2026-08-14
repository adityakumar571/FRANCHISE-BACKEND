import mongoose from "mongoose";

const CertificateSchema = new mongoose.Schema(
  {
    /* ── Type ── */
    type: {
      type: String,
      enum: ["transfer", "character"],
      required: true,
    },

    /* ── Serial / Cert No ── */
    serialNo:      { type: Number },
    certificateNo: { type: String, trim: true },

    /* ── School snapshot (header info) ── */
    affiliationNo:  { type: String, trim: true },
    schoolCode:     { type: String, trim: true },
    bookNo:         { type: String, trim: true },
    slNo:           { type: String, trim: true },
    registrationNo: { type: String, trim: true },
    renewedUpto:    { type: String, trim: true },
    statusOfSchool: { type: String, trim: true, default: "Secondary/Sr. Secondary" },

    /* ── Student reference ── */
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentEnrolment",
    },

    /* ── Student snapshot ── */
    studentName:        { type: String, trim: true, required: true },
    admissionNo:        { type: String, trim: true },
    penNo:              { type: String, trim: true },
    apaarNo:            { type: String, trim: true },
    fatherName:         { type: String, trim: true },
    motherName:         { type: String, trim: true },
    guardianName:       { type: String, trim: true },
    dateOfBirth:        { type: String, trim: true },
    dateOfBirthInWords: { type: String, trim: true },
    nationality:        { type: String, trim: true, default: "Indian" },
    religion:           { type: String, trim: true },
    placeOfBirth:       { type: String, trim: true },
    category:           { type: String, trim: true },
    scheduleCasteTribe: { type: String, trim: true },
    relation:           { type: String, trim: true, default: "Son" },
    gender:             { type: String, trim: true },

    /* ── Academic ── */
    admittedClass:    { type: String, trim: true },
    className:        { type: String, trim: true },
    classInWords:     { type: String, trim: true },
    section:          { type: String, trim: true },
    rollNo:           { type: String, trim: true },
    dateOfAdmission:  { type: String, trim: true },
    session:          { type: String, trim: true },

    /* ── Transfer Certificate specific ── */
    dateOfLeaving:        { type: String, trim: true },
    dateStruck:           { type: String, trim: true },
    reasonOfLeaving:      { type: String, trim: true },
    lastExamAppeared:     { type: String, trim: true },
    lastExamResult:       { type: String, trim: true, default: "Pass" },
    boardExamResult:      { type: String, trim: true },
    failedTimes:          { type: String, trim: true },
    subjectStudied:       { type: String, trim: true },
    promotedClass:        { type: String, trim: true },
    promotedClassInWords:    { type: String, trim: true },
    totalWorkingDays:        { type: String, trim: true },
    totalPresent:            { type: String, trim: true },
    feesPaidUpTo:            { type: String, trim: true },
    feeConcession:           { type: String, trim: true },
    feesStatus:              { type: String, trim: true, default: "Paid" },
    nccScoutGuide:           { type: String, trim: true },
    whetherGovt:             { type: String, trim: true },
    extraCurricular:         { type: String, trim: true },
    anyDues:                 { type: String, trim: true },
    medium:                  { type: String, trim: true, default: "English" },
    migrationCertIssued:     { type: String, trim: true },
    characterCertIssued:     { type: String, trim: true },

    /* ── Character Certificate specific ── */
    characterDescription: { type: String, trim: true },

    /* ── Common ── */
    conduct:   { type: String, trim: true, default: "Good" },
    issueDate: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["Draft", "Issued", "Cancelled"],
      default: "Draft",
    },
    remarks:  { type: String, trim: true },

    /* ── Meta ── */
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const getCertificateModel = (connection) => {
  return (
    connection.models.Certificate ||
    connection.model("Certificate", CertificateSchema)
  );
};
