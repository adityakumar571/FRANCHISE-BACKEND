// queries/aiStudentQueries.js
import mongoose from "mongoose";
import { getStudentEnrolmentModel } from "../../../../models/tenant/student/StudentEnrolment.model.js";
import { getClassModel }            from "../../../../models/tenant/master/Class.modal.js";
import { getTeacherModel }          from "../../../../models/tenant/teacher/Teacher.model.js";
import { getCurrentSession }        from "./aiQueryHelpers.js";

/* ── STUDENTS: Total Count (with optional class filter) ── */
export async function queryStudents(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const StudentEnrolment = getStudentEnrolmentModel(db);
  const Class            = getClassModel(db);
  const sid              = new mongoose.Types.ObjectId(String(session._id));
  const { className }    = params;

  // If className given, resolve to _id first
  let classFilter = {};
  let resolvedClassName = null;
  if (className) {
    // 1. Exact match (case-insensitive)
    let classDoc = await Class.findOne({
      name: { $regex: new RegExp(`^${className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      isActive: true,
    }).lean();

    // 2. Partial match
    if (!classDoc) {
      classDoc = await Class.findOne({
        name: { $regex: new RegExp(className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
        isActive: true,
      }).lean();
    }

    // 3. Numeric: "5" → match "5", "Class 5", "V" etc.
    if (!classDoc && /^\d+$/.test(className)) {
      const allClasses = await Class.find({ isActive: true }, { name: 1 }).lean();
      // Try to match by numeric value (handles Roman numerals or "Class X" format)
      const romanMap = { I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10,XI:11,XII:12 };
      const num = parseInt(className);
      classDoc = allClasses.find(c => {
        const n = c.name.trim();
        // Direct digit match
        if (n === String(num) || n === `Class ${num}` || n === `class ${num}`) return true;
        // Roman numeral match
        if (romanMap[n.toUpperCase()] === num) return true;
        return false;
      }) || null;
    }

    if (classDoc) {
      classFilter      = { currentClass: classDoc._id };
      resolvedClassName = classDoc.name;
    }
  }

  const baseMatch = { session: sid, status: "Studying", ...classFilter };

  const [total, genderStats, classWise] = await Promise.all([
    StudentEnrolment.countDocuments(baseMatch),
    StudentEnrolment.aggregate([
      { $match: baseMatch },
      { $group: { _id: "$gender", count: { $sum: 1 } } },
    ]),
    // Class-wise breakdown only if no specific class requested
    !className
      ? StudentEnrolment.aggregate([
          { $match: baseMatch },
          { $group: { _id: "$currentClass", count: { $sum: 1 } } },
          { $lookup: { from: "classes", localField: "_id", foreignField: "_id", as: "classInfo" } },
          { $project: { className: { $arrayElemAt: ["$classInfo.name", 0] }, count: 1 } },
          { $sort: { count: -1 } },
        ])
      : Promise.resolve([]),
  ]);

  const genderBreakdown = genderStats.map(g => `${g._id || "Not Set"}: ${g.count}`);
  const classBreakdown  = classWise.map(c => `${c.className || "Unknown"}: ${c.count}`);

  // ── Formatted response ──
  let formatted;
  if (resolvedClassName) {
    // Specific class query
    const gParts = genderBreakdown.length ? `  (${genderBreakdown.join(", ")})` : "";
    formatted = `**${resolvedClassName}** class mein **${total} students** hain.${gParts}`;
  } else if (className) {
    // Class given but not found in DB
    formatted = `"${className}" class nahi mili. Please class name check karein.`;
  } else {
    // All classes
    formatted = `Total students: ${total}\nGender: ${genderBreakdown.join(", ")}\nClass-wise:\n${classBreakdown.map(c => `• ${c}`).join("\n")}`;
  }

  return {
    type:         "students",
    totalStudents: total,
    className:    resolvedClassName,
    byGender:     genderStats,
    byClass:      classWise,
    formatted,
  };
}

/* ══════════════════════════════════════════════════════════════════
   DEEP STUDENT PROFILE — uses ACTUAL models
   StudentPayment, FeeStructure, FeeInstallment, Attendance, Marksheet
══════════════════════════════════════════════════════════════════ */
export async function queryStudentByName(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const sid              = new mongoose.Types.ObjectId(String(session._id));
  const StudentEnrolment = getStudentEnrolmentModel(db);

  const { nameQuery } = params;
  if (!nameQuery?.trim()) return { error: "No name provided" };

  const words = nameQuery.trim().split(/\s+/).filter(Boolean);

  /* ── Fuzzy normalise: collapse repeated chars, build soundex-like variants ── */
  function normaliseName(n) {
    return n
      .toLowerCase()
      // collapse repeated letters: "Shu" → keep, "shuu" → "shu"
      .replace(/(.)\1+/g, "$1")
      // common Hindi name transliteration variants
      .replace(/sh/g, "s").replace(/kh/g, "k").replace(/gh/g, "g")
      .replace(/th/g, "t").replace(/ph/g, "f")
      // double vowel collapse
      .replace(/aa/g, "a").replace(/ee/g, "i").replace(/oo/g, "u")
      // strip trailing 'a'
      .replace(/a$/, "");
  }

  // Build fuzzy regex for each word — allows 0-1 extra/missing chars between letters
  function fuzzyRegex(word) {
    const norm = normaliseName(word);
    // Prefix match on first 4 chars (catches most typos)
    const prefix = norm.length >= 4 ? norm.slice(0, 4) : norm;
    return new RegExp(prefix, "i");
  }

  /* ── Strategy 1: Full name regex match ── */
  const fullNameRegex = new RegExp(words.join(".*"), "i");
  let students = await StudentEnrolment
    .find({
      session: sid, status: "Studying",
      $or: [
        { firstName:  { $regex: fullNameRegex } },
        { lastName:   { $regex: fullNameRegex } },
        { $expr: { $regexMatch: {
          input: { $concat: [
            { $ifNull: ["$firstName", ""] }, " ",
            { $ifNull: ["$middleName", ""] }, " ",
            { $ifNull: ["$lastName", ""] }
          ]},
          regex: words.join(".*"),
          options: "i"
        }}}
      ]
    })
    .populate("currentClass",   "name")
    .populate("currentSection", "name")
    .populate("routeId", "routeName")
    .populate("stopId",  "stopName")
    .limit(10)
    .lean();

  /* ── Strategy 2: word-by-word prefix fallback ── */
  if (!students.length && words.length >= 1) {
    const wordOrClauses = words.flatMap(w => [
      { firstName: { $regex: `^${w}`, $options: "i" } },
      { lastName:  { $regex: `^${w}`, $options: "i" } },
    ]);
    students = await StudentEnrolment
      .find({ session: sid, status: "Studying", $or: wordOrClauses })
      .populate("currentClass",   "name")
      .populate("currentSection", "name")
      .populate("routeId", "routeName")
      .populate("stopId",  "stopName")
      .limit(10)
      .lean();
  }

  /* ── Strategy 3: Fuzzy fallback — normalised prefix match ── */
  if (!students.length) {
    const fuzzyClauses = words.flatMap(w => {
      const re = fuzzyRegex(w);
      return [
        { firstName: { $regex: re.source, $options: "i" } },
        { lastName:  { $regex: re.source, $options: "i" } },
      ];
    });
    students = await StudentEnrolment
      .find({ session: sid, status: "Studying", $or: fuzzyClauses })
      .populate("currentClass",   "name")
      .populate("currentSection", "name")
      .populate("routeId", "routeName")
      .populate("stopId",  "stopName")
      .limit(15)
      .lean();
  }

  /* ── Score results — fuzzy scoring with normalised name comparison ── */
  const queryLower = nameQuery.toLowerCase();
  const queryNorm  = normaliseName(queryLower);
  students = students
    .map(s => {
      const fullName     = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ").toLowerCase();
      const fullNameNorm = normaliseName(fullName);
      let score = 0;

      if (fullName === queryLower)                           score = 100;
      else if (fullName.startsWith(queryLower))             score = 85;
      else if (fullName.includes(queryLower))               score = 70;
      else if (fullNameNorm.startsWith(queryNorm))          score = 65;
      else if (fullNameNorm.includes(queryNorm))            score = 55;
      else {
        // Word-level match
        const matchCount = words.filter(w => {
          const wLow  = w.toLowerCase();
          const wNorm = normaliseName(wLow);
          return fullName.includes(wLow) || fullNameNorm.includes(wNorm);
        }).length;
        score = (matchCount / words.length) * 40;
      }
      return { ...s, _score: score };
    })
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 10);

  if (!students.length) {
    // One last attempt — try just first 3 chars of each word (very loose)
    const looseClauses = words.flatMap(w => {
      const prefix = w.slice(0, 3);
      return prefix.length >= 3 ? [
        { firstName: { $regex: `^${prefix}`, $options: "i" } },
        { lastName:  { $regex: `^${prefix}`, $options: "i" } },
      ] : [];
    });

    let suggestions = [];
    if (looseClauses.length) {
      suggestions = await StudentEnrolment
        .find({ session: sid, status: "Studying", $or: looseClauses })
        .select("firstName middleName lastName currentClass currentSection rollNumber")
        .populate("currentClass", "name")
        .limit(3).lean();
    }

    const suggestionText = suggestions.length
      ? `\n\nKya aap inme se kisi ko dhundh rahe hain?\n` +
        suggestions.map((s, i) => {
          const n = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");
          const c = s.currentClass?.name || "";
          return `${i + 1}. **${n}**${c ? ` — Class ${c}` : ""}`;
        }).join("\n")
      : "";

    return {
      type:      "student_search",
      students:  [],
      nameQuery,
      formatted: `"${nameQuery}" naam ka koi student nahi mila. Spelling check karo ya poora naam likho.${suggestionText}`,
    };
  }

  /* ══════════════════════════════════════════════════════════
     DEEP DATA FETCH — Only for single student result
  ══════════════════════════════════════════════════════════ */
  if (students.length === 1) {
    const student = students[0];
    const studentId = student._id;
    const classId   = student.currentClass?._id || student.currentClass;

    // Import models needed for attendance, marks, transport
    const { getAttendanceModel }       = await import("../../../../models/tenant/student/Attendance.model.js");
    const { getMarksheetModel }        = await import("../../../../models/tenant/report/Marksheet.model.js");
    const { getStudentTransportModel } = await import("../../../../models/tenant/master/StudentTransport.model.js");
    const { getStudentPaymentModel }   = await import("../../../../models/tenant/master/StudentPayment.model.js");

    const [feeData, attendanceData, marksData, transportData] = await Promise.all([
      /* ── 1. FEE — uses studentLedgerService (single source of truth, same as Fee Ledger screen) ── */
      (async () => {
        try {
          const { getStudentLedgerData } = await import("../../../../utils/studentLedgerService.js");

          const ledgerResult = await getStudentLedgerData({
            db,
            sessionId:  sid,
            studentId:  studentId.toString(),
            classId:    classId.toString(),
            streamId:   student.stream?._id?.toString() || student.stream?.toString() || student.streamId?.toString() || null,
          });

          if (!ledgerResult) return null;

          const { summary, ledger } = ledgerResult;

          // ── Recent payment history (last 5) ──
          const StudentPayment = getStudentPaymentModel(db);
          const payments = await StudentPayment.find(
            { sessionId: sid, studentId, paymentStatus: "SUCCESS" },
            { amountPaid: 1, paymentDate: 1, paymentMode: 1, receiptNo: 1 }
          ).sort({ paymentDate: -1 }).limit(5).lean();

          const recentPayments = payments.map(p => ({
            date:    p.paymentDate ? new Date(p.paymentDate).toLocaleDateString("en-IN") : "N/A",
            amount:  p.amountPaid || 0,
            mode:    p.paymentMode || "N/A",
            receipt: p.receiptNo  || "N/A",
          }));

          // ── Period-wise breakdown for AI (concise, only due/partial/paid periods) ──
          const periodBreakdown = ledger.map(g => ({
            period:      g.period,
            totalAmount: g.totalAmount,
            paid:        g.totalPaid,
            due:         g.totalDue,
            status:      g.status,
            receipts:    g.receiptNos?.join(", ") || "",
            // Fee heads in this period
            heads: g.items
              .filter(i => i.type !== "CONCESSION")
              .map(i => `${i.feeHead}: ₹${i.totalAmount} (paid ₹${i.paidAmount}, due ₹${i.dueAmount})`)
          }));

          // ── Internal keys used by aiChatController serverRenderedFeeSection ──
          const grossFeeDisplay = parseFloat(summary.grossTotal) - parseFloat(summary.waived);

          return {
            // Server-rendered fee section keys (used by aiChatController)
            grossFee:   grossFeeDisplay,
            concession: parseFloat(summary.concession),
            waived:     parseFloat(summary.waived),
            netPayable: parseFloat(summary.netPayable),
            totalPaid:  parseFloat(summary.totalPaid),
            pendingFee: parseFloat(summary.totalDue),
            lateFee:    parseFloat(summary.lateFeeDue),
            status:     parseFloat(summary.totalDue) <= 0 ? "Clear ✅" : "Pending ⚠️",

            // Full breakdown for detailed queries
            currentDue:      parseFloat(summary.currentDue),
            periodBreakdown,
            recentPayments,
          };
        } catch (e) {
          console.error("[AI Fee]:", e.message);
          return null;
        }
      })(),

      /* ── 2. ATTENDANCE ── */
      (async () => {
        try {
          const Attendance = getAttendanceModel(db);
          const now        = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0);

          const monthRecords = await Attendance.find({
            sessionId: sid, classId,
            date: { $gte: monthStart, $lte: monthEnd },
            "attendance.studentId": studentId
          }, { date: 1, attendance: { $elemMatch: { studentId } } }).lean();

          let P = 0, A = 0, L = 0;
          monthRecords.forEach(r => {
            const s = r.attendance?.[0]?.status;
            if (s === "P") P++; else if (s === "A") A++; else if (s === "L") L++;
          });
          const total = monthRecords.length;
          const pct   = total > 0 ? ((P / total) * 100).toFixed(1) : 0;

          // Today
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
          const todayRec = await Attendance.findOne({
            sessionId: sid, classId,
            date: { $gte: today, $lt: tomorrow },
            "attendance.studentId": studentId
          }, { attendance: { $elemMatch: { studentId } } }).lean();

          const statusMap = { P: "Present ✅", A: "Absent ❌", L: "On Leave 📋", H: "Holiday" };
          const todayStatus = todayRec?.attendance?.[0]?.status || null;

          return {
            thisMonth: {
              present: P, absent: A, leave: L, total,
              percentage: `${pct}%`,
              label: pct >= 75 ? "Good 🟢" : pct >= 60 ? "Average 🟡" : "Poor 🔴"
            },
            today: statusMap[todayStatus] || "Not marked yet"
          };
        } catch (e) {
          console.error("[AI Attendance]:", e.message);
          return null;
        }
      })(),

      /* ── 3. MARKS ── */
      (async () => {
        try {
          const Marksheet = getMarksheetModel(db);
          const sheets = await Marksheet.find({
            studentId, sessionId: sid, isPublished: true
          }).populate("examListId", "examName").sort({ createdAt: -1 }).limit(3).lean();

          return sheets.map(m => ({
            exam:    m.examListId?.examName || "Exam",
            total:   m.totalMarks || 0,
            obtained: m.totalObtainedMarks || 0,
            pct:     m.percentage ? `${Math.round(m.percentage)}%` : "N/A",
            result:  m.result || "N/A"
          }));
        } catch (e) {
          console.error("[AI Marks]:", e.message);
          return [];
        }
      })(),

      /* ── 4. TRANSPORT ── */
      (async () => {
        try {
          const ST = getStudentTransportModel(db);
          const t  = await ST.findOne({ studentId, sessionId: sid, isActive: true })
            .populate("routeId", "routeName")
            .populate("stopId",  "stopName")
            .lean();

          if (!t) {
            // fallback to enrolment-level transport info
            if (student.transportRequired === "YES" && student.routeId) {
              return {
                routeName:  student.routeId?.routeName || "N/A",
                stopName:   student.stopId?.stopName   || "N/A",
                pickupType: student.transportType      || "N/A",
                feeAmount:  student.transportAmount    || 0
              };
            }
            return null;
          }

          return {
            routeName:  t.routeId?.routeName || "N/A",
            stopName:   t.stopId?.stopName   || "N/A",
            pickupType: t.pickupType         || "N/A",
            feeAmount:  t.feeAmount          || 0
          };
        } catch (e) {
          console.error("[AI Transport]:", e.message);
          return null;
        }
      })()
    ]);

    // Build comprehensive student profile
    const profile = {
      // Basic Info
      name:            [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" "),
      rollNumber:      student.rollNumber    || "N/A",
      studentId:       student.studentId    || "N/A",
      class:           student.currentClass?.name   || "N/A",
      section:         student.currentSection?.name || "N/A",
      gender:          student.gender        || "N/A",
      dateOfBirth:     student.dob ? new Date(student.dob).toLocaleDateString('en-IN') : "N/A",
      admissionDate:   student.admissionDate ? new Date(student.admissionDate).toLocaleDateString('en-IN') : "N/A",
      category:        student.category     || "N/A",
      
      // Parents Info
      fatherName:      student.fatherName   || "N/A",
      motherName:      student.motherName   || "N/A",
      guardianName:    student.guardianName || "N/A",
      contactMobile:   student.address?.present?.Mobile || student.guardianPhone || student.phone || "N/A",
      contactEmail:    student.address?.present?.Email  || "N/A",
      presentAddress: [
        student.address?.present?.Address1,
        student.address?.present?.City,
        student.address?.present?.State,
        student.address?.present?.Pin
      ].filter(Boolean).join(", ") || "N/A",
      
      // Fee Details (REAL data from calculateStudentPayableSummary — same as Fee Ledger)
      fee: feeData || { status: "No fee data found" },
      
      // Attendance (REAL data from Attendance collection)
      attendance: attendanceData || { status: "No attendance data" },
      
      // Academic (REAL data from Marksheet collection)
      recentExams: marksData || [],
      
      // Transport (REAL data from StudentTransport collection)
      transport: transportData || null
    };

    return {
      type:    "student_search_detailed",
      student: profile,
      nameQuery,
      rawData: profile
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     MULTIPLE STUDENTS — Show compact list
  ══════════════════════════════════════════════════════════════════ */
  const lines = students.map((s, i) => {
    const name = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ").trim();
    const cls  = s.currentClass?.name   || null;
    const sec  = s.currentSection?.name || null;
    const roll = s.rollNumber  || null;

    const parts = [
      cls  ? `Class: ${cls}${sec ? "-" + sec : ""}` : null,
      roll ? `Roll: ${roll}` : null,
    ].filter(Boolean).join(", ");
    return `${i + 1}. **${name}**${parts ? " — " + parts : ""}`;
  });

  return {
    type:      "student_search",
    students,
    nameQuery,
    total:     students.length,
    formatted: `**"${nameQuery}"** naam se **${students.length} students** mile:\n${lines.join("\n")}\n\n_Specific student ki puri detail ke liye exact naam batao._`
  };
}

/* ══════════════════════════════════════════════════════════════════
   TEACHER PROFILE BY NAME — fuzzy search + profile fetch
══════════════════════════════════════════════════════════════════ */
export async function queryTeacherByName(db, params = {}) {
  const Teacher = getTeacherModel(db);

  const { nameQuery } = params;
  if (!nameQuery?.trim()) return { error: "No name provided" };

  const words = nameQuery.trim().split(/\s+/).filter(Boolean);

  // Same normaliser as student search
  function normaliseName(n) {
    return n.toLowerCase()
      .replace(/(.)\1+/g, "$1")
      .replace(/sh/g, "s").replace(/kh/g, "k").replace(/gh/g, "g")
      .replace(/th/g, "t").replace(/ph/g, "f")
      .replace(/aa/g, "a").replace(/ee/g, "i").replace(/oo/g, "u")
      .replace(/a$/, "");
  }

  /* ── Strategy 1: Full name regex ── */
  const fullNameRegex = new RegExp(words.join(".*"), "i");
  let teachers = await Teacher.find({
    $or: [
      { firstName: { $regex: fullNameRegex } },
      { lastName:  { $regex: fullNameRegex } },
      { $expr: { $regexMatch: {
        input: { $concat: [
          { $ifNull: ["$firstName", ""] }, " ",
          { $ifNull: ["$middleName", ""] }, " ",
          { $ifNull: ["$lastName", ""] }
        ]},
        regex: words.join(".*"), options: "i"
      }}}
    ]
  }).limit(10).lean();

  /* ── Strategy 2: word-by-word prefix ── */
  if (!teachers.length) {
    const clauses = words.flatMap(w => [
      { firstName: { $regex: `^${w}`, $options: "i" } },
      { lastName:  { $regex: `^${w}`, $options: "i" } },
    ]);
    teachers = await Teacher.find({ $or: clauses }).limit(10).lean();
  }

  /* ── Strategy 3: fuzzy normalised prefix ── */
  if (!teachers.length) {
    const fuzzyClauses = words.flatMap(w => {
      const prefix = normaliseName(w).slice(0, 4);
      return prefix.length >= 3 ? [
        { firstName: { $regex: prefix, $options: "i" } },
        { lastName:  { $regex: prefix, $options: "i" } },
      ] : [];
    });
    if (fuzzyClauses.length) {
      teachers = await Teacher.find({ $or: fuzzyClauses }).limit(15).lean();
    }
  }

  /* ── Score ── */
  const queryLower = nameQuery.toLowerCase();
  const queryNorm  = normaliseName(queryLower);
  teachers = teachers
    .map(t => {
      const fullName     = [t.firstName, t.middleName, t.lastName].filter(Boolean).join(" ").toLowerCase();
      const fullNameNorm = normaliseName(fullName);
      let score = 0;
      if (fullName === queryLower)                   score = 100;
      else if (fullName.startsWith(queryLower))      score = 85;
      else if (fullName.includes(queryLower))        score = 70;
      else if (fullNameNorm.startsWith(queryNorm))   score = 65;
      else if (fullNameNorm.includes(queryNorm))     score = 55;
      else {
        const matchCount = words.filter(w => {
          const wl = w.toLowerCase();
          return fullName.includes(wl) || fullNameNorm.includes(normaliseName(wl));
        }).length;
        score = (matchCount / words.length) * 40;
      }
      return { ...t, _score: score };
    })
    .filter(t => t._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  /* ── Not found with suggestions ── */
  if (!teachers.length) {
    const looseClauses = words.flatMap(w => {
      const prefix = w.slice(0, 3);
      return prefix.length >= 3 ? [
        { firstName: { $regex: `^${prefix}`, $options: "i" } },
        { lastName:  { $regex: `^${prefix}`, $options: "i" } },
      ] : [];
    });
    let suggestions = [];
    if (looseClauses.length) {
      suggestions = await Teacher.find({ $or: looseClauses })
        .select("firstName middleName lastName designation status").limit(3).lean();
    }
    const suggestionText = suggestions.length
      ? `\n\nKya aap inhe dhundh rahe hain?\n` +
        suggestions.map((t, i) => {
          const n = [t.firstName, t.middleName, t.lastName].filter(Boolean).join(" ");
          return `${i + 1}. **${n}**${t.designation ? ` — ${t.designation}` : ""}`;
        }).join("\n")
      : "";

    return {
      type: "teacher_search",
      teachers: [],
      nameQuery,
      formatted: `"${nameQuery}" naam ka koi teacher nahi mila. Spelling check karo ya poora naam likho.${suggestionText}`,
    };
  }

  /* ── Single teacher — full profile ── */
  if (teachers.length === 1) {
    const t = teachers[0];

    // Classes assigned in current session
    let assignedClasses = [];
    if (t.classesAssigned?.length) {
      try {
        const { getCurrentSession: getSession } = await import("./aiQueryHelpers.js");
        const session = await getSession(db);
        if (session) {
          const sessionIdStr = String(session._id);
          const sessionAssignments = t.classesAssigned.filter(
            a => a.session && String(a.session) === sessionIdStr
          );

          if (sessionAssignments.length) {
            const Class   = getClassModel(db);
            const { getSectionModel } = await import("../../../../models/tenant/master/Section.modal.js");
            const Section = getSectionModel(db);

            const classIds   = [...new Set(sessionAssignments.map(a => a.classId?.toString()).filter(Boolean))];
            const sectionIds = [...new Set(sessionAssignments.map(a => a.sectionId?.toString()).filter(Boolean))];

            const [classes, sections] = await Promise.all([
              Class.find({ _id: { $in: classIds } }, { name: 1 }).lean(),
              Section.find({ _id: { $in: sectionIds } }, { name: 1 }).lean(),
            ]);

            const classMap   = Object.fromEntries(classes.map(c  => [String(c._id), c.name]));
            const sectionMap = Object.fromEntries(sections.map(s => [String(s._id), s.name]));

            assignedClasses = sessionAssignments.map(a => ({
              class:          classMap[String(a.classId)]   || "N/A",
              section:        sectionMap[String(a.sectionId)] || null,
              subject:        a.subjectId ? null : null,  // subjectId lookup optional
              isClassTeacher: a.isClassTeacher || false,
            }));

            // Deduplicate
            const seen = new Set();
            assignedClasses = assignedClasses.filter(a => {
              const key = `${a.class}-${a.section}`;
              if (seen.has(key)) return false;
              seen.add(key); return true;
            });
          }
        }
      } catch (e) {
        console.error("[AI Teacher Classes]:", e.message);
      }
    }

    const profile = {
      name:           [t.firstName, t.middleName, t.lastName].filter(Boolean).join(" "),
      designation:    t.designation    || "N/A",
      department:     t.department     || "N/A",
      employmentType: t.employmentType || "N/A",
      gender:         t.gender         || "N/A",
      dateOfJoining:  t.dateOfJoining ? new Date(t.dateOfJoining).toLocaleDateString("en-IN") : "N/A",
      subjects:       t.subjects?.length ? t.subjects.join(", ") : "N/A",
      status:         t.status         || "N/A",
      employeeId:     t.employeeId     || "N/A",
      assignedClasses,
    };

    return {
      type:      "teacher_search_detailed",
      teacher:   profile,
      nameQuery,
      rawData:   profile,
    };
  }

  /* ── Multiple teachers ── */
  const lines = teachers.map((t, i) => {
    const name = [t.firstName, t.middleName, t.lastName].filter(Boolean).join(" ").trim();
    const desig = t.designation || null;
    const status = t.status || null;
    return `${i + 1}. **${name}**${desig ? ` — ${desig}` : ""}${status && status !== "Active" ? ` (${status})` : ""}`;
  });

  return {
    type:      "teacher_search",
    teachers,
    nameQuery,
    total:     teachers.length,
    formatted: `**"${nameQuery}"** naam se **${teachers.length} teachers** mile:\n${lines.join("\n")}\n\n_Specific teacher ki detail ke liye exact naam batao._`,
  };
}
