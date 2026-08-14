import mongoose from "mongoose";

const AttendanceSchema = new mongoose.Schema(
  {
    staff:    { type: mongoose.Schema.Types.ObjectId, ref: "HRStaff", required: true },
    date:     { type: Date, required: true },
    status:   {
      type: String,
      enum: ["Present", "Absent", "Half Day", "Paid Leave", "Unpaid Leave", "Holiday", "Weekly Off"],
      required: true,
    },
    remarks:  { type: String, trim: true },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// One attendance record per staff per date
AttendanceSchema.index({ staff: 1, date: 1 }, { unique: true });

export const getAttendanceHRModel = (connection) => {
  return connection.models.HRAttendance ||
    connection.model("HRAttendance", AttendanceSchema);
};
