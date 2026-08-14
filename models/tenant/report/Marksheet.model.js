import mongoose from "mongoose";

const MarksheetSchema = new mongoose.Schema(
  {
    examListId: { type: mongoose.Schema.Types.ObjectId, ref: "ExamList", required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentEnrolment", required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
    streamId: { type: mongoose.Schema.Types.ObjectId, ref: "Stream", default: null },
    subjects: [
      {
        subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
        marksObtained: { type: Number, default: 0 },
        maxMarks: { type: Number, required: true },
      },
    ],
    totalObtainedMarks: Number,
    isPublished: { type: Boolean, default: false },
    totalMarks: Number,
    percentage: Number,
    result: { type: String, enum: ["PASS", "FAIL"] },
  },
  { timestamps: true }
);

export const getMarksheetModel = (connection) => {
  return connection.models.Marksheet ||
    connection.model("Marksheet", MarksheetSchema);
};
