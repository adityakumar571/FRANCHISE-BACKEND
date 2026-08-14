// queries/aiSchoolQueries.js
import mongoose from "mongoose";
import { getStudentEnrolmentModel } from "../../../../models/tenant/student/StudentEnrolment.model.js";
import { getClassModel }            from "../../../../models/tenant/master/Class.modal.js";
import { getSectionModel }          from "../../../../models/tenant/master/Section.modal.js";
import { getTeacherModel }          from "../../../../models/tenant/teacher/Teacher.model.js";
import { getAttendanceModel }       from "../../../../models/tenant/student/Attendance.model.js";
import { getHomeworkModel }         from "../../../../models/tenant/master/HomeWork.model.js";
import { getNoticeModel }           from "../../../../models/tenant/Notice.model.js";
import { getBusModel }              from "../../../../models/tenant/master/BusMaster.model.js";
import { getRouteModel }            from "../../../../models/tenant/master/RouteMaster.model.js";
import { getMarksheetModel }        from "../../../../models/tenant/report/Marksheet.model.js";
import { getCurrentSession, getISTDateBounds } from "./aiQueryHelpers.js";

/* ── ATTENDANCE: Today ── */
export async function queryAttendance(db) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const { todayStart, todayEnd, istDateDisplay } = getISTDateBounds();
  const Attendance = getAttendanceModel(db);
  const sid = new mongoose.Types.ObjectId(String(session._id));

  const [overallStats, classWiseStats] = await Promise.all([
    Attendance.aggregate([
      { $match: { sessionId: sid, date: { $gte: todayStart, $lte: todayEnd } } },
      { $unwind: "$attendance" },
      { $group: { _id: "$attendance.status", count: { $sum: 1 } } }
    ]),
    Attendance.aggregate([
      { $match: { sessionId: sid, date: { $gte: todayStart, $lte: todayEnd } } },
      { $unwind: "$attendance" },
      {
        $group: {
          _id: "$classId",
          present: { $sum: { $cond: [{ $eq: ["$attendance.status", "P"] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ["$attendance.status", "A"] }, 1, 0] } },
          leave: { $sum: { $cond: [{ $eq: ["$attendance.status", "L"] }, 1, 0] } },
          total: { $sum: 1 }
        }
      },
      { $lookup: { from: "classes", localField: "_id", foreignField: "_id", as: "classInfo" } },
      {
        $project: {
          className: { $ifNull: [{ $arrayElemAt: ["$classInfo.name", 0] }, "Unknown"] },
          present: 1, absent: 1, leave: 1, total: 1
        }
      },
      { $sort: { className: 1 } }
    ])
  ]);

  const attMap = Object.fromEntries(overallStats.map(a => [a._id, a.count]));
  const present = attMap["P"] || 0;
  const absent = attMap["A"] || 0;
  const leave = attMap["L"] || 0;
  const total = present + absent + leave;
  const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : 0;

  const classBreakdown = classWiseStats.map(c => 
    `${c.className}: ${c.present}/${c.total} present (${((c.present/c.total)*100).toFixed(0)}%), ${c.absent} absent, ${c.leave} leave`
  );

  return {
    type: "attendance",
    date: istDateDisplay,
    present, absent, leave, total,
    percentage: `${percentage}%`,
    byClass: classWiseStats,
    formatted: `Attendance (${istDateDisplay}):\n• Present: ${present}\n• Absent: ${absent}\n• Leave: ${leave}\n• Total: ${total} (${percentage}% attendance)\n\nClass-wise:\n${classBreakdown.map(c => `• ${c}`).join('\n')}`
  };
}

