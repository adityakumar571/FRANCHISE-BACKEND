import mongoose from "mongoose";

const StaffSchema = new mongoose.Schema(
  {
    employeeCode:   { type: String, trim: true },
    employeeName:   { type: String, required: true, trim: true },
    staffType:      { type: String, enum: ["Teaching", "Non-Teaching"], required: true },
    department:     { type: mongoose.Schema.Types.ObjectId, ref: "HRDepartment" },
    designation:    { type: mongoose.Schema.Types.ObjectId, ref: "HRDesignation" },
    mobile:         { type: String, trim: true },
    email:          { type: String, trim: true, lowercase: true },
    gender:         { type: String, enum: ["Male", "Female", "Other"] },
    dateOfBirth:    { type: Date },
    dateOfJoining:  { type: Date },
    address:        { type: String, trim: true },
    employmentType: { type: String, enum: ["Permanent", "Temporary", "Contract", "Part-Time"] },
    monthlySalary:  { type: Number, default: 0 },
    bankName:       { type: String, trim: true },
    accountNumber:  { type: String, trim: true },
    ifscCode:       { type: String, trim: true },
    photo:          { type: String },
    isActive:       { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Auto-generate employeeCode before save if not provided
StaffSchema.pre("save", async function (next) {
  if (!this.employeeCode) {
    const random = Math.floor(1000 + Math.random() * 9000);
    this.employeeCode = `STF-${random}`;
  }
  next();
});

export const getStaffModel = (connection) => {
  return connection.models.HRStaff ||
    connection.model("HRStaff", StaffSchema);
};
