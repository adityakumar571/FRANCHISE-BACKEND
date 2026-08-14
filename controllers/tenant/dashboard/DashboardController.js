import mongoose from "mongoose";

import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";
import { getTeacherModel } from "../../../models/tenant/teacher/Teacher.model.js";
import { getStudentPaymentModel } from "../../../models/tenant/master/StudentPayment.model.js";
import { getNoticeModel } from "../../../models/tenant/Notice.model.js";
import { getAttendanceModel } from "../../../models/tenant/student/Attendance.model.js";
import { getMarksheetModel } from "../../../models/tenant/report/Marksheet.model.js";
import { getClassModel } from "../../../models/tenant/master/Class.modal.js";
import { getSectionModel } from "../../../models/tenant/master/Section.modal.js";
import { getStreamModel } from "../../../models/tenant/master/Stream.model.js";
import { getSubjectModel } from "../../../models/tenant/master/Subject.model.js";
import { getExamModel } from "../../../models/tenant/master/Exam.model.js";
import { getExamListModel } from "../../../models/tenant/master/ExamList.model.js";
import { getHomeworkModel } from "../../../models/tenant/master/HomeWork.model.js";
import { getFeeInstallmentModel } from "../../../models/tenant/master/FeeInstallment.model.js";
import { getFeeStructureModel } from "../../../models/tenant/master/FeeStructure.model.js";
import { getStudentPaymentAllocationModel } from "../../../models/tenant/master/StudentPaymentAllocation.model.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import Tenant from "../../../models/tenant.model.js";
import TenantSubscription from "../../../models/TenantSubscription.modal.js";
import { calculateStudentPayableSummary, calculateConcession, buildStudentPeriodMap, buildSequentialConcessionMap }
  from "../../../utils/feeHelper.js";