/* ── TEACHERS ── */
export async function queryTeachers(db, params = {}) {
  const Teacher = getTeacherModel(db);
  const { nameQuery } = params;   // true if user asked for names

  const [total, byStatus, byDesignation, namesList] = await Promise.all([
    Teacher.countDocuments({}),
    Teacher.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Teacher.aggregate([
      { $match: { status: "Active" } },
      { $group: { _id: "$designation", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    // Fetch names only when asked
    nameQuery
      ? Teacher.find({ status: "Active" }, { firstName: 1, lastName: 1, designation: 1, status: 1 })
          .sort({ firstName: 1 }).limit(50).lean()
      : Promise.resolve([]),
  ]);

  const statusBreakdown      = byStatus.map(s => `${s._id || "Unknown"}: ${s.count}`);
  const designationBreakdown = byDesignation.map(d => `${d._id || "Other"}: ${d.count}`);

  // Build teacherNames array for frontend card
  const teacherNames = namesList.map(t => ({
    name:        [t.firstName, t.lastName].filter(Boolean).join(" ").trim() || "Unknown",
    designation: t.designation || null,
    status:      t.status || null,
  }));

  const formattedNames = teacherNames.length > 0
    ? teacherNames.map((t, i) => `${i + 1}. **${t.name}**${t.designation ? " (" + t.designation + ")" : ""}`).join("\n")
    : null;

  return {
    type:        "teachers",
    totalTeachers: total,
    byStatus,
    byDesignation,
    teacherNames,                          // for frontend name-list card
    queryLabel:  nameQuery ? "Active Teachers" : "Teachers",
    formatted: nameQuery && formattedNames
      ? `Active teachers (${teacherNames.length}):\n${formattedNames}`
      : `Total teachers: ${total}\nStatus: ${statusBreakdown.join(", ")}\nActive by designation:\n${designationBreakdown.map(d => `• ${d}`).join("\n")}`,
  };
}

/* ── CLASSES & SECTIONS ── */
export async function queryClasses(db) {
  const Class = getClassModel(db);
  const Section = getSectionModel(db);

  const [totalClasses, totalSections] = await Promise.all([
    Class.countDocuments({ isActive: true }),
    Section.countDocuments({ isActive: true })
  ]);

  return {
    type: "classes",
    totalClasses,
    totalSections,
    formatted: `Total classes: ${totalClasses} | Total sections: ${totalSections}`
  };
}

/* ── HOMEWORK ── */
export async function queryHomework(db) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const { todayStart, todayEnd, istDateDisplay } = getISTDateBounds();
  const Homework = getHomeworkModel(db);
  const sid = new mongoose.Types.ObjectId(String(session._id));

  const [dueToday, totalActive] = await Promise.all([
    Homework.countDocuments({
      sessionId: sid,
      dueDate: { $gte: todayStart, $lte: todayEnd },
      isActive: true
    }),
    Homework.countDocuments({ sessionId: sid, isActive: true })
  ]);

  return {
    type: "homework",
    dueTodayCount: dueToday,
    totalThisSession: totalActive,
    formatted: `Homework due today (${istDateDisplay}): ${dueToday} | Total this session: ${totalActive}`
  };
}

/* ── NOTICES ── */
export async function queryNotices(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const Notice = getNoticeModel(db);
  const sid    = new mongoose.Types.ObjectId(String(session._id));
  const { dateRange } = params;

  // Build date filter based on requested range
  let dateFilter = {};
  if (dateRange === "today") {
    const { todayStart, todayEnd } = getISTDateBounds();
    dateFilter = { createdAt: { $gte: todayStart, $lte: todayEnd } };
  } else if (dateRange === "this_week") {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    dateFilter = { createdAt: { $gte: weekAgo } };
  } else if (dateRange === "this_month") {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    dateFilter = { createdAt: { $gte: monthAgo } };
  }

  const query = { session: sid, isActive: true, ...dateFilter };

  const [notices, totalSession] = await Promise.all([
    Notice.find(query)
      .sort({ createdAt: -1 })
      .limit(10)
      .select("title createdAt")
      .lean(),
    // Total for session (no date filter) — only when date-filtered
    dateRange
      ? Notice.countDocuments({ session: sid, isActive: true })
      : Promise.resolve(null),
  ]);

  const { istDateDisplay } = getISTDateBounds();

  // Label for the date range
  const rangeLabel = dateRange === "today"
    ? `aaj (${istDateDisplay})`
    : dateRange === "this_week"
    ? "is hafte"
    : dateRange === "this_month"
    ? "is mahine"
    : "recent";

  if (!notices.length) {
    return {
      type:     "notices",
      dateRange,
      count:    0,
      recentNotices: [],
      formatted: dateRange
        ? `${rangeLabel.charAt(0).toUpperCase() + rangeLabel.slice(1)} koi nayi notice nahi aayi.`
        : "Koi active notice nahi mili.",
    };
  }

  const formatted = notices
    .map((n, i) => {
      const date = n.createdAt
        ? new Date(n.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        : "";
      return `${i + 1}. **${n.title}**${date ? ` (${date})` : ""}`;
    })
    .join("\n");

  const heading = dateRange
    ? `${rangeLabel} ki notices (${notices.length}):`
    : `Recent notices (${notices.length}):`;

  return {
    type:          "notices",
    dateRange,
    count:         notices.length,
    totalSession,
    recentNotices: notices,
    formatted:     `${heading}\n${formatted}`,
  };
}

/* ── TRANSPORT ── */
export async function queryTransport(db) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const Bus = getBusModel(db);
  const Route = getRouteModel(db);
  const StudentEnrolment = getStudentEnrolmentModel(db);
  const sid = new mongoose.Types.ObjectId(String(session._id));

  const [buses, routes, studentsUsingTransport] = await Promise.all([
    Bus.countDocuments({ isActive: true }),
    Route.countDocuments({ isActive: true }),
    StudentEnrolment.countDocuments({ session: sid, status: "Studying", transportRequired: "YES" })
  ]);

  return {
    type: "transport",
    totalBuses: buses,
    totalRoutes: routes,
    studentsUsingTransport,
    formatted: `Total buses: ${buses} | Total routes: ${routes} | Students using transport: ${studentsUsingTransport}`
  };
}

/* ── TOPPER: Class-wise top students from marksheet ── */
export async function queryTopper(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const Marksheet        = getMarksheetModel(db);
  const sid              = new mongoose.Types.ObjectId(String(session._id));

  // className passed from intent parser (e.g. "Nursery", "Class 1", "10")
  const { className } = params;

  // Build match stage
  const matchStage = {
    sessionId:   sid,
    isPublished: true,
    percentage:  { $exists: true, $ne: null },
  };

  // If specific class requested, join via Class collection
  let pipeline = [
    { $match: matchStage },

    // Join with Class to get class name
    {
      $lookup: {
        from:         "classes",
        localField:   "classId",
        foreignField: "_id",
        as:           "classInfo",
      },
    },
    { $addFields: { className: { $arrayElemAt: ["$classInfo.name", 0] } } },

    // Filter by className if provided
    ...(className
      ? [{ $match: { className: { $regex: new RegExp(className, "i") } } }]
      : []),

    // Sort by percentage descending, keep top 1 per class
    { $sort: { percentage: -1 } },

    // Group by class — pick top 1
    {
      $group: {
        _id:        "$classId",
        className:  { $first: "$className" },
        studentId:  { $first: "$studentId" },
        percentage: { $first: "$percentage" },
        totalObtained: { $first: "$totalObtainedMarks" },
        totalMarks:    { $first: "$totalMarks" },
        result:        { $first: "$result" },
      },
    },
    { $sort: { className: 1 } },

    // Join with StudentEnrolment to get student name
    {
      $lookup: {
        from:         "studentenrolments",
        localField:   "studentId",
        foreignField: "_id",
        as:           "studentInfo",
      },
    },
    {
      $addFields: {
        studentName: {
          $trim: {
            input: {
              $concat: [
                { $ifNull: [{ $arrayElemAt: ["$studentInfo.firstName", 0] }, ""] },
                " ",
                { $ifNull: [{ $arrayElemAt: ["$studentInfo.middleName", 0] }, ""] },
                " ",
                { $ifNull: [{ $arrayElemAt: ["$studentInfo.lastName", 0] }, ""] },
              ],
            },
          },
        },
        rollNumber: { $arrayElemAt: ["$studentInfo.rollNumber", 0] },
      },
    },
    {
      $project: {
        _id: 0,
        className:    1,
        studentName:  1,
        rollNumber:   1,
        percentage:   1,
        totalObtained: 1,
        totalMarks:    1,
        result:        1,
      },
    },
  ];

  const toppers = await Marksheet.aggregate(pipeline);

  if (!toppers.length) {
    return {
      type: "topper",
      toppers: [],
      formatted: className
        ? `"${className}" class ke liye koi published result nahi mila. Pehle result publish karein.`
        : "Abhi koi published result nahi hai. Pehle result publish karein.",
    };
  }

  // Format response
  const lines = toppers.map((t) => {
    const pct   = t.percentage ? `${Number(t.percentage).toFixed(1)}%` : "N/A";
    const marks = t.totalObtained && t.totalMarks
      ? `${t.totalObtained}/${t.totalMarks}`
      : "";
    const roll  = t.rollNumber ? ` (Roll: ${t.rollNumber})` : "";
    return `• **${t.className}** — ${t.studentName || "N/A"}${roll} — ${marks} — ${pct}`;
  });

  const heading = className
    ? `**${className} class ka topper:**`
    : `**Class-wise Toppers (${toppers.length} classes):**`;

  return {
    type:    "topper",
    toppers,
    formatted: `${heading}\n${lines.join("\n")}`,
  };
}
