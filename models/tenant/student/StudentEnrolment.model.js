import mongoose from "mongoose";

const SiblingSchema = new mongoose.Schema(
  {
    siblingStudentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentEnrolment" },
    class: { type: mongoose.Schema.Types.ObjectId, ref: "Class" },
    section: { type: mongoose.Schema.Types.ObjectId, ref: "Section" },
  },
  { _id: false }
);

const DocumentsSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "Document" },
    documentNumber: String,
    document: String,
    verified: { type: Boolean, default: false },
  },
  { _id: false }
);

const StudentEnrolmentSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: "Session" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    studentRegistrationId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentRegistration" },
    phone: { type: String, required: true },
    rollNumber: String,
    formId: String,
    studentId: String,
    srNumber: String,
    registrationNo: String,
    aadhaarNo: String,
    formNo: String,
    firstName: String,
    middleName: String,
    lastName: String,
    studentAdhaarNumber: String,
    dob: Date,
    category: String,
    religion: String,
    caste: String,
    child: String,
    minority: String,
    income: String,
    profilePic: String,
    fatherPic: String,
    motherPic: String,
    penNo: String,
    aparId: String,
    srRegisterNumber: String,
    fatherName: String,
    motherName: String,
    fatherOccupation: String,
    motherOccupation: String,
    fatherAdhaarNumber: String,
    motherAdhaarNumber: String,
    address: {
      present: { Address1: String, Address2: String, City: String, State: String, Pin: String, Mobile: String, Email: String },
      permanent: { Address1: String, Address2: String, City: String, State: String, Pin: String, Mobile: String, Email: String },
      isGuardianSameAsFather: { type: Boolean, default: false },
    },
    transportRequired: { type: String, enum: ["YES", "NO", "NOT_CONFIRM"], default: "NOT_CONFIRM" },
    transportStoppage: String,
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: "Route" },
    stopId: { type: mongoose.Schema.Types.ObjectId, ref: "RouteStop" },
    transportType: { type: String, enum: ["HOME_TO_SCHOOL", "SCHOOL_TO_HOME", "BOTH", ""], default: "" },
    transportAmount: { type: Number, default: 0 },
    transportEnrollmentDate: Date,
    // Months where transport fee is waived (e.g. vacation months like JUNE, JULY)
    // Stored as array of period strings: ["JUNE", "JULY"]
    transportExemptMonths: { type: [String], default: [] },
    // Transport history: tracks start/stop events mid-session
    // Each entry: { action: "START"/"STOP", month: "JUNE", date: Date, reason: String }
    transportHistory: {
      type: [
        {
          action: { type: String, enum: ["START", "STOP"] },
          month: { type: String },  // period string e.g. "JUNE"
          date: { type: Date },
          reason: { type: String },
        },
      ],
      default: [],
    },
    guardianName: String,
    guardianRelation: String,
    guardianPhone: String,
    guardianPostalAddress: String,
    schoolName: String,
    studentType: String,
    medium: String,
    currentClass: { type: mongoose.Schema.Types.ObjectId, ref: "Class" },
    admissionClass: String,
    previousStream: String,
    previousMedium: String,
    currentSection: { type: mongoose.Schema.Types.ObjectId, ref: "Section" },
    stream: { type: mongoose.Schema.Types.ObjectId, ref: "Stream" },
    house: String,
    admissionMonth: String,
    admissionDate: Date,
    gender: { type: String, enum: ["Male", "Female", "Other"] },
    status: { type: String, enum: ["Studying", "Passed", "Left"], default: "Studying" },
    resultStatus: { type: String, enum: ["Pass", "Fail", ""], default: "" },
    remark: String,
    tcSubmit: { type: Boolean, default: false },
    lastPassedExam: String,
    leavingSession: String,
    previousSchool: String,
    leavingReason: String,
    medicalComment: String,
    handicapped: String,
    transportWay: String,
    busNo: String,
    stationName: String,
    busFee: String,
    brotherSisterApplied: { type: Boolean, default: false },
    sibling: [SiblingSchema],
    fullFeeConcession: { type: Boolean, default: false },
    fullFeeExceptTransport: { type: Boolean, default: false },
    headWiseConcession: String,
    specialComment: String,
    discount: String,
    discountType: { type: String, enum: ["%", "₹"], default: "%" },
    documents: [DocumentsSchema],
  },
  { timestamps: true }
);

export const getStudentEnrolmentModel = (connection) => {
  return connection.models.StudentEnrolment ||
    connection.model("StudentEnrolment", StudentEnrolmentSchema);
};