import { getAdditionalFeeModel } from "../../../models/tenant/master/AdditionalFee.model.js";
import { getTransportFeeModel } from "../../../models/tenant/master/TransportFee.model.js";
import { getLateFeeModel } from "../../../models/tenant/master/LateFee.model.js";
import redisClient from "../../../config/redisClient.js";
/* ================= ADMIN DASHBOARD ================= */
export const getAdminDashboardStats = asyncHandler(async (req, res) => {
  try {
    const StudentEnrolment = getStudentEnrolmentModel(req.db);
    const Teacher = getTeacherModel(req.db);
    const StudentPayment = getStudentPaymentModel(req.db);
    const Notice = getNoticeModel(req.db);
    const Attendance = getAttendanceModel(req.db);
    const Class = getClassModel(req.db);
    const Section = getSectionModel(req.db);
    const Exam = getExamModel(req.db);
    const Homework = getHomeworkModel(req.db);
    const FeeInstallment = getFeeInstallmentModel(req.db);
    const FeeStructure = getFeeStructureModel(req.db);
    const PaymentAlloc = getStudentPaymentAllocationModel(req.db);

    const { sessionId } = req.query;

    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Valid sessionId is required"));
    }

    const sessionObjId = new mongoose.Types.ObjectId(sessionId);


    const cacheKey = `admin-dashboard-${sessionId}`;

    // TEMP: cache disabled — fee calculation updated
    // const cachedData = await redisClient.get(cacheKey);
    // if (cachedData) {
    //   return res.status(200).json(JSON.parse(cachedData));
    // }
    // Today boundaries
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const todayEnd = new Date(new Date().setHours(23, 59, 59, 999));

    // ── Run all queries in parallel ──
    const [
      totalStudents,
      totalLeft,
      totalPassed,
      genderStats,
      categoryStats,
      religionStats,
      classWiseStudents,
      totalTeachers,
      activeTeachers,
      teacherGenderStats,
      earningsAgg,
      paymentModeAgg,
      monthlyEarningsAgg,
      totalClasses,
      totalSections,
      totalNotices,
      totalExams,
      totalHomework,
      todayAttendanceAgg,
      todayNewAdmissions,
      recentStudents,
      recentPayments,
      recentNotices,
      classWiseAttendanceAgg,
    ] = await Promise.all([
      // 1. Total studying students
      StudentEnrolment.countDocuments({
        session: sessionObjId,
        status: "Studying",
      }),

      // 2. Left students
      StudentEnrolment.countDocuments({
        session: sessionObjId,
        status: "Left",
      }),

      // 3. Passed students
      StudentEnrolment.countDocuments({
        session: sessionObjId,
        status: "Passed",
      }),

      // 4. Gender breakdown
      StudentEnrolment.aggregate([
        { $match: { session: sessionObjId, status: "Studying" } },
        { $group: { _id: "$gender", count: { $sum: 1 } } },
      ]),

      // 5. Category breakdown (top 6)
      StudentEnrolment.aggregate([
        { $match: { session: sessionObjId, status: "Studying" } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),

      // 6. Religion breakdown (top 5)
      StudentEnrolment.aggregate([
        { $match: { session: sessionObjId, status: "Studying" } },
        { $group: { _id: "$religion", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),

      // 7. Class-wise student count (top 10 classes)
      StudentEnrolment.aggregate([
        { $match: { session: sessionObjId, status: "Studying" } },
        { $group: { _id: "$currentClass", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "classes",
            localField: "_id",
            foreignField: "_id",
            as: "classInfo",
          },
        },
        {
          $project: {
            className: { $arrayElemAt: ["$classInfo.name", 0] },
            count: 1,
          },
        },
      ]),

      // 8. Total teachers
      Teacher.countDocuments({}),

      // 9. Active teachers
      Teacher.countDocuments({ status: "Active" }),

      // 9b. Teacher gender breakdown
      Teacher.aggregate([
        { $group: { _id: "$gender", count: { $sum: 1 } } },
      ]),

      // 10. Total earnings this session (collected)
      StudentPayment.aggregate([
        { $match: { sessionId: sessionObjId, paymentStatus: "SUCCESS" } },
        { $group: { _id: null, total: { $sum: "$amountPaid" } } },
      ]),

      // 11. Payment mode breakdown
      StudentPayment.aggregate([
        { $match: { sessionId: sessionObjId, paymentStatus: "SUCCESS" } },
        {
          $group: {
            _id: "$paymentMode",
            total: { $sum: "$amountPaid" },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),

      // 12. Monthly earnings — all months of the session year, grouped by paymentDate
      StudentPayment.aggregate([
        {
          $match: {
            sessionId: sessionObjId,
            paymentStatus: "SUCCESS",
          },
        },
        {
          $group: {
            _id: {
              month: { $month: "$paymentDate" },
              year: { $year: "$paymentDate" },
            },
            total: { $sum: "$amountPaid" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),

      // 14. Total active classes
      Class.countDocuments({ isActive: true }),

      // 15. Total active sections
      Section.countDocuments({ isActive: true }),

      // 16. Active notices
      Notice.countDocuments({ session: sessionObjId, isActive: true }),

      // 17. Total exams this session
      Exam.countDocuments({ session: sessionObjId, isActive: true }),

      // 18. Total homework this session
      Homework.countDocuments({ sessionId: sessionObjId, isActive: true }),

      // 19. Today's attendance summary (overall)
      Attendance.aggregate([
        {
          $match: {
            sessionId: sessionObjId,
            date: { $gte: todayStart, $lte: todayEnd },
          },
        },
        { $unwind: "$attendance" },
        { $group: { _id: "$attendance.status", count: { $sum: 1 } } },
      ]),

      // 20. Today's new admissions
      StudentEnrolment.countDocuments({
        session: sessionObjId,
        createdAt: { $gte: todayStart, $lte: todayEnd },
      }),

      // 21. Recent 6 students
      StudentEnrolment.find({ session: sessionObjId, status: "Studying" })
        .sort({ createdAt: -1 })
        .limit(6)
        .select(
          "firstName lastName profilePic currentClass currentSection rollNumber createdAt gender category",
        )
        .populate("currentClass", "name")
        .populate("currentSection", "name")
        .lean(),

      // 22. Recent 6 payments
      StudentPayment.find({ sessionId: sessionObjId, paymentStatus: "SUCCESS" })
        .sort({ createdAt: -1 })
        .limit(6)
        .populate({
          path: "studentId",
          select: "firstName lastName rollNumber",
          model: StudentEnrolment,
        })
        .lean(),


      // 23. Recent 5 notices
      // 23. Recent 5 notices
      Notice.aggregate([
        {
          $match: {
            session: sessionObjId,
            isActive: true,
          },
        },

        {
          $sort: { createdAt: -1 },
        },

        {
          $limit: 5,
        },

        // SENDER USER LOOKUP
        {
          $lookup: {
            from: "users",
            localField: "sender.id",
            foreignField: "_id",
            as: "senderUser",
          },
        },

        {
          $unwind: {
            path: "$senderUser",
            preserveNullAndEmptyArrays: true,
          },
        },

        // STUDENT LOOKUP
        {
          $lookup: {
            from: "studentenrolments",
            localField: "recipients.specificStudents",
            foreignField: "_id",
            as: "studentDetails",
          },
        },

        // OPTIONAL CLASS LOOKUP
        {
          $lookup: {
            from: "classes",
            localField: "recipients.classIds",
            foreignField: "_id",
            as: "classDetails",
          },
        },

        // OPTIONAL SECTION LOOKUP
        {
          $lookup: {
            from: "sections",
            localField: "recipients.sectionIds",
            foreignField: "_id",
            as: "sectionDetails",
          },
        },

        {
          $project: {
            title: 1,
            description: 1,
            attachment: 1,
            createdAt: 1,
            recipients: 1,

            // sender
            senderName: "$senderUser.name",
            senderEmail: "$senderUser.email",
            senderRole: "$sender.role",

            // populated students
            studentDetails: {
              $map: {
                input: "$studentDetails",
                as: "student",
                in: {
                  _id: "$$student._id",
                  firstName: "$$student.firstName",
                  lastName: "$$student.lastName",
                  rollNumber: "$$student.rollNumber",
                  profilePic: "$$student.profilePic",
                },
              },
            },

            // populated classes
            classDetails: {
              $map: {
                input: "$classDetails",
                as: "cls",
                in: {
                  _id: "$$cls._id",
                  name: "$$cls.name",
                },
              },
            },

            // populated sections
            sectionDetails: {
              $map: {
                input: "$sectionDetails",
                as: "sec",
                in: {
                  _id: "$$sec._id",
                  name: "$$sec.name",
                },
              },
            },
          },
        },
      ]),


      // 23. Section-wise attendance today — P/A/L/H per class+section
      Attendance.aggregate([
        {
          $match: {
            sessionId: sessionObjId,
            date: { $gte: todayStart, $lte: todayEnd },
          },
        },
        { $unwind: "$attendance" },
        {
          $group: {
            _id: {
              classId: "$classId",
              sectionId: "$sectionId",
              status: "$attendance.status",
            },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: { classId: "$_id.classId", sectionId: "$_id.sectionId" },
            statuses: {
              $push: { status: "$_id.status", count: "$count" },
            },
            total: { $sum: "$count" },
          },
        },
        {
          $lookup: {
            from: "classes",
            localField: "_id.classId",
            foreignField: "_id",
            as: "classInfo",
          },
        },
        {
          $lookup: {
            from: "sections",
            localField: "_id.sectionId",
            foreignField: "_id",
            as: "sectionInfo",
          },
        },
        {
          $project: {
            className: { $arrayElemAt: ["$classInfo.name", 0] },
            sectionName: { $arrayElemAt: ["$sectionInfo.name", 0] },
            statuses: 1,
            total: 1,
          },
        },
        { $sort: { className: 1, sectionName: 1 } },
      ]),
    ]);

    // ── Process gender ──
    let totalMale = 0,
      totalFemale = 0,
      totalOther = 0;
    genderStats.forEach((g) => {
      if (g._id === "Male") totalMale = g.count;
      if (g._id === "Female") totalFemale = g.count;
      if (g._id === "Other") totalOther = g.count;
    });

    // ── Process teacher gender ──
    let teacherMale = 0, teacherFemale = 0, teacherOther = 0;
    teacherGenderStats.forEach((g) => {
      if (g._id === "Male") teacherMale = g.count;
      if (g._id === "Female") teacherFemale = g.count;
      if (g._id === "Other") teacherOther = g.count;
    });

    // ── Process earnings ──
    // const totalEarnings = earningsAgg[0]?.total || 0;
    // ── Process earnings ──

    // ── Pending fees calculation (mirrors feeHelper.js logic) ──
    //
    // TUITION  : FeeInstallment is a CLASS-LEVEL template → multiply by students per class
    // ADDITIONAL: AdditionalFee has classId (null = all classes) → match per student's class
    // TRANSPORT : TransportFee is PER-STUDENT → direct sum (deduplicate by period)
    // totalAllocated = all PaymentAllocation amounts for SUCCESS payments this session
    // pendingFees = totalPayable - totalAllocated
    //
    // let pendingFees = 0;
    // let pendingCount = 0;
    // try {
    //   const { getAdditionalFeeModel } =
    //     await import("../../../models/tenant/master/AdditionalFee.model.js");
    //   const { getTransportFeeModel } =
    //     await import("../../../models/tenant/master/TransportFee.model.js");
    //   const AdditionalFee = getAdditionalFeeModel(req.db);
    //   const TransportFee = getTransportFeeModel(req.db);

    //   // ── Step 1: all SUCCESS payment IDs this session ──
    //   const successPaymentIds = await StudentPayment.find(
    //     { sessionId: sessionObjId, paymentStatus: "SUCCESS" },
    //     "_id",
    //   )
    //     .lean()
    //     .then((docs) => docs.map((d) => d._id));

    //   // ── Step 2: total already allocated (TUITION + ADDITIONAL + TRANSPORT) ──
    //   let totalAllocated = 0;
    //   if (successPaymentIds.length > 0) {
    //     const allocAgg = await PaymentAlloc.aggregate([
    //       { $match: { paymentId: { $in: successPaymentIds } } },
    //       { $group: { _id: null, total: { $sum: "$allocatedAmount" } } },
    //     ]);
    //     totalAllocated = allocAgg[0]?.total || 0;
    //   }

    //   // ── Step 3: TUITION payable — per-student × class installments ──
    //   const studyingStudents = await StudentEnrolment.find(
    //     { session: sessionObjId, status: "Studying" },
    //     "currentClass streamId",
    //   ).lean();

    //   // Build unique class+stream keys to avoid repeated DB hits
    //   const classInstCache = {};
    //   for (const s of studyingStudents) {
    //     const key = `${s.currentClass}_${s.streamId || "null"}`;
    //     if (classInstCache[key] !== undefined) continue;

    //     const structures = await FeeStructure.find(
    //       { sessionId: sessionObjId, classId: s.currentClass, isActive: true },
    //       "_id",
    //     ).lean();
    //     const structIds = structures.map((x) => x._id);

    //     if (structIds.length > 0) {
    //       const instAgg = await FeeInstallment.aggregate([
    //         { $match: { feeStructureId: { $in: structIds } } },
    //         {
    //           $group: {
    //             _id: null,
    //             total: { $sum: "$amount" },
    //             count: { $sum: 1 },
    //           },
    //         },
    //       ]);
    //       classInstCache[key] = {
    //         total: instAgg[0]?.total || 0,
    //         count: instAgg[0]?.count || 0,
    //       };
    //     } else {
    //       classInstCache[key] = { total: 0, count: 0 };
    //     }
    //   }

    //   let totalTuitionPayable = 0;
    //   let totalInstallmentCount = 0;
    //   for (const s of studyingStudents) {
    //     const key = `${s.currentClass}_${s.streamId || "null"}`;
    //     totalTuitionPayable += classInstCache[key]?.total || 0;
    //     totalInstallmentCount += classInstCache[key]?.count || 0;
    //   }

    //   // ── Step 4: ADDITIONAL fees payable — match per student's class (same as feeHelper) ──
    //   // AdditionalFee: classId=null means all students; classId set means only that class
    //   let totalAdditionalPayable = 0;
    //   for (const s of studyingStudents) {
    //     const addlFees = await AdditionalFee.find(
    //       {
    //         sessionId: sessionObjId,
    //         isActive: true,
    //         $or: [
    //           { classId: null, streamId: null },
    //           { classId: s.currentClass, streamId: null },
    //           ...(s.streamId
    //             ? [{ classId: s.currentClass, streamId: s.streamId }]
    //             : []),
    //         ],
    //       },
    //       "amount",
    //     ).lean();
    //     totalAdditionalPayable += addlFees.reduce(
    //       (sum, f) => sum + (f.amount || 0),
    //       0,
    //     );
    //   }

    //   // ── Step 5: TRANSPORT fees payable — per-student, deduplicate by period ──
    //   // TransportFee is already per-student; sum active records, dedup by period
    //   const allTransportRaw = await TransportFee.find(
    //     { sessionId: sessionObjId, isActive: true },
    //     "studentId period amount",
    //   ).lean();

    //   // Deduplicate: keep one record per studentId+period (latest)
    //   const transportMap = {};
    //   for (const t of allTransportRaw) {
    //     const key = `${t.studentId}_${t.period}`;
    //     if (!transportMap[key]) transportMap[key] = t;
    //   }
    //   const totalTransportPayable = Object.values(transportMap).reduce(
    //     (sum, t) => sum + (t.amount || 0),
    //     0,
    //   );

    //   const totalPayable =
    //     totalTuitionPayable + totalAdditionalPayable + totalTransportPayable;
    //   pendingFees = Math.max(totalPayable - totalAllocated, 0);
    //   pendingCount = totalInstallmentCount;
    // } catch (feeErr) {
    //   console.error("Pending fees calculation error:", feeErr.message);
    //   pendingFees = 0;
    // }
    // ── Fee calculation — same logic as feeDefaultersMonthwise (sequential concession, isPeriodDue) ──

    let expectedFees = 0;
    let pendingFees = 0;
    let pendingCount = 0;
    let totalCollectedFees = 0;

    try {
      const AdditionalFeeDash  = getAdditionalFeeModel(req.db);
      const TransportFeeDash   = getTransportFeeModel(req.db);
      const LateFeeDash        = getLateFeeModel(req.db);

      const studyingStudents = await StudentEnrolment.find(
        { session: sessionObjId, status: "Studying" },
        "_id currentClass currentSection streamId stream discount discountType fullFeeConcession fullFeeExceptTransport"
      ).lean();

      const dashStudentIds = studyingStudents.map((s) => s._id);

      // Bulk fetch fee structures & installments
      const dashFeeStructures = await FeeStructure.find({ sessionId: sessionObjId, isActive: true }).lean();
      const dashFsIds  = dashFeeStructures.map((fs) => fs._id);
      const dashFsById = Object.fromEntries(dashFeeStructures.map((fs) => [fs._id.toString(), fs]));
      const dashAllInst = dashFsIds.length
        ? await FeeInstallment.find({ feeStructureId: { $in: dashFsIds } }).lean()
        : [];

      // Additional fees
      const dashAddlFees = await AdditionalFeeDash.find({ sessionId: sessionObjId, isActive: true }).lean();

      // Transport fees
      const dashAllTransport = dashStudentIds.length
        ? await TransportFeeDash.find({ studentId: { $in: dashStudentIds }, sessionId: sessionObjId }).lean()
        : [];

      // Payments & allocations
      const dashAllPayments = dashStudentIds.length
        ? await StudentPayment.find({ studentId: { $in: dashStudentIds }, sessionId: sessionObjId, paymentStatus: "SUCCESS" }).lean()
        : [];
      const dashPayIds = dashAllPayments.map((p) => p._id);
      const dashAllAllocs = dashPayIds.length
        ? await PaymentAlloc.find({ paymentId: { $in: dashPayIds } }).lean()
        : [];

      // studentId → allocMap
      const dashPayStudentMap = {};
      for (const p of dashAllPayments) dashPayStudentMap[p._id.toString()] = p.studentId.toString();
      const dashStudentAllocMap = {};
      for (const a of dashAllAllocs) {
        const sid = dashPayStudentMap[a.paymentId.toString()];
        if (!sid) continue;
        const rid = a.referenceId.toString();
        if (!dashStudentAllocMap[sid]) dashStudentAllocMap[sid] = {};
        dashStudentAllocMap[sid][rid] = (dashStudentAllocMap[sid][rid] || 0) + Number(a.allocatedAmount || 0);
      }

      // Paid transport referenceIds for dedup
      const dashPaidTransportRefIds = new Set(
        dashAllAllocs
          .filter((a) => a.feeType === "TRANSPORT" && Number(a.allocatedAmount || 0) > 0)
          .map((a) => a.referenceId.toString())
      );

      // studentId → transport by period (deduped)
      const dashStudentTransport = {};
      for (const t of dashAllTransport) {
        const sid = t.studentId.toString();
        if (!dashStudentTransport[sid]) dashStudentTransport[sid] = {};
        const existing = dashStudentTransport[sid][t.period];
        if (!existing) { dashStudentTransport[sid][t.period] = t; continue; }
        const tPaid = dashPaidTransportRefIds.has(t._id.toString());
        const ePaid = dashPaidTransportRefIds.has(existing._id.toString());
        if (tPaid && !ePaid) { dashStudentTransport[sid][t.period] = t; continue; }
        if (!tPaid && ePaid) continue;
        if (t.isActive && !existing.isActive) { dashStudentTransport[sid][t.period] = t; continue; }
        if (!t.isActive && existing.isActive) continue;
        if (new Date(t.updatedAt) > new Date(existing.updatedAt)) dashStudentTransport[sid][t.period] = t;
      }

      // Late fees
      const dashAllLateFees = dashStudentIds.length
        ? await LateFeeDash.find({ studentId: { $in: dashStudentIds }, sessionId: sessionObjId, isWaived: false, amount: { $gt: 0 } }).lean()
        : [];
      const dashStudentLateFeeMap = {};
      for (const lf of dashAllLateFees) {
        const sid = lf.studentId.toString();
        if (!dashStudentLateFeeMap[sid]) dashStudentLateFeeMap[sid] = [];
        dashStudentLateFeeMap[sid].push(lf);
      }

      // Period helpers
      const DASH_PERIOD_ORDER = ["APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH","APR-JUN","JUL-SEP","OCT-DEC","JAN-MAR"];
      const DASH_QUARTERLY = { "APR-JUN":["APRIL","MAY","JUNE"],"JUL-SEP":["JULY","AUGUST","SEPTEMBER"],"OCT-DEC":["OCTOBER","NOVEMBER","DECEMBER"],"JAN-MAR":["JANUARY","FEBRUARY","MARCH"] };
      const dashCurrentPeriod = () => { const m=["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"]; return m[new Date().getMonth()]; };
      const dashIsPeriodDue = (period) => {
        const cur = dashCurrentPeriod();
        const monthly = DASH_PERIOD_ORDER.slice(0, 12);
        const curIdx = monthly.indexOf(cur);
        if (curIdx === -1) return true;
        if (DASH_QUARTERLY[period]) return DASH_QUARTERLY[period].some((m) => monthly.indexOf(m) <= curIdx);
        const pIdx = monthly.indexOf(period);
        return pIdx === -1 ? true : pIdx <= curIdx;
      };

      for (const student of studyingStudents) {
        const cid    = student.currentClass?.toString();
        const stId   = student._id.toString();
        if (!cid) continue;

        const rawStreamId = student.stream?.toString() || student.streamId?.toString() || null;
        const validStreamId = rawStreamId && /^[a-f\d]{24}$/i.test(rawStreamId) ? rawStreamId : null;
        const allocMap = dashStudentAllocMap[stId] || {};

        const myInsts = dashAllInst.filter((inst) => {
          const fs = dashFsById[inst.feeStructureId.toString()];
          return fs && fs.classId.toString() === cid && (fs.streamId?.toString() || null) === validStreamId;
        });
        const myAddl = dashAddlFees.filter((f) => {
          const fc = f.classId?.toString() || null;
          const fs = f.streamId?.toString() || null;
          return (!fc && !fs) || (fc === cid && !fs) || (fc === cid && fs === validStreamId);
        });
        const transportByPeriod = dashStudentTransport[stId] || {};

        const periodMap = buildStudentPeriodMap({ myInsts, myAdditional: myAddl, transportByPeriod, allocMap });

        const tuitionTotal    = myInsts.reduce((s, i) => s + Number(i.amount || 0), 0);
        const additionalTotal = myAddl.reduce((s, f) => s + Number(f.amount || 0), 0);
        const transportTotal  = Object.values(transportByPeriod).reduce((s, t) => s + Number(t.amount || 0), 0);
        const concession      = calculateConcession({ student, totalFee: tuitionTotal, transportTotal });
        const netPayable      = Math.max(tuitionTotal + additionalTotal + transportTotal - concession, 0);

        const totalPaid = Object.values(periodMap).reduce((s, v) => s + v.paidAmount, 0);

        // Late fee due
        const myLateFees = dashStudentLateFeeMap[stId] || [];
        let lateFeeDue = 0;
        let lateFeePaidAmt = 0;
        for (const lf of myLateFees) {
          const paid = allocMap[lf._id.toString()] || 0;
          const lfAmount = Number(lf.amount) || 0;
          // Cap paid at lf.amount so collected + pending = expected for late fees too
          lateFeePaidAmt += Math.min(paid, lfAmount);
          lateFeeDue += Math.max(0, lfAmount - paid);
        }

        // Sequential concession map (tuition-only periods)
        const tuitionOnlyMap = {};
        for (const inst of myInsts) {
          const per = inst.period;
          if (!tuitionOnlyMap[per]) tuitionOnlyMap[per] = { totalFee: 0, paidAmount: 0 };
          tuitionOnlyMap[per].totalFee += Number(inst.amount || 0);
        }
        const periodConcMap = buildSequentialConcessionMap({ periodMap: tuitionOnlyMap, concession });

        // Due months (current/past only, concession-adjusted)
        const dueMonths = Object.entries(periodMap)
          .filter(([per, vals]) => {
            if (!dashIsPeriodDue(per)) return false;
            const rawDue = parseFloat((vals.totalFee - vals.paidAmount).toFixed(2));
            if (rawDue <= 0) return false;
            return parseFloat(Math.max(rawDue - (periodConcMap[per] || 0), 0).toFixed(2)) > 0;
          })
          .map(([per]) => per);

        // Total pending (concession-adjusted due + late fee)
        const studentPending = parseFloat((
          dueMonths.reduce((sum, per) => {
            const vals = periodMap[per];
            const rawDue = parseFloat((vals.totalFee - vals.paidAmount).toFixed(2));
            return sum + parseFloat(Math.max(rawDue - (periodConcMap[per] || 0), 0).toFixed(2));
          }, 0) + lateFeeDue
        ).toFixed(2));

        // Expected = due periods net fee (concession-adjusted) + full late fee (paid + due)
        // Formula guarantee: Expected = Collected + Pending (always)
        //   collected = Σ min(paid, netFee) per due period + lateFeePaid
        //   pending   = Σ max(netFee-paid, 0) per due months + lateFeeDue
        //   expected  = Σ netFee per due periods + (lateFeePaid + lateFeeDue)
        const lateFeeExpected = lateFeePaidAmt + lateFeeDue;

        const duePeriods = Object.keys(periodMap).filter((per) => dashIsPeriodDue(per));
        const studentExpected = parseFloat((
          duePeriods.reduce((sum, per) => {
            const vals = periodMap[per];
            const conc   = periodConcMap[per] || 0;
            return sum + parseFloat(Math.max(vals.totalFee - conc, 0).toFixed(2));
          }, 0) + lateFeeExpected
        ).toFixed(2));

        // Collected = sirf due periods (current month tak) ka paid (capped at netFee) + late fee paid (capped)
        // Cap ensures: collected + pending = expected (always)
        const studentCollected = parseFloat((
          duePeriods.reduce((sum, per) => {
            const vals = periodMap[per];
            const conc = periodConcMap[per] || 0;
            const netFee = parseFloat(Math.max(vals.totalFee - conc, 0).toFixed(2));
            return sum + Math.min(vals.paidAmount, netFee);
          }, 0) + lateFeePaidAmt
        ).toFixed(2));

        expectedFees      += studentExpected;
        totalCollectedFees += studentCollected;
        pendingFees        += studentPending;
        if (studentPending > 0) pendingCount++;

        // DEBUG: trace each student
        console.log(`[AdminDash] student=${stId.slice(-4)} duePeriods=[${duePeriods.join(',')}] expected=${studentExpected} collected=${studentCollected} pending=${studentPending} lateFeeDue=${lateFeeDue} lateFeePaid=${lateFeePaidAmt}`);
        for (const per of duePeriods) {
          const v = periodMap[per]; const c = periodConcMap[per]||0;
          const nf = Math.max((v?.totalFee||0)-c,0);
          console.log(`  [${per}] totalFee=${v?.totalFee} paid=${v?.paidAmount} conc=${c} netFee=${nf} cappedPaid=${Math.min(v?.paidAmount||0,nf)}`);
        }
      }

    } catch (feeErr) {

      console.error(
        "Dashboard fee calculation error:",
        feeErr.message
      );

      expectedFees = 0;
      pendingFees = 0;
      totalCollectedFees = 0;
    }
    const totalEarnings = totalCollectedFees;

    // ── Collection rate ──
    const collectionRate =
      expectedFees > 0
        ? Math.min(
          Math.round(
            (totalEarnings / expectedFees) * 100
          ),
          100
        )
        : 0;
    // ── Process monthly earnings — zero-fill all 12 months ──
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // Build a map of month-year → data from DB
    const earningsMap = {};
    monthlyEarningsAgg.forEach((m) => {
      const key = `${m._id.year}-${m._id.month}`;
      earningsMap[key] = { earnings: m.total, count: m.count };
    });

    // Determine the year range from actual data, fallback to current year
    const years =
      monthlyEarningsAgg.length > 0
        ? [...new Set(monthlyEarningsAgg.map((m) => m._id.year))].sort()
        : [new Date().getFullYear()];

    // Build full 12-month array for each year that has data
    const monthlyEarnings = [];
    years.forEach((year) => {
      for (let mo = 1; mo <= 12; mo++) {
        const key = `${year}-${mo}`;
        const data = earningsMap[key] || { earnings: 0, count: 0 };
        monthlyEarnings.push({
          month: monthNames[mo - 1],
          year,
          earnings: data.earnings,
          count: data.count,
        });
      }
    });

    // ── Process today attendance ──
    let todayPresent = 0,
      todayAbsent = 0,
      todayHoliday = 0;
    todayAttendanceAgg.forEach((a) => {
      if (a._id === "P") todayPresent = a.count;
      if (a._id === "A") todayAbsent = a.count;
      if (a._id === "H") todayHoliday = a.count;
    });
    const todayTotal = todayPresent + todayAbsent + todayHoliday;
    const todayAttendancePct =
      todayTotal > 0 ? +((todayPresent / todayTotal) * 100).toFixed(1) : 0;

    // ── Process section-wise attendance ──
    const classWiseAttendance = classWiseAttendanceAgg
      .filter((c) => c.className)
      .map((c) => {
        const stats = { P: 0, A: 0, H: 0 };
        c.statuses.forEach((s) => {
          if (s.status in stats) stats[s.status] = s.count;
        });
        const total = c.total;
        const presentPct =
          total > 0 ? +((stats.P / total) * 100).toFixed(1) : 0;
        // Label: "Nursery - A" or just "Nursery" if no section
        const label = c.sectionName
          ? `${c.className} - ${c.sectionName}`
          : c.className;
        return {
          className: label,
          sectionName: c.sectionName || null,
          present: stats.P,
          absent: stats.A,
          holiday: stats.H,
          total,
          presentPct,
        };
      });

    // ── Process class-wise (filter out null class names) ──
    const classWise = classWiseStudents
      .filter((c) => c.className)
      .map((c) => ({ className: c.className, count: c.count }));

    // ── Subscription ──
    const tenant = await Tenant.findOne({ subdomain: req.tenant?.subdomain });
    let subscription = null;
    if (tenant) {
      const sub = await TenantSubscription.findOne({
        tenantId: tenant._id.toString(),
      });
      if (sub) {
        const now = new Date();
        const isPlanActive =
          sub.status === "ACTIVE" &&
          sub.currentPlan?.startDate <= now &&
          sub.currentPlan?.endDate >= now;
        subscription = {
          isPlanActive,
          activePlan: isPlanActive ? sub.currentPlan : null,
          totalStudentLimit: sub.totalStudentLimit || 0,
          usedStudents: sub.usedStudents || 0,
          remainingStudents:
            (sub.totalStudentLimit || 0) - (sub.usedStudents || 0),
        };
      }
    }

    //     res.status(200).json(
    //       new apiResponse(
    //         200,
    //         {
    //           // ── Core counts ──
    //           totalStudents,
    //           totalLeft,
    //           totalPassed,
    //           totalTeachers,
    //           activeTeachers,
    //           expectedFees,
    //           totalEarnings,
    //           pendingFees,
    //           pendingCount,
    //           collectionRate,
    //           totalClasses,
    //           totalSections,
    //           totalNotices,
    //           totalExams,
    //           totalHomework,
    //           todayNewAdmissions,

    //           // ── Breakdowns ──
    //           genderStats: {
    //             male: totalMale,
    //             female: totalFemale,
    //             other: totalOther,
    //           },
    //           categoryStats,
    //           religionStats,
    //           classWiseStudents: classWise,
    //           paymentModeStats: paymentModeAgg,

    //           // ── Today attendance ──
    //           todayAttendance: {
    //             present: todayPresent,
    //             absent: todayAbsent,
    //             holiday: todayHoliday,
    //             total: todayTotal,
    //             percentage: todayAttendancePct,
    //           },

    //           // ── Class-wise attendance today ──
    //           classWiseAttendance,

    //           // ── Monthly trend ──
    //           monthlyEarnings,

    //           // ── Recent data ──
    //           recentStudents,
    //           recentPayments,
    //           recentNotices,

    //           // ── Subscription ──
    //           subscription,
    //         },
    //         "Dashboard stats fetched successfully",
    //       ),
    //     );

    //   } catch (error) {
    //     res.status(500).json(new apiResponse(500, null, error.message));
    //   }
    // });


    const responseData = new apiResponse(
      200,
      {
        totalStudents,
        totalLeft,
        totalPassed,
        totalTeachers,
        activeTeachers,
        expectedFees,
        totalEarnings,
        pendingFees,
        pendingCount,
        collectionRate,
        totalClasses,
        totalSections,
        totalNotices,
        totalExams,
        totalHomework,
        todayNewAdmissions,


        genderStats: {
          male: totalMale,
          female: totalFemale,
          other: totalOther,
        },

        teacherGenderStats: {
          male: teacherMale,
          female: teacherFemale,
          other: teacherOther,
        },

        categoryStats,
        religionStats,
        classWiseStudents: classWise,
        paymentModeStats: paymentModeAgg,

        todayAttendance: {
          present: todayPresent,
          absent: todayAbsent,
          holiday: todayHoliday,
          total: todayTotal,
          percentage: todayAttendancePct,
        },

        classWiseAttendance,

        monthlyEarnings,

        recentStudents,
        recentPayments,
        recentNotices,

        subscription,


      },
      "Dashboard stats fetched successfully"
    );

    // TEMP: cache disabled — fee calculation updated
    // await redisClient.setEx(
    //   cacheKey,
    //   300,
    //   JSON.stringify(responseData)
    // );

    // SEND RESPONSE
    return res.status(200).json(responseData);

  } catch (error) {

    return res.status(500).json(
      new apiResponse(500, null, error.message)
    );
  }
});

/* ================= DATE-WISE CLASS ATTENDANCE ================= */
export const getDateWiseClassAttendance = asyncHandler(async (req, res) => {
  try {
    const Attendance = getAttendanceModel(req.db);

    const { sessionId, date } = req.query;

    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Valid sessionId is required"));
    }

    if (!date) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "date is required (YYYY-MM-DD)"));
    }

    const sessionObjId = new mongoose.Types.ObjectId(sessionId);

    // Build date boundaries for the requested date
    const requestedDate = new Date(date);
    if (isNaN(requestedDate.getTime())) {
      return res
        .status(400)
        .json(
          new apiResponse(400, null, "Invalid date format. Use YYYY-MM-DD"),
        );
    }
    const dateStart = new Date(requestedDate.setHours(0, 0, 0, 0));
    const dateEnd = new Date(new Date(date).setHours(23, 59, 59, 999));

    const classWiseAttendanceAgg = await Attendance.aggregate([
      {
        $match: {
          sessionId: sessionObjId,
          date: { $gte: dateStart, $lte: dateEnd },
        },
      },
      { $unwind: "$attendance" },
      {
        $group: {
          _id: {
            classId: "$classId",
            sectionId: "$sectionId",
            status: "$attendance.status",
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: { classId: "$_id.classId", sectionId: "$_id.sectionId" },
          statuses: {
            $push: { status: "$_id.status", count: "$count" },
          },
          total: { $sum: "$count" },
        },
      },
      {
        $lookup: {
          from: "classes",
          localField: "_id.classId",
          foreignField: "_id",
          as: "classInfo",
        },
      },
      {
        $lookup: {
          from: "sections",
          localField: "_id.sectionId",
          foreignField: "_id",
          as: "sectionInfo",
        },
      },
      {
        $project: {
          className: { $arrayElemAt: ["$classInfo.name", 0] },
          sectionName: { $arrayElemAt: ["$sectionInfo.name", 0] },
          statuses: 1,
          total: 1,
        },
      },
      { $sort: { className: 1, sectionName: 1 } },
    ]);

    const classWiseAttendance = classWiseAttendanceAgg
      .filter((c) => c.className)
      .map((c) => {
        const stats = { P: 0, A: 0, H: 0 };
        c.statuses.forEach((s) => {
          if (s.status in stats) stats[s.status] = s.count;
        });
        const total = c.total;
        const presentPct =
          total > 0 ? +((stats.P / total) * 100).toFixed(1) : 0;
        const label = c.sectionName
          ? `${c.className} - ${c.sectionName}`
          : c.className;
        return {
          className: label,
          sectionName: c.sectionName || null,
          present: stats.P,
          absent: stats.A,
          holiday: stats.H,
          total,
          presentPct,
        };
      });

    return res
      .status(200)
      .json(
        new apiResponse(
          200,
          { classWiseAttendance },
          "Date-wise attendance fetched successfully",
        ),
      );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= STUDENT DASHBOARD ================= */
export const getStudentDashboardStats = asyncHandler(async (req, res) => {
  try {
    const Notice = getNoticeModel(req.db);
    const Attendance = getAttendanceModel(req.db);
    const Marksheet = getMarksheetModel(req.db);
    const Homework = getHomeworkModel(req.db);
    const StudentPayment = getStudentPaymentModel(req.db);
    const StudentEnrolment = getStudentEnrolmentModel(req.db);

    const { sessionId, studentId } = req.query;

    if (
      !sessionId ||
      !studentId ||
      !mongoose.Types.ObjectId.isValid(sessionId) ||
      !mongoose.Types.ObjectId.isValid(studentId)
    ) {
      return res
        .status(400)
        .json(
          new apiResponse(400, null, "Valid sessionId and studentId required"),
        );
    }

    const sessionObjectId = new mongoose.Types.ObjectId(sessionId);
    const studentObjectId = new mongoose.Types.ObjectId(studentId);

    // ── Get student enrolment to know class/section ──
    const enrolment = await StudentEnrolment.findById(studentObjectId)
      .populate("currentClass", "name")
      .populate("currentSection", "name")
      .lean();

    const tenant = await Tenant.findOne({
      subdomain: req.tenant?.subdomain,
    }).select("schoolName logo");

    const classId = enrolment?.currentClass?._id;
    const sectionId = enrolment?.currentSection?._id;

    // ── Run all queries in parallel ──
    const [
      totalNotices,
      recentNotices,
      attendanceRecords,
      allMarksheets,
      recentHomework,
      totalHomework,
      unreadHomeworkCount,
      feePayments,
    ] = await Promise.all([
      // 1. Unread notices count (readBy mein userId nahi hai)
      Notice.countDocuments({
        session: sessionObjectId,
        isActive: true,
        readBy: { $ne: enrolment?.userId },
        $or: [
          { "recipients.roles": "Student" },
          { "recipients.specificStudents": studentObjectId },
          ...(classId ? [{ "recipients.classIds": classId }] : []),
          ...(sectionId ? [{ "recipients.sectionIds": sectionId }] : []),
        ],
      }),

      // 2. Recent 5 notices
      Notice.find({
        session: sessionObjectId,
        isActive: true,
        $or: [
          { "recipients.roles": "Student" },
          { "recipients.specificStudents": studentObjectId },
          ...(classId ? [{ "recipients.classIds": classId }] : []),
          ...(sectionId ? [{ "recipients.sectionIds": sectionId }] : []),
        ],
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("title description createdAt")
        .lean(),

      // 3. All attendance records for this student
      Attendance.find({
        sessionId: sessionObjectId,
        "attendance.studentId": studentObjectId,
      }).lean(),

      // 4. All marksheets (for subject-wise performance)
      Marksheet.find({
        sessionId: sessionObjectId,
        studentId: studentObjectId,
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      // 5. Recent 5 homework for student's class+section
      classId && sectionId
        ? Homework.find({
          sessionId: sessionObjectId,
          classId,
          sectionId,
          isActive: true,
        })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate("subjectId", "name")
          .lean()
        : Promise.resolve([]),

      // 6. Total homework count
      classId && sectionId
        ? Homework.countDocuments({
          sessionId: sessionObjectId,
          classId,
          sectionId,
          isActive: true,
        })
        : Promise.resolve(0),
      // 7. Unread homework count
      classId && sectionId
        ? Homework.countDocuments({
          sessionId: sessionObjectId,
          classId,
          sectionId,
          isActive: true,

          "readBy.studentId": {
            $ne: studentObjectId,
          },
        })
        : Promise.resolve(0),

      // 7. Fee payments for this student
      StudentPayment.find({
        sessionId: sessionObjectId,
        studentId: studentObjectId,
      }).lean(),
    ]);

    // ── Process attendance ──
    let totalPresent = 0,
      totalAbsent = 0,
      totalHoliday = 0;
    attendanceRecords.forEach((record) => {
      const entry = record.attendance.find(
        (a) => a.studentId.toString() === studentObjectId.toString(),
      );
      if (entry) {
        if (entry.status === "P") totalPresent++;
        else if (entry.status === "A") totalAbsent++;
        else if (entry.status === "H") totalHoliday++;
      }
    });
    const totalDays = totalPresent + totalAbsent;
    const attendancePercentage =
      totalDays > 0 ? +((totalPresent / totalDays) * 100).toFixed(2) : 0;

    // ── Process marksheets ──
    const latestMarksheet = allMarksheets[0] || null;
    const marksPercentage = latestMarksheet?.percentage || 0;

    // Subject-wise performance from latest marksheet
    const subjectPerformance = latestMarksheet?.subjects
      ? latestMarksheet.subjects.map((s) => ({
        subjectName: s.subjectName || "—",
        marksObtained: s.marksObtained || 0,
        maxMarks: s.maxMarks || 0,
        percentage:
          s.maxMarks > 0
            ? +((s.marksObtained / s.maxMarks) * 100).toFixed(1)
            : 0,
        grade: s.grade || null,
      }))
      : [];

    // Exam history (last 5 marksheets)
    const examHistory = allMarksheets.map((m) => ({
      examName: m.examName || "Exam",
      percentage: m.percentage || 0,
      result: m.result || null,
      createdAt: m.createdAt,
    }));

    // ── Process fees ──
    const totalPaid = feePayments
      .filter((f) => f.paymentStatus === "SUCCESS")
      .reduce((s, f) => s + (f.amountPaid || 0), 0);
    const recentPayments = feePayments
      .filter((f) => f.paymentStatus === "SUCCESS")
      .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))
      .slice(0, 3)
      .map((f) => ({
        amount: f.amountPaid,
        mode: f.paymentMode,
        date: f.paymentDate,
        receiptNo: f.receiptNo,
      }));

    // ── Process homework ──
    const homeworkList = recentHomework.map((h) => ({
      _id: h._id,
      title: h.title,
      type: h.homeworkType,
      subjectName: h.subjectId?.name || "—",
      dueDate: h.dueDate,
      assignDate: h.assignDate,
    }));

    res.status(200).json(
      new apiResponse(
        200,
        {
          schoolInfo: {
            schoolName: tenant?.schoolName || "",
            schoolLogo: tenant?.logo || "",
          },
          // ── Attendance ──
          attendance: {
            present: totalPresent,
            absent: totalAbsent,
            holiday: totalHoliday,
            totalDays,
            percentage: attendancePercentage,
          },

          // ── Exam / Marks ──
          latestExamPercentage: marksPercentage,
          subjectPerformance,
          examHistory,

          // ── Notices ──
          unreadNotices: totalNotices,
          recentNotices,

          // ── Homework ──
          totalHomework,
          unreadHomeworkCount,
          recentHomework: homeworkList,

          // ── Fees ──
          fees: {
            totalPaid,
            recentPayments,
          },
        },
        "Student dashboard stats fetched successfully",
      ),
    );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= PARENT DASHBOARD ================= */
export const getParentDashboardStats = asyncHandler(async (req, res) => {
  try {
    const StudentEnrolment = getStudentEnrolmentModel(req.db);
    const Attendance = getAttendanceModel(req.db);
    const Marksheet = getMarksheetModel(req.db);
    const Notice = getNoticeModel(req.db);
    const StudentPayment = getStudentPaymentModel(req.db);

    const { sessionId, parentUserId } = req.query;

    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Valid sessionId required"));
    }

    const sessionObjectId = new mongoose.Types.ObjectId(sessionId);

    // Find children linked to this parent user
    const children = await StudentEnrolment.find({
      session: sessionObjectId,
      userId: parentUserId
        ? new mongoose.Types.ObjectId(parentUserId)
        : undefined,
      status: "Studying",
    })
      .populate("currentClass", "name")
      .populate("currentSection", "name")
      .lean();

    const childrenData = await Promise.all(
      children.map(async (child) => {
        const childId = child._id;

        // Attendance
        const attendanceRecords = await Attendance.find({
          sessionId: sessionObjectId,
          "attendance.studentId": childId,
        });
        let present = 0,
          absent = 0;
        attendanceRecords.forEach((rec) => {
          const entry = rec.attendance.find(
            (a) => a.studentId.toString() === childId.toString(),
          );
          if (entry?.status === "P") present++;
          if (entry?.status === "A") absent++;
        });
        const totalDays = present + absent;
        const attendPct =
          totalDays > 0 ? +((present / totalDays) * 100).toFixed(1) : 0;

        // Latest exam
        const latestMark = await Marksheet.findOne({
          sessionId: sessionObjectId,
          studentId: childId,
        }).sort({ createdAt: -1 });
        const examPct = latestMark?.percentage || 0;

        // Fee dues
        const feePayments = await StudentPayment.find({
          sessionId: sessionObjectId,
          studentId: childId,
        }).lean();
        const totalPaid = feePayments
          .filter((f) => f.paymentStatus === "SUCCESS")
          .reduce((s, f) => s + (f.amountPaid || 0), 0);
        const totalDue = feePayments
          .filter((f) => f.paymentStatus !== "SUCCESS")
          .reduce((s, f) => s + (f.amountPaid || 0), 0);

        return {
          _id: childId,
          firstName: child.firstName,
          lastName: child.lastName,
          profilePic: child.profilePic,
          rollNumber: child.rollNumber,
          gender: child.gender,
          currentClass: child.currentClass,
          currentSection: child.currentSection,
          attendance: { present, absent, totalDays, percentage: attendPct },
          latestExamPercentage: examPct,
          fees: { totalPaid, totalDue },
        };
      }),
    );

    // Notices for parents
    const totalNotices = await Notice.countDocuments({
      session: sessionObjectId,
      isActive: true,
      "recipients.roles": "Parent",
    });

    res
      .status(200)
      .json(
        new apiResponse(
          200,
          { children: childrenData, totalNotices },
          "Parent dashboard fetched successfully",
        ),
      );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

export const getTeacherDashboardStats = asyncHandler(async (req, res) => {
  try {
    const Teacher = getTeacherModel(req.db);
    const Class = getClassModel(req.db);
    const Section = getSectionModel(req.db);
    const Stream = getStreamModel(req.db);
    const Subject = getSubjectModel(req.db);
    const StudentEnrolment = getStudentEnrolmentModel(req.db);
    const Attendance = getAttendanceModel(req.db);
    const Homework = getHomeworkModel(req.db);
    const ExamList = getExamListModel(req.db);
    const ExamMaster = getExamModel(req.db);
    const Notice = getNoticeModel(req.db);
    const Marksheet = getMarksheetModel(req.db);

    const { teacherId, sessionId, date } = req.query;

    if (
      !teacherId ||
      !sessionId ||
      !mongoose.Types.ObjectId.isValid(teacherId) ||
      !mongoose.Types.ObjectId.isValid(sessionId)
    ) {
      return res
        .status(400)
        .json(
          new apiResponse(400, null, "Valid teacherId and sessionId required"),
        );
    }

    const sessionObjectId = new mongoose.Types.ObjectId(sessionId);

    const teacher = await Teacher.findById(teacherId);

    if (!teacher) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Teacher not found"));
    }

    const currentSessionClasses = teacher.classesAssigned.filter(
      (cls) => cls.session.toString() === sessionId,
    );

    const totalAssignedClasses = currentSessionClasses.length;

    const classTeacherClasses = currentSessionClasses.filter(
      (cls) => cls.isClassTeacher === true,
    );

    const assignedClassDetails = [];

    for (const cls of currentSessionClasses) {
      const classData = await Class.findById(cls.classId);
      const sectionData = await Section.findById(cls.sectionId);
      const streamData = cls.stream ? await Stream.findById(cls.stream) : null;
      const subjectData = cls.subjectId
        ? await Subject.findById(cls.subjectId)
        : null;

      assignedClassDetails.push({
        classId: cls.classId,
        className: classData?.name || "",
        sectionId: cls.sectionId,
        sectionName: sectionData?.name || "",
        streamId: cls.stream || null,
        streamName: streamData?.name || null,
        subjectId: cls.subjectId || null,
        subjectName: subjectData?.name || "",
        isClassTeacher: cls.isClassTeacher,
      });
    }

    const classTeacherDetails = [];

    for (const cls of classTeacherClasses) {
      const classData = await Class.findById(cls.classId);
      const sectionData = await Section.findById(cls.sectionId);
      const streamData = cls.stream ? await Stream.findById(cls.stream) : null;

      classTeacherDetails.push({
        classId: cls.classId,
        className: classData?.name || "",
        sectionId: cls.sectionId,
        sectionName: sectionData?.name || "",
        streamId: cls.stream || null,
        streamName: streamData?.name || null,
      });
    }

    let totalStudents = 0;
    let totalMale = 0;
    let totalFemale = 0;

    for (const cls of classTeacherClasses) {
      const students = await StudentEnrolment.find({
        session: sessionObjectId,
        currentClass: cls.classId,
        currentSection: cls.sectionId,
        status: "Studying",
      });

      totalStudents += students.length;

      students.forEach((student) => {
        if (student.gender === "Male") totalMale++;
        if (student.gender === "Female") totalFemale++;
      });
    }

    const totalSubjects = new Set(
      currentSessionClasses.map((c) => c.subjectId?.toString()),
    ).size;

    // ── All class+section pairs assigned to this teacher ──
    const allAssignedPairs = currentSessionClasses.map((c) => ({
      classId: new mongoose.Types.ObjectId(c.classId),
      sectionId: new mongoose.Types.ObjectId(c.sectionId),
    }));

    // ── Class teacher pairs ──
    const classTeacherPairs = classTeacherClasses.map((c) => ({
      classId: new mongoose.Types.ObjectId(c.classId),
      sectionId: new mongoose.Types.ObjectId(c.sectionId),
    }));

    // ── All classIds assigned (for exam lookup) ──
    const allClassIds = [
      ...new Set(currentSessionClasses.map((c) => c.classId.toString())),
    ].map((id) => new mongoose.Types.ObjectId(id));
    // ── All assigned classIds ──
    const allAssignedClassIds = [
      ...new Set(
        currentSessionClasses.map((c) =>
          c.classId.toString()
        ),
      ),
    ].map((id) => new mongoose.Types.ObjectId(id));


    // ── All assigned sectionIds ──
    const allAssignedSectionIds = [
      ...new Set(
        currentSessionClasses.map((c) =>
          c.sectionId.toString()
        ),
      ),
    ].map((id) => new mongoose.Types.ObjectId(id));
    // ── Subject IDs assigned ──
    const allSubjectIds = currentSessionClasses
      .filter((c) => c.subjectId)
      .map((c) => new mongoose.Types.ObjectId(c.subjectId));



    // ── Run parallel queries ──
    const now = new Date();
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const todayEnd = new Date(new Date().setHours(23, 59, 59, 999));

    // Last 7 days for weekly trend
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    // const [
    //   homeworkStats,
    //   recentHomework,
    //   upcomingExams,
    //   noticeCount,
    //    recentNotices,
    //   weeklyAttendanceAgg,


    //   subjectPerformanceAgg,
    // ] = await Promise.all([
    const [
      homeworkStats,
      recentNotices,
      recentHomework,
      upcomingExams,
      noticeCount,
      weeklyAttendanceAgg,
      subjectPerformanceAgg,
    ] = await Promise.all([
      // 1. Homework count by type (this session, this teacher)
      Homework.aggregate([
        {
          $match: {
            sessionId: sessionObjectId,
            teacherId: new mongoose.Types.ObjectId(teacherId),
            isActive: true,
          },
        },
        { $group: { _id: "$homeworkType", count: { $sum: 1 } } },
      ]),


      // 5. Recent notices for teacher
      Notice.aggregate([
        {
          $match: {
            session: sessionObjectId,
            isActive: true,

            $or: [
              {
                "recipients.roles": "Teacher",
              },

              {
                "recipients.specificTeachers":
                  new mongoose.Types.ObjectId(teacherId),
              },

              {
                "recipients.roles": "Student",
              },

              {
                "recipients.classIds": {
                  $in: allAssignedClassIds,
                },
              },

              {
                "recipients.sectionIds": {
                  $in: allAssignedSectionIds,
                },
              },
            ],
          },
        },

        {
          $sort: {
            createdAt: -1,
          },
        },

        {
          $limit: 5,
        },

        // SENDER USER LOOKUP
        {
          $lookup: {
            from: "users",
            localField: "sender.id",
            foreignField: "_id",
            as: "senderUser",
          },
        },

        {
          $unwind: {
            path: "$senderUser",
            preserveNullAndEmptyArrays: true,
          },
        },

        // STUDENTS
        {
          $lookup: {
            from: "studentenrolments",
            localField: "recipients.specificStudents",
            foreignField: "_id",
            as: "studentDetails",
          },
        },

        // CLASSES
        {
          $lookup: {
            from: "classes",
            localField: "recipients.classIds",
            foreignField: "_id",
            as: "classDetails",
          },
        },

        // SECTIONS
        {
          $lookup: {
            from: "sections",
            localField: "recipients.sectionIds",
            foreignField: "_id",
            as: "sectionDetails",
          },
        },

        {
          $project: {
            title: 1,
            description: 1,
            attachment: 1,
            createdAt: 1,
            recipients: 1,

            senderName: "$senderUser.name",
            senderEmail: "$senderUser.email",
            senderRole: "$sender.role",

            studentDetails: {
              $map: {
                input: "$studentDetails",
                as: "student",
                in: {
                  _id: "$$student._id",
                  firstName: "$$student.firstName",
                  lastName: "$$student.lastName",
                  rollNumber: "$$student.rollNumber",
                  profilePic: "$$student.profilePic",
                },
              },
            },

            classDetails: {
              $map: {
                input: "$classDetails",
                as: "cls",
                in: {
                  _id: "$$cls._id",
                  name: "$$cls.name",
                },
              },
            },

            sectionDetails: {
              $map: {
                input: "$sectionDetails",
                as: "sec",
                in: {
                  _id: "$$sec._id",
                  name: "$$sec.name",
                },
              },
            },
          },
        },
      ]),

      // 2. Recent 5 homework
      Homework.find({
        sessionId: sessionObjectId,
        teacherId: new mongoose.Types.ObjectId(teacherId),
        isActive: true,
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("classId", "name")
        .populate("sectionId", "name")
        .populate("subjectId", "name")
        .lean(),

      // 3. Upcoming + recent exams for teacher's classes (next 30 days + last 7 days)
      ExamList.find({
        sessionId: sessionObjectId,
        classId: { $in: allClassIds },
        isActive: true,
        toDate: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      })
        .sort({ fromDate: 1 })
        .limit(8)
        .populate("examMasterId", "examName category")
        .populate("classId", "name")
        .lean(),

      // 4. Notices for teacher
      Notice.countDocuments({

        session: sessionObjectId,

        isActive: true,

        $or: [

          // ALL TEACHERS
          {
            "recipients.roles": "Teacher",
          },

          // SPECIFIC TEACHER
          {
            "recipients.specificTeachers":
              new mongoose.Types.ObjectId(teacherId),
          },

          // ALL STUDENTS NOTICE
          {
            "recipients.roles": "Student",
          },

          // CLASS BASED
          {
            "recipients.classIds": {
              $in: allAssignedClassIds,
            },
          },

          // SECTION BASED
          {
            "recipients.sectionIds": {
              $in: allAssignedSectionIds,
            },
          },

        ],
      }),

      // 5. Weekly attendance trend (last 7 days) — class teacher classes only
      classTeacherPairs.length > 0
        ? Attendance.aggregate([
          {
            $match: {
              sessionId: sessionObjectId,
              date: { $gte: sevenDaysAgo, $lte: todayEnd },
              $or: classTeacherPairs.map((p) => ({
                classId: p.classId,
                sectionId: p.sectionId,
              })),
            },
          },
          { $unwind: "$attendance" },
          {
            $group: {
              _id: {
                date: {
                  $dateToString: { format: "%Y-%m-%d", date: "$date" },
                },
                status: "$attendance.status",
              },
              count: { $sum: 1 },
            },
          },
          {
            $group: {
              _id: "$_id.date",
              statuses: { $push: { status: "$_id.status", count: "$count" } },
              total: { $sum: "$count" },
            },
          },
          { $sort: { _id: 1 } },
        ])
        : Promise.resolve([]),

      // 6. Subject-wise avg performance from marksheets (teacher's subjects)
      allSubjectIds.length > 0
        ? Marksheet.aggregate([
          {
            $match: {
              sessionId: sessionObjectId,
              classId: { $in: allClassIds },
              isPublished: true,
            },
          },
          { $unwind: "$subjects" },
          {
            $match: { "subjects.subjectId": { $in: allSubjectIds } },
          },
          {
            $group: {
              _id: "$subjects.subjectId",
              avgMarks: { $avg: "$subjects.marksObtained" },
              avgMax: { $avg: "$subjects.maxMarks" },
              count: { $sum: 1 },
            },
          },
          {
            $lookup: {
              from: "subjects",
              localField: "_id",
              foreignField: "_id",
              as: "subjectInfo",
            },
          },
          {
            $project: {
              subjectName: { $arrayElemAt: ["$subjectInfo.name", 0] },
              avgMarks: { $round: ["$avgMarks", 1] },
              avgMax: { $round: ["$avgMax", 1] },
              count: 1,
            },
          },
        ])
        : Promise.resolve([]),
    ]);

    // ── Process homework stats ──
    const hwByType = { HOMEWORK: 0, ASSIGNMENT: 0, PROJECT: 0 };
    homeworkStats.forEach((h) => {
      if (h._id in hwByType) hwByType[h._id] = h.count;
    });
    const totalHomework =
      hwByType.HOMEWORK + hwByType.ASSIGNMENT + hwByType.PROJECT;

    // ── Process recent homework ──
    const recentHW = recentHomework.map((h) => ({
      _id: h._id,
      title: h.title,
      type: h.homeworkType,
      className: h.classId?.name || "—",
      sectionName: h.sectionId?.name || "—",
      subjectName: h.subjectId?.name || "—",
      dueDate: h.dueDate,
      assignDate: h.assignDate,
      createdAt: h.createdAt,
    }));

    // ── Process upcoming exams ──
    const exams = upcomingExams.map((e) => ({
      _id: e._id,
      examName: e.examMasterId?.examName || "—",
      category: e.examMasterId?.category || "EXAM",
      className: e.classId?.name || "—",
      fromDate: e.fromDate,
      toDate: e.toDate,
      isPublished: e.isPublished,
      status:
        e.toDate < now
          ? "completed"
          : e.fromDate <= now
            ? "ongoing"
            : "upcoming",
    }));

    // ── Process weekly attendance trend ──
    // Build last 7 days array, fill missing days with 0
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weeklyTrend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const found = weeklyAttendanceAgg.find((a) => a._id === dateStr);
      const stats = { P: 0, A: 0, H: 0 };
      if (found)
        found.statuses.forEach((s) => {
          if (s.status in stats) stats[s.status] = s.count;
        });
      const total = stats.P + stats.A + stats.H;
      weeklyTrend.push({
        day: dayNames[d.getDay()],
        date: dateStr,
        present: stats.P,
        absent: stats.A,
        holiday: stats.H,
        total,
        pct: total > 0 ? Math.round((stats.P / total) * 100) : 0,
        isToday: i === 0,
      });
    }

    // ── Process subject performance ──
    const subjectPerformance = subjectPerformanceAgg
      .filter((s) => s.subjectName)
      .map((s) => ({
        subject: s.subjectName,
        avg: s.avgMax > 0 ? +((s.avgMarks / s.avgMax) * 100).toFixed(1) : 0,
        avgMarks: s.avgMarks,
        avgMax: s.avgMax,
        count: s.count,
      }))
      .sort((a, b) => b.avg - a.avg);

    // ── Teacher profile info ──
    const teacherProfile = {
      name: `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim(),
      designation: teacher.designation || null,
      department: teacher.department || null,
      employmentType: teacher.employmentType || null,
      dateOfJoining: teacher.dateOfJoining || null,
      totalExperience: teacher.totalExperience || null,
      employeeId: teacher.employeeId || null,
      status: teacher.status || "Active",
      profilePic: teacher.profilePic || null,
      phone: teacher.phone || null,
      email: teacher.email || null,
    };

    // ── Today's attendance (date-wise) ──
    let classWiseAttendance = [];
    try {
      const targetDate = date ? new Date(date) : new Date();
      if (!isNaN(targetDate.getTime()) && classTeacherPairs.length > 0) {
        const dateStart = new Date(new Date(targetDate).setHours(0, 0, 0, 0));
        const dateEnd = new Date(
          new Date(targetDate).setHours(23, 59, 59, 999),
        );

        const attAgg = await Attendance.aggregate([
          {
            $match: {
              sessionId: sessionObjectId,
              date: { $gte: dateStart, $lte: dateEnd },
              $or: classTeacherPairs.map((p) => ({
                classId: p.classId,
                sectionId: p.sectionId,
              })),
            },
          },
          { $unwind: "$attendance" },
          {
            $group: {
              _id: {
                classId: "$classId",
                sectionId: "$sectionId",
                status: "$attendance.status",
              },
              count: { $sum: 1 },
            },
          },
          {
            $group: {
              _id: { classId: "$_id.classId", sectionId: "$_id.sectionId" },
              statuses: { $push: { status: "$_id.status", count: "$count" } },
              total: { $sum: "$count" },
            },
          },
          {
            $lookup: {
              from: "classes",
              localField: "_id.classId",
              foreignField: "_id",
              as: "classInfo",
            },
          },
          {
            $lookup: {
              from: "sections",
              localField: "_id.sectionId",
              foreignField: "_id",
              as: "sectionInfo",
            },
          },
          {
            $project: {
              className: { $arrayElemAt: ["$classInfo.name", 0] },
              sectionName: { $arrayElemAt: ["$sectionInfo.name", 0] },
              statuses: 1,
              total: 1,
            },
          },
          { $sort: { className: 1, sectionName: 1 } },
        ]);

        classWiseAttendance = attAgg
          .filter((c) => c.className)
          .map((c) => {
            const stats = { P: 0, A: 0, H: 0 };
            c.statuses.forEach((s) => {
              if (s.status in stats) stats[s.status] = s.count;
            });
            const total = c.total;
            const label = c.sectionName
              ? `${c.className} - ${c.sectionName}`
              : c.className;
            return {
              className: label,
              sectionName: c.sectionName || null,
              present: stats.P,
              absent: stats.A,
              holiday: stats.H,
              total,
              presentPct: total > 0 ? +((stats.P / total) * 100).toFixed(1) : 0,
            };
          });
      }
    } catch (attErr) {
      console.error("Teacher attendance fetch error:", attErr.message);
    }

    res.status(200).json(
      new apiResponse(
        200,
        {
          // ── Core counts ──
          totalAssignedClasses,
          classTeacherClassesCount: classTeacherClasses.length,
          totalStudents,
          totalSubjects,
          totalHomework,
          noticeCount,

          // ── Teacher profile ──
          teacherProfile,

          // ── Class info ──
          assignedClasses: assignedClassDetails,
          classTeacherOf: classTeacherDetails,

          // ── Gender ──
          genderStats: { male: totalMale, female: totalFemale },

          // ── Attendance ──
          classWiseAttendance,
          weeklyAttendanceTrend: weeklyTrend,

          // ── Homework ──
          homeworkByType: hwByType,
          recentHomework: recentHW,
          recentNotices,
          // ── Exams ──
          upcomingExams: exams,

          // ── Performance ──
          subjectPerformance,
        },
        "Teacher dashboard stats fetched successfully",
      ),
    );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});



/* ================= DASHBOARD DEFAULTER SUMMARY ================= */
/* ================= DASHBOARD DEFAULTER SUMMARY ================= */


// export const getDashboardDefaulterSummary =
//   asyncHandler(async (req, res) => {

//     try {

//       const StudentEnrolment =
//         getStudentEnrolmentModel(req.db);

//       const Teacher =
//         getTeacherModel(req.db);

//       const {
//         sessionId,
//         page = 1,
//         limit = 10,
//       } = req.query;

//       // Validate session
//       if (
//         !sessionId ||
//         !mongoose.Types.ObjectId.isValid(
//           sessionId
//         )
//       ) {

//         return res.status(400).json(
//           new apiResponse(
//             400,
//             null,
//             "Valid sessionId required"
//           )
//         );
//       }

//       const sessionObjId =
//         new mongoose.Types.ObjectId(
//           sessionId
//         );

//       // Pagination
//       const pageNumber =
//         Number(page) || 1;

//       const limitNumber =
//         Number(limit) || 10;

//       // Students
//       const students =
//         await StudentEnrolment.find({

//           session: sessionObjId,

//           status: "Studying",

//         })
//           .populate("currentClass", "name")
//           .populate("currentSection", "name")
//           .lean();

//       // Group object
//       const groupedData = {};

//       // Loop students
//       for (const student of students) {

//         // Fee summary
//         const summary =
//           await calculateStudentPayableSummary({

//             db: req.db,

//             sessionId: sessionObjId,

//             studentId: student._id,

//             classId:
//               student.currentClass?._id,

//             streamId:
//               student.streamId || null,

//             tillMonth: true,
//           });

//         // Skip fully paid students
//         if (
//           Number(
//             summary.remainingPayable || 0
//           ) <= 0
//         ) {
//           continue;
//         }

//         const className =
//           student.currentClass?.name ||
//           "--";

//         const sectionName =
//           student.currentSection?.name ||
//           "--";

//         const key =
//           `${className}_${sectionName}`;

//         // Teacher default
//         let teacherName = "--";

//         // Find class teacher
//         const teacher =
//           await Teacher.findOne({

//             classesAssigned: {

//               $elemMatch: {

//                 session: sessionObjId,

//                 classId:
//                   student.currentClass?._id,

//                 sectionId:
//                   student.currentSection?._id,

//                 isClassTeacher: true,
//               },
//             },
//           })
//             .select(
//               "firstName lastName"
//             )
//             .lean();

//         // Teacher name
//         if (teacher) {

//           teacherName =
//             `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim();
//         }

//         // Create group
//         if (!groupedData[key]) {

//           groupedData[key] = {

//             className,

//             section: sectionName,

//             paidAmount: 0,

//             dueAmount: 0,

//             teacherName,
//           };
//         }

//         // Add totals
//         groupedData[key].paidAmount +=
//           Number(
//             summary.totalPaid || 0
//           );

//         groupedData[key].dueAmount +=
//           Number(
//             summary.remainingPayable || 0
//           );
//       }

//       // Convert + SORT
//       const finalData =
//         Object.values(groupedData)
//           .sort((a, b) => {

//             // Extract numeric part
//             const classA =
//               parseInt(a.className) || 0;

//             const classB =
//               parseInt(b.className) || 0;

//             // First sort by class
//             if (classA !== classB) {

//               return classA - classB;
//             }

//             // Then sort by section
//             return a.section.localeCompare(
//               b.section
//             );
//           });

//       // Pagination
//       const totalRows =
//         finalData.length;

//       const totalPages =
//         Math.ceil(
//           totalRows / limitNumber
//         );

//       const paginatedData =
//         finalData.slice(

//           (pageNumber - 1) *
//           limitNumber,

//           pageNumber * limitNumber
//         );

//       return res.status(200).json(

//         new apiResponse(

//           200,

//           {
//             list: paginatedData,

//             pagination: {

//               totalRows,

//               totalPages,

//               currentPage: pageNumber,

//               perPage: limitNumber,
//             },
//           },

//           "Dashboard defaulter summary fetched"
//         )
//       );

//     } catch (error) {

//       return res.status(500).json(

//         new apiResponse(

//           500,

//           null,

//           error.message
//         )
//       );
//     }
//   });




/* ================= DASHBOARD DEFAULTER SUMMARY ================= */

export const getDashboardDefaulterSummary =
  asyncHandler(async (req, res) => {

    try {

      const StudentEnrolment =
        getStudentEnrolmentModel(req.db);

      const Teacher =
        getTeacherModel(req.db);

      const {
        sessionId,
        page = 1,
        limit = 10,
      } = req.query;

      // VALIDATE SESSION
      if (
        !sessionId ||
        !mongoose.Types.ObjectId.isValid(sessionId)
      ) {

        return res.status(400).json(
          new apiResponse(
            400,
            null,
            "Valid sessionId required"
          )
        );
      }

      const sessionObjId =
        new mongoose.Types.ObjectId(sessionId);

      // PAGINATION
      const pageNumber =
        Number(page) || 1;

      const limitNumber =
        Number(limit) || 10;

      /* ================= REDIS CACHE ================= */

      const cacheKey =
        `dashboard-defaulter-${sessionId}-${pageNumber}-${limitNumber}`;

      // TEMP: cache disabled for debugging
      // const cachedData =
      //   await redisClient.get(cacheKey);

      // if (cachedData) {
      //   return res
      //     .status(200)
      //     .json(JSON.parse(cachedData));
      // }

      /* ================= STUDENTS ================= */

      const students =
        await StudentEnrolment.find({
          session: sessionObjId,
          status: "Studying",
        })
          .select("_id currentClass currentSection streamId stream discount discountType fullFeeConcession fullFeeExceptTransport")
          .populate("currentClass", "name")
          .populate("currentSection", "name")
          .lean();

      /* ================= FETCH ALL CLASS TEACHERS ================= */

      const teachers =
        await Teacher.find({
          "classesAssigned.session": sessionObjId,
        })
          .select("firstName lastName classesAssigned")
          .lean();

      /* ================= CREATE TEACHER MAP ================= */

      const teacherMap = {};

      teachers.forEach((teacher) => {
        teacher.classesAssigned.forEach((cls) => {
          if (
            cls.isClassTeacher &&
            cls.session?.toString() === sessionId
          ) {
            // Use .toString() explicitly to avoid ObjectId type mismatch
            const key = `${cls.classId?.toString()}_${cls.sectionId?.toString()}`;
            teacherMap[key] = `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim();
          }
        });
      });

      /* ================= PRE-FETCH FEE DATA (bulk — same as feeDefaultersMonthwise) ================= */

      const FeeStructure    = getFeeStructureModel(req.db);
      const FeeInstallment  = getFeeInstallmentModel(req.db);
      const AdditionalFee   = getAdditionalFeeModel(req.db);
      const TransportFee    = getTransportFeeModel(req.db);
      const StudentPayment  = getStudentPaymentModel(req.db);
      const PaymentAlloc    = getStudentPaymentAllocationModel(req.db);
      const LateFee         = getLateFeeModel(req.db);

      const studentIds = students.map((s) => s._id);

      // Fee structures & installments
      const feeStructures = await FeeStructure.find({ sessionId: sessionObjId, isActive: true }).lean();
      const fsIds   = feeStructures.map((fs) => fs._id);
      const fsById  = Object.fromEntries(feeStructures.map((fs) => [fs._id.toString(), fs]));
      const allInstallments = fsIds.length
        ? await FeeInstallment.find({ feeStructureId: { $in: fsIds } }).lean()
        : [];

      // Additional fees
      const additionalFees = await AdditionalFee.find({ sessionId: sessionObjId, isActive: true }).lean();

      // Transport fees (all — for correct dedup)
      const allTransportFees = studentIds.length
        ? await TransportFee.find({ studentId: { $in: studentIds }, sessionId: sessionObjId }).lean()
        : [];

      // Payments & allocations
      const allPayments = studentIds.length
        ? await StudentPayment.find({ studentId: { $in: studentIds }, sessionId: sessionObjId, paymentStatus: "SUCCESS" }).lean()
        : [];
      const allPaymentIds = allPayments.map((p) => p._id);
      const allAllocations = allPaymentIds.length
        ? await PaymentAlloc.find({ paymentId: { $in: allPaymentIds } }).lean()
        : [];

      // studentId → allocMap (referenceId → paidAmount)
      const payStudentMap = {};
      for (const p of allPayments) payStudentMap[p._id.toString()] = p.studentId.toString();
      const studentAllocMap = {};
      for (const a of allAllocations) {
        const sid = payStudentMap[a.paymentId.toString()];
        if (!sid) continue;
        const rid = a.referenceId.toString();
        if (!studentAllocMap[sid]) studentAllocMap[sid] = {};
        studentAllocMap[sid][rid] = (studentAllocMap[sid][rid] || 0) + Number(a.allocatedAmount || 0);
      }

      // Paid transport referenceIds (for dedup priority)
      const paidTransportRefIds = new Set(
        allAllocations
          .filter((a) => a.feeType === "TRANSPORT" && Number(a.allocatedAmount || 0) > 0)
          .map((a) => a.referenceId.toString())
      );

      // studentId → transport by period (deduped)
      const studentTransportMap = {};
      for (const t of allTransportFees) {
        const sid = t.studentId.toString();
        if (!studentTransportMap[sid]) studentTransportMap[sid] = {};
        const existing = studentTransportMap[sid][t.period];
        if (!existing) { studentTransportMap[sid][t.period] = t; continue; }
        const tPaid = paidTransportRefIds.has(t._id.toString());
        const ePaid = paidTransportRefIds.has(existing._id.toString());
        if (tPaid && !ePaid) { studentTransportMap[sid][t.period] = t; continue; }
        if (!tPaid && ePaid) continue;
        if (t.isActive && !existing.isActive) { studentTransportMap[sid][t.period] = t; continue; }
        if (!t.isActive && existing.isActive) continue;
        if (new Date(t.updatedAt) > new Date(existing.updatedAt)) studentTransportMap[sid][t.period] = t;
      }

      // Late fees
      const allLateFees = studentIds.length
        ? await LateFee.find({ studentId: { $in: studentIds }, sessionId: sessionObjId, isWaived: false, amount: { $gt: 0 } }).lean()
        : [];
      const studentLateFeeMap = {};
      for (const lf of allLateFees) {
        const sid = lf.studentId.toString();
        if (!studentLateFeeMap[sid]) studentLateFeeMap[sid] = [];
        studentLateFeeMap[sid].push(lf);
      }

      // Academic period order (April→March)
      const ACADEMIC_PERIOD_ORDER = [
        "APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER",
        "OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH",
        "APR-JUN","JUL-SEP","OCT-DEC","JAN-MAR",
      ];
      const QUARTERLY_MONTHS = {
        "APR-JUN": ["APRIL","MAY","JUNE"],
        "JUL-SEP": ["JULY","AUGUST","SEPTEMBER"],
        "OCT-DEC": ["OCTOBER","NOVEMBER","DECEMBER"],
        "JAN-MAR": ["JANUARY","FEBRUARY","MARCH"],
      };
      const getCurrentMonthPeriod = () => {
        const months = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE",
                        "JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
        return months[new Date().getMonth()];
      };
      const isPeriodDue = (period) => {
        const currentMonth = getCurrentMonthPeriod();
        const MONTHLY_ORDER = ACADEMIC_PERIOD_ORDER.slice(0, 12);
        const currentIdx = MONTHLY_ORDER.indexOf(currentMonth);
        if (currentIdx === -1) return true;
        if (QUARTERLY_MONTHS[period]) {
          return QUARTERLY_MONTHS[period].some((m) => MONTHLY_ORDER.indexOf(m) <= currentIdx);
        }
        const periodIdx = MONTHLY_ORDER.indexOf(period);
        if (periodIdx === -1) return true;
        return periodIdx <= currentIdx;
      };

      /* ================= GROUP OBJECT ================= */

      const groupedData = {};

      /* ================= PER-STUDENT CALCULATION (same logic as feeDefaultersMonthwise) ================= */

      for (const student of students) {
        const cid = student.currentClass?._id?.toString();
        const stId = student._id.toString();
        if (!cid) continue;

        const rawStreamId = student.stream?.toString() || student.streamId?.toString() || null;
        const validStreamId = rawStreamId && /^[a-f\d]{24}$/i.test(rawStreamId) ? rawStreamId : null;

        const allocMap = studentAllocMap[stId] || {};

        // Installments for this student's class+stream
        const myInsts = allInstallments.filter((inst) => {
          const fs = fsById[inst.feeStructureId.toString()];
          if (!fs) return false;
          return fs.classId.toString() === cid && (fs.streamId?.toString() || null) === validStreamId;
        });

        // Additional fees for this student
        const myAdditional = additionalFees.filter((f) => {
          const fClass  = f.classId?.toString()  || null;
          const fStream = f.streamId?.toString() || null;
          return (!fClass && !fStream) ||
                 (fClass === cid && !fStream) ||
                 (fClass === cid && fStream === validStreamId);
        });

        // Transport by period
        const transportByPeriod = studentTransportMap[stId] || {};

        // Build periodMap: tuition + additional + transport
        const periodMap = buildStudentPeriodMap({ myInsts, myAdditional, transportByPeriod, allocMap });

        // Concession (applies ONLY to tuition)
        const tuitionTotal    = myInsts.reduce((s, i) => s + Number(i.amount || 0), 0);
        const additionalTotal = myAdditional.reduce((s, f) => s + Number(f.amount || 0), 0);
        const transportTotal  = Object.values(transportByPeriod).reduce((s, t) => s + Number(t.amount || 0), 0);

        const concession = calculateConcession({ student, totalFee: tuitionTotal, transportTotal });
        const netPayable = Math.max(tuitionTotal + additionalTotal + transportTotal - concession, 0);

        // Total regular paid
        const totalPaid = Object.values(periodMap).reduce((s, v) => s + v.paidAmount, 0);

        // Late fee due — cap paid at lf.amount so collected + pending = expected
        const myLateFees = studentLateFeeMap[stId] || [];
        let lateFeeDue = 0;
        let lateFeeTotalPaid = 0;
        for (const lf of myLateFees) {
          const paid = allocMap[lf._id.toString()] || 0;
          const lfAmount = Number(lf.amount) || 0;
          lateFeeTotalPaid += Math.min(paid, lfAmount);
          lateFeeDue += Math.max(0, lfAmount - paid);
        }

        // Sequential concession map (tuition-only periods, same as ledger)
        const tuitionOnlyPeriodMap = {};
        for (const inst of myInsts) {
          const per = inst.period;
          if (!tuitionOnlyPeriodMap[per]) tuitionOnlyPeriodMap[per] = { totalFee: 0, paidAmount: 0 };
          tuitionOnlyPeriodMap[per].totalFee += Number(inst.amount || 0);
        }
        const periodConcessionMap = buildSequentialConcessionMap({ periodMap: tuitionOnlyPeriodMap, concession });

        // All due periods (current month tak)
        const duePeriodsList = Object.keys(periodMap).filter((per) => isPeriodDue(per));

        // Expected = due periods net fee (concession-adjusted) + full late fee (paid + due)
        // Formula: Expected = Collected + Pending (always)
        // So expectedFee must include both lateFeeTotalPaid AND lateFeeDue
        const lateFeeExpected = lateFeeTotalPaid + lateFeeDue;
        const expectedFee = parseFloat((
          duePeriodsList.reduce((sum, per) => {
            const vals = periodMap[per];
            const conc = periodConcessionMap[per] || 0;
            return sum + parseFloat(Math.max(vals.totalFee - conc, 0).toFixed(2));
          }, 0) + lateFeeExpected
        ).toFixed(2));

        // Collected = due periods paid (capped at netFee) + late fee paid (capped)
        // Cap ensures: collected + pending = expected (always)
        const collectedFee = parseFloat((
          duePeriodsList.reduce((sum, per) => {
            const vals = periodMap[per];
            const conc = periodConcessionMap[per] || 0;
            const netFee = parseFloat(Math.max(vals.totalFee - conc, 0).toFixed(2));
            return sum + Math.min(vals.paidAmount, netFee);
          }, 0) + lateFeeTotalPaid
        ).toFixed(2));

        // Due months = due periods where unpaid > 0 (concession-adjusted)
        const dueMonths = duePeriodsList.filter((per) => {
          const vals = periodMap[per];
          const rawDue = parseFloat((vals.totalFee - vals.paidAmount).toFixed(2));
          if (rawDue <= 0) return false;
          return parseFloat(Math.max(rawDue - (periodConcessionMap[per] || 0), 0).toFixed(2)) > 0;
        });

        const className   = student.currentClass?.name || "--";
        const sectionName = student.currentSection?.name || "--";
        const key         = `${className}_${sectionName}`;

        // Build teacherKey using both _id (populated object) and raw ObjectId string fallback
        const classIdStr   = (student.currentClass?._id || student.currentClass)?.toString();
        const sectionIdStr = (student.currentSection?._id || student.currentSection)?.toString();
        const teacherKey   = `${classIdStr}_${sectionIdStr}`;
        const teacherName  = teacherMap[teacherKey] || "--";

        // Initialize group for this class-section if not exists
        if (!groupedData[key]) {
          groupedData[key] = { className, section: sectionName, expectedFee: 0, paidAmount: 0, dueAmount: 0, teacherName };
        }

        // Update teacherName if it was '--' and we now have a valid name
        if (groupedData[key].teacherName === "--" && teacherName !== "--") {
          groupedData[key].teacherName = teacherName;
        }

        // Always accumulate expectedFee and paidAmount (for ALL students — defaulters + non-defaulters)
        groupedData[key].expectedFee += expectedFee;
        groupedData[key].paidAmount  += collectedFee;

        // DEBUG: per-student breakdown
        console.log(`[DS] class=${className} sec=${sectionName} student=${stId.slice(-4)} | duePeriods=[${duePeriodsList.join(',')}] | expected=${expectedFee} | collected=${collectedFee} | lateFeeDue=${lateFeeDue} | lateFeePaid=${lateFeeTotalPaid}`);
        for (const per of duePeriodsList) {
          const v = periodMap[per]; const c = periodConcessionMap[per]||0;
          console.log(`  period=${per} totalFee=${v?.totalFee} paid=${v?.paidAmount} conc=${c} netFee=${Math.max((v?.totalFee||0)-c,0)} cappedPaid=${Math.min(v?.paidAmount||0,Math.max((v?.totalFee||0)-c,0))}`);
        }

        // Skip non-defaulters from due amount
        if (dueMonths.length === 0 && lateFeeDue <= 0) continue;

        // Total due (concession-adjusted due periods + late fee)
        const totalDue = parseFloat((
          dueMonths.reduce((sum, per) => {
            const vals = periodMap[per];
            const rawDue = parseFloat((vals.totalFee - vals.paidAmount).toFixed(2));
            return sum + parseFloat(Math.max(rawDue - (periodConcessionMap[per] || 0), 0).toFixed(2));
          }, 0) + lateFeeDue
        ).toFixed(2));

        groupedData[key].dueAmount += totalDue;
      }

      /* ================= FINAL SORT ================= */

      const finalData =
        Object.values(groupedData)
          .map(row => ({
            ...row,
            defaulterPct: row.expectedFee > 0
              ? parseFloat(((row.dueAmount / row.expectedFee) * 100).toFixed(1))
              : 0,
          }))
          .sort((a, b) => {

            const classA =
              parseInt(a.className) || 0;

            const classB =
              parseInt(b.className) || 0;

            // SORT CLASS
            if (classA !== classB) {

              return classA - classB;
            }

            // SORT SECTION
            return a.section.localeCompare(
              b.section
            );
          });

      /* ================= PAGINATION ================= */

      const totalRows =
        finalData.length;

      const totalPages =
        Math.ceil(
          totalRows / limitNumber
        );

      const paginatedData =
        finalData.slice(

          (pageNumber - 1) *
          limitNumber,

          pageNumber * limitNumber
        );

      /* ================= RESPONSE ================= */

      const responseData =
        new apiResponse(

          200,

          {
            list: paginatedData,

            pagination: {

              totalRows,

              totalPages,

              currentPage: pageNumber,

              perPage: limitNumber,
            },
          },

          "Dashboard defaulter summary fetched successfully"
        );

      /* ================= SAVE REDIS CACHE ================= */

      // TEMP: cache disabled for debugging
      // await redisClient.setEx(
      //   cacheKey,
      //   300,
      //   JSON.stringify(responseData)
      // );

      /* ================= SEND RESPONSE ================= */

      return res
        .status(200)
        .json(responseData);

    } catch (error) {

      console.log(
        "Dashboard Defaulter Error:",
        error.message
      );

      return res.status(500).json(

        new apiResponse(

          500,

          null,

          error.message
        )
      );
    }
  });