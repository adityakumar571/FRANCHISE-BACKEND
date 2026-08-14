import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
    date: { type: Date, required: true },
    attendance: [
      {
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentEnrolment", required: true },
        status: { type: String, enum: ["P", "A", "L", "H"], default: "A" },
      },
    ],
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

attendanceSchema.index({ sessionId: 1, classId: 1, sectionId: 1, date: 1 }, { unique: true });

export const getAttendanceModel = (connection) => {
  return connection.models.Attendance ||
    connection.model("Attendance", attendanceSchema);
};
