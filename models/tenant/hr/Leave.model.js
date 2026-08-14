import mongoose from "mongoose";

const LeaveSchema = new mongoose.Schema(
  {
    staff:      { type: mongoose.Schema.Types.ObjectId, ref: "HRStaff", required: true },
    leaveType:  {
      type: String,
      enum: ["Casual Leave", "Sick Leave", "Paid Leave", "Unpaid Leave"],
      required: true,
    },
    fromDate:   { type: Date, required: true },
    toDate:     { type: Date, required: true },
    totalDays:  { type: Number, required: true },
    reason:     { type: String, trim: true },
    status:     { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    remarks:    { type: String, trim: true }, // manager remarks on approval/rejection
  },
  { timestamps: true }
);

export const getLeaveModel = (connection) => {
  return connection.models.HRLeave ||
    connection.model("HRLeave", LeaveSchema);
};
