
import mongoose from "mongoose";
import { getStudentEnrolmentModel } from "../../../../models/tenant/student/StudentEnrolment.model.js";
import { getMarksheetModel } from "../../../../models/tenant/report/Marksheet.model.js";
import { getStudentPaymentModel } from "../../../../models/tenant/master/StudentPayment.model.js";
import { getFeeStructureModel } from "../../../../models/tenant/master/FeeStructure.model.js";
import { getFeeInstallmentModel } from "../../../../models/tenant/master/FeeInstallment.model.js";
import { getAdditionalFeeModel } from "../../../../models/tenant/master/AdditionalFee.model.js";
import { getTransportFeeModel } from "../../../../models/tenant/master/TransportFee.model.js";
import { getStudentPaymentAllocationModel } from "../../../../models/tenant/master/StudentPaymentAllocation.model.js";
import { getLateFeeModel } from "../../../../models/tenant/master/LateFee.model.js";
import { asyncHandler } from "../../../../utils/asyncHandler.js";
import { apiResponse } from "../../../../utils/apiResponse.js";
import { calculateConcession, buildStudentPeriodMap } from "../../../../utils/feeHelper.js";
import { syncLateFees } from "../../../../utils/lateFeeHelper.js";

// Academic year: April → March
const ACADEMIC_PERIOD_ORDER = [
  "APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER",
  "OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH",
  "APR-JUN","JUL-SEP","OCT-DEC","JAN-MAR",
];

const getCurrentMonthPeriod = () => {
  const months = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE",
                  "JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  return months[new Date().getMonth()];
};

const QUARTERLY_MONTHS = {
  "APR-JUN": ["APRIL", "MAY", "JUNE"],
  "JUL-SEP": ["JULY", "AUGUST", "SEPTEMBER"],
  "OCT-DEC": ["OCTOBER", "NOVEMBER", "DECEMBER"],
  "JAN-MAR": ["JANUARY", "FEBRUARY", "MARCH"],
};  

const isPeriodDue = (period) => {
  const currentMonth = getCurrentMonthPeriod();
  const MONTHLY_ORDER = ACADEMIC_PERIOD_ORDER.slice(0, 12);
  const currentIdx = MONTHLY_ORDER.indexOf(currentMonth);
  if (currentIdx === -1) return true;

  if (QUARTERLY_MONTHS[period]) {
    return QUARTERLY_MONTHS[period].some(
      (m) => MONTHLY_ORDER.indexOf(m) <= currentIdx,
    );
  }

  const periodIdx = MONTHLY_ORDER.indexOf(period);
  if (periodIdx === -1) return true;
  return periodIdx <= currentIdx;
};



const getExamReport = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db); // ✅ ADD
  const Marksheet = getMarksheetModel(req.db); // ✅ ADD
  const { sessionId, classId, sectionId } = req.query;

  /* ================= VALIDATION ================= */

  if (
    !sessionId ||
    !classId ||
    !mongoose.Types.ObjectId.isValid(sessionId) ||
    !mongoose.Types.ObjectId.isValid(classId)
  ) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId & classId required"));
  }

  const sessionObj = new mongoose.Types.ObjectId(sessionId);
  const classObj = new mongoose.Types.ObjectId(classId);

  /* ================= MATCH ================= */

  const match = {
    session: sessionObj,
    currentClass: classObj,
    status: "Studying"
  };

  if (sectionId && mongoose.Types.ObjectId.isValid(sectionId)) {
    match.currentSection = new mongoose.Types.ObjectId(sectionId);
  }
  const result = await StudentEnrolment.aggregate([

    { $match: match },

    /* ================= MARKS ================= */

    {
      $lookup: {
        from: "marksheets",
        localField: "_id",
        foreignField: "studentId",
        as: "marks"
      }
    },

    { $unwind: { path: "$marks", preserveNullAndEmptyArrays: true } },

    /* ================= EXAM LIST ================= */

    {
      $lookup: {
        from: "examlists",
        localField: "marks.examListId",
        foreignField: "_id",
        as: "examList"
      }
    },

    { $unwind: { path: "$examList", preserveNullAndEmptyArrays: true } },

    /* ================= EXAM MASTER ================= */

    {
      $lookup: {
        from: "exammasters",
        localField: "examList.examMasterId",
        foreignField: "_id",
        as: "examMaster"
      }
    },

    { $unwind: { path: "$examMaster", preserveNullAndEmptyArrays: true } },

    /* ================= GROUP (STUDENT + EXAM) ================= */

    {
      $group: {
        _id: {
          studentId: "$_id",
          examName: "$examMaster.examName"
        },

        studentName: {
          $first: {
            $concat: [
              { $ifNull: ["$firstName", ""] },
              " ",
              { $ifNull: ["$lastName", ""] }
            ]
          }
        },

        sectionId: { $first: "$currentSection" },

        percentage: { $max: "$marks.percentage" },

        totalObtained: { $sum: "$marks.totalObtainedMarks" },
        totalMax: { $sum: "$marks.totalMarks" }
      }
    },

    /* ================= GROUP (STUDENT LEVEL) ================= */

    {
      $group: {
        _id: "$_id.studentId",

        studentName: { $first: "$studentName" },
        sectionId: { $first: "$sectionId" },

        examsArray: {
          $push: {
            k: "$_id.examName",
            v: "$percentage"
          }
        },

        totalObtained: { $sum: "$totalObtained" },
        totalMax: { $sum: "$totalMax" }
      }
    },

    /* ================= CONVERT TO OBJECT ================= */

  // CLEAN DATA
{
  $addFields: {
    examsArray: {
      $filter: {
        input: "$examsArray",
        as: "exam",
        cond: {
          $and: [
            { $ne: ["$$exam.k", null] },
            { $ne: ["$$exam.k", ""] },
            { $ne: ["$$exam.v", null] }
          ]
        }
      }
    }
  }
},

// CONVERT TO OBJECT
{
  $addFields: {
    exams: {
      $cond: [
        { $gt: [{ $size: "$examsArray" }, 0] },
        { $arrayToObject: "$examsArray" },
        {}
      ]
    }
  }
},
    /* ================= OVERALL % ================= */

    {
      $addFields: {
        overallPercentage: {
          $cond: [
            { $gt: ["$totalMax", 0] },
            {
              $multiply: [
                { $divide: ["$totalObtained", "$totalMax"] },
                100
              ]
            },
            0
          ]
        }
      }
    },

    /* ================= ATTENDANCE ================= */

    {
      $lookup: {
        from: "attendances",
        let: { studentId: "$_id" },
        pipeline: [
          { $unwind: "$attendance" },
          {
            $match: {
              $expr: {
                $eq: ["$attendance.studentId", "$$studentId"]
              }
            }
          },
          {
            $group: {
              _id: null,
              totalDays: { $sum: 1 },
              presentDays: {
                $sum: {
                  $cond: [{ $eq: ["$attendance.status", "P"] }, 1, 0]
                }
              }
            }
          }
        ],
        as: "attendanceData"
      }
    },

    {
      $addFields: {
        attendance: { $arrayElemAt: ["$attendanceData", 0] }
      }
    },

    {
      $addFields: {
        attendancePercentage: {
          $cond: [
            { $gt: ["$attendance.totalDays", 0] },
            {
              $multiply: [
                {
                  $divide: [
                    "$attendance.presentDays",
                    "$attendance.totalDays"
                  ]
                },
                100
              ]
            },
            0
          ]
        }
      }
    },

    /* ================= SECTION NAME ================= */

    {
      $lookup: {
        from: "sections",
        localField: "sectionId",
        foreignField: "_id",
        as: "section"
      }
    },

    { $unwind: { path: "$section", preserveNullAndEmptyArrays: true } },

    /* ================= FINAL OUTPUT ================= */

    {
      $project: {
        studentName: 1,
        sectionName: "$section.name",
        exams: 1,
        overallPercentage: { $round: ["$overallPercentage", 2] },
        totalPresent: "$attendance.presentDays",
        totalDays: "$attendance.totalDays",
        attendancePercentage: { $round: ["$attendancePercentage", 2] }
      }
    },

    { $sort: { studentName: 1 } }

  ]);

  res.status(200).json(
    new apiResponse(
      200,
      result,
      "Exam report fetched successfully"
    )
  );

});




const feeDefaulterReport = asyncHandler(async (req, res) => {
  const StudentEnrolment         = getStudentEnrolmentModel(req.db);
  const StudentPayment           = getStudentPaymentModel(req.db);
  const FeeStructure             = getFeeStructureModel(req.db);
  const FeeInstallment           = getFeeInstallmentModel(req.db);
  const AdditionalFee            = getAdditionalFeeModel(req.db);
  const TransportFee             = getTransportFeeModel(req.db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(req.db);
  const LateFee                  = getLateFeeModel(req.db);

  const { sessionId, classId, sectionId, period, page = 1, limit = 10 } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));

  const currentPage = Number(page);
  const perPage     = Number(limit);
  const skip        = (currentPage - 1) * perPage;
  const sessionOId  = new mongoose.Types.ObjectId(sessionId);

  // -- 1. Fee Structures --
  const fsQuery = { sessionId: sessionOId, isActive: true };
  if (classId && mongoose.Types.ObjectId.isValid(classId))
    fsQuery.classId = new mongoose.Types.ObjectId(classId);

  const feeStructures = await FeeStructure.find(fsQuery).lean();
  const fsIds  = feeStructures.map(fs => fs._id);
  const fsById = Object.fromEntries(feeStructures.map(fs => [fs._id.toString(), fs]));

  // ALL installments (no period filter) � needed for correct concession calculation
  const allInstallments = await FeeInstallment.find({ feeStructureId: { $in: fsIds } }).lean();

  // Filtered installments for periodMap (only requested period)
  const filteredInstallments = period
    ? allInstallments.filter(i => i.period === period)
    : allInstallments;

  // -- 2. Students --
  const enrollMatch = { session: sessionOId, status: "Studying" };
  if (classId && mongoose.Types.ObjectId.isValid(classId))
    enrollMatch.currentClass = new mongoose.Types.ObjectId(classId);
  if (sectionId && mongoose.Types.ObjectId.isValid(sectionId))
    enrollMatch.currentSection = new mongoose.Types.ObjectId(sectionId);

  const students = await StudentEnrolment.find(enrollMatch).lean();
  const studentIds = students.map(s => s._id);

  // -- 3. Additional Fees (fetch all for session; per-student filtering done in loop) --
  const additionalFees = await AdditionalFee.find({ sessionId: sessionOId, isActive: true }).lean();

  // -- 4. Transport Fees per student (deduplicate by period — same priority as ledger) --
  // Fetch ALL transport (not just isActive) so we can check paid ones too
  const allTransportFees = await TransportFee.find({
    studentId: { $in: studentIds }, sessionId: sessionOId,
  }).lean();

  // Build a quick set of paid transport referenceIds from allocations already fetched
  // NOTE: allocations not yet built here — we'll fix dedup after building allocations below

  // -- 5. Allocation map per student: referenceId -> paidAmount (same as ledger) --
  const payments = await StudentPayment.find({
    studentId: { $in: studentIds }, sessionId: sessionOId, paymentStatus: "SUCCESS",
  }).lean();
  const payIds = payments.map(p => p._id);

  const allocations = payIds.length
    ? await StudentPaymentAllocation.find({ paymentId: { $in: payIds } }).lean()
    : [];

  const payStudentMap = {};
  for (const p of payments) payStudentMap[p._id.toString()] = p.studentId.toString();

  // studentId -> referenceId -> paidAmount
  const studentAllocMap = {};
  for (const a of allocations) {
    const sid = payStudentMap[a.paymentId.toString()];
    if (!sid) continue;
    const rid = a.referenceId.toString();
    if (!studentAllocMap[sid]) studentAllocMap[sid] = {};
    studentAllocMap[sid][rid] = (studentAllocMap[sid][rid] || 0) + Number(a.allocatedAmount || 0);
  }

  // -- 4b. Build transport map now that allocations are ready (paid > isActive > latest updatedAt, same as ledger) --
  // Global set of paid transportFee referenceIds
  const paidTransportRefIds = new Set(
    allocations
      .filter(a => a.feeType === "TRANSPORT" && Number(a.allocatedAmount || 0) > 0)
      .map(a => a.referenceId.toString())
  );

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

  // -- 6. Sync late fees per student (same as ledger does for individual student) --
  // This ensures LateFee DB records are up to date before we read them.
  for (const student of students) {
    const stId  = student._id.toString();
    const cid   = student.currentClass?.toString();
    if (!cid) continue;
    const rawStreamId = student.stream?.toString() || null;
    const streamId    = rawStreamId && mongoose.Types.ObjectId.isValid(rawStreamId) ? rawStreamId : null;
    const allocMap    = studentAllocMap[stId] || {};

    const myInsts = allInstallments.filter(inst => {
      const fs = fsById[inst.feeStructureId.toString()];
      return fs && fs.classId.toString() === cid && (fs.streamId?.toString() || null) === streamId;
    });

    if (myInsts.length) {
      await syncLateFees({
        db: req.db,
        sessionId: sessionOId,
        studentId: student._id,
        classId: new mongoose.Types.ObjectId(cid),
        installments: myInsts,
        allocationMap: allocMap,
      });
    }
  }

  // -- 6b. Late Fees per student (not waived) — read AFTER sync --
  const allLateFees = studentIds.length
    ? await LateFee.find({
        studentId: { $in: studentIds },
        sessionId: sessionOId,
        isWaived: false,
        amount: { $gt: 0 },
      }).lean()
    : [];

  // Map: studentId -> [lateFeeRecords]
  const studentLateFeeMap = {};
  for (const lf of allLateFees) {
    const sid = lf.studentId.toString();
    if (!studentLateFeeMap[sid]) studentLateFeeMap[sid] = [];
    studentLateFeeMap[sid].push(lf);
  }

  // -- 7. Class/Section/Stream name lookup --
  const classIds2   = [...new Set(students.map(s => s.currentClass?.toString()).filter(Boolean))];
  const sectionIds2 = [...new Set(students.map(s => s.currentSection?.toString()).filter(Boolean))];
  const streamIds2  = [...new Set(students.map(s => s.stream?.toString()).filter(Boolean))];
  const classes2    = classIds2.length
    ? await req.db.collection("classes").find({ _id: { $in: classIds2.map(id => new mongoose.Types.ObjectId(id)) } }).toArray()
    : [];
  const sections2   = sectionIds2.length
    ? await req.db.collection("sections").find({ _id: { $in: sectionIds2.map(id => new mongoose.Types.ObjectId(id)) } }).toArray()
    : [];
  const streams2    = streamIds2.length
    ? await req.db.collection("streams").find({ _id: { $in: streamIds2.map(id => new mongoose.Types.ObjectId(id)) } }).toArray()
    : [];
  const classNameMap   = Object.fromEntries(classes2.map(c => [c._id.toString(), c.name]));
  const sectionNameMap = Object.fromEntries(sections2.map(s => [s._id.toString(), s.name]));
  const streamNameMap  = Object.fromEntries(streams2.map(s => [s._id.toString(), s.name]));

  // -- 7. Build rows (period-wise per student) --
  const rows = [];

  for (const student of students) {
    const cid      = student.currentClass?.toString();
    const streamId = student.stream?.toString() || null;
    const stId     = student._id.toString();
    if (!cid) continue;

    const allocMap = studentAllocMap[stId] || {};

    // ALL installments for this student's class+stream (for correct concession base)
    const allMyInsts = allInstallments.filter(inst => {
      const fs = fsById[inst.feeStructureId.toString()];
      if (!fs) return false;
      return fs.classId.toString() === cid && (fs.streamId?.toString() || null) === streamId;
    });

    // Filtered installments for periodMap (only requested period, or all if no filter)
    const myInsts = period
      ? allMyInsts.filter(i => i.period === period)
      : allMyInsts;

    // Additional fees for this student's class+stream (same logic as ledger $or clauses)
    const myAdditional = additionalFees.filter(f => {
      const fClass  = f.classId  ? f.classId.toString()  : null;
      const fStream = f.streamId ? f.streamId.toString() : null;
      // Global fee (no class restriction)
      if (!fClass) return true;
      // Class-specific, no stream restriction
      if (fClass === cid && !fStream) return true;
      // Class + stream specific
      if (fClass === cid && fStream === streamId) return true;
      return false;
    });

    // Build periodMap: tuition + additional + transport only (NO late fee)
    const transportByPeriod = studentTransportMap[stId] || {};
    const periodMap = buildStudentPeriodMap({ myInsts, myAdditional, transportByPeriod, allocMap });

    // Concession base = ALL tuition + ALL additional + ALL transport (full session, same as ledger)
    const tuitionTotalFS           = allMyInsts.reduce((s, i) => s + Number(i.amount || 0), 0);
    const additionalTotalFS        = myAdditional.reduce((s, f) => s + Number(f.amount || 0), 0);
    const transportTotalForStudent = Object.values(transportByPeriod).reduce((s, t) => s + Number(t.amount || 0), 0);
    const feeBase                  = tuitionTotalFS + additionalTotalFS + transportTotalForStudent;

    // Total paid across ALL periods (for skip check � same as ledger netDue check)
    const totalPaidForStudent = Object.values(
      buildStudentPeriodMap({ myInsts: allMyInsts, myAdditional, transportByPeriod, allocMap })
    ).reduce((s, v) => s + v.paidAmount, 0);

    const studentConcession = calculateConcession({
      student,
      totalFee:      feeBase,
      transportTotal: transportTotalForStudent,
    });

    // Net payable = fee base - concession (late fees excluded from base, same as ledger)
    const studentNetPayable = Math.max(feeBase - studentConcession, 0);

    // Also count any late fee payments (so fully-paid students are not shown as defaulters)
    const myLateFeesPaid = (studentLateFeeMap[stId] || []).reduce((s, lf) => {
      return s + (allocMap[lf._id.toString()] || 0);
    }, 0);
    const totalLateFeeDue = (studentLateFeeMap[stId] || []).reduce((s, lf) => {
      const paid = allocMap[lf._id.toString()] || 0;
      return s + Math.max(Number(lf.amount) - paid, 0);
    }, 0);

    // Skip if regular fees fully paid AND no pending late fees
    if (totalPaidForStudent >= studentNetPayable && totalLateFeeDue <= 0) continue;

    // -- Distribute concession PROPORTIONALLY across ALL periods (same as ledger) --
    const PERIOD_ORDER = ["APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH","APR-JUN","JUL-SEP","OCT-DEC","JAN-MAR"];

    const fullPeriodMap = buildStudentPeriodMap({ myInsts: allMyInsts, myAdditional, transportByPeriod, allocMap });

    const sortedPeriods = Object.keys(fullPeriodMap).sort((a, b) => {
      const ai = PERIOD_ORDER.indexOf(a); const bi = PERIOD_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    const periodConcessionMap = {};
    if (studentConcession > 0 && feeBase > 0) {
      // Filter to only periods that have actual fees (for correct isLast detection)
      const periodsWithFee = sortedPeriods.filter(per => fullPeriodMap[per].totalFee > 0);
      let distributed = 0;
      for (let idx = 0; idx < periodsWithFee.length; idx++) {
        const per = periodsWithFee[idx];
        const periodFee = fullPeriodMap[per].totalFee;

        const isLast = idx === periodsWithFee.length - 1;
        const share = isLast
          ? parseFloat((studentConcession - distributed).toFixed(2))
          : parseFloat(((studentConcession * periodFee) / feeBase).toFixed(2));

        if (share <= 0) continue;

        // Store the full proportional share as concession for this period
        // (not capped by rawDue — the cap is applied later when computing adjustedDue)
        periodConcessionMap[per] = share;
        distributed = parseFloat((distributed + share).toFixed(2));
      }
    }

    // Now check only the filtered period(s) for balance
    for (const [per, vals] of Object.entries(periodMap)) {
      if (period && per !== period) continue;
      // Skip future periods — only show dues up to current month
      if (!isPeriodDue(per)) continue;

      const rawDue = parseFloat((vals.totalFee - vals.paidAmount).toFixed(2));
      if (rawDue <= 0) continue;

      const concessionForPeriod = periodConcessionMap[per] || 0;
      const adjustedDue = parseFloat(Math.max(rawDue - concessionForPeriod, 0).toFixed(2));
      if (adjustedDue <= 0) continue;

      // -- Build fee heads breakdown (ledger-style) for this period --
      const feeHeads = [];
      const periodFeeForConc = periodFeeMap ? periodFeeMap : {};

      // Tuition installments for this period
      for (const inst of myInsts.filter(i => i.period === per)) {
        const paid = allocMap[inst._id.toString()] || 0;
        const rawInstDue = Math.max(Number(inst.amount) - paid, 0);
        // Proportional concession share for this fee item
        const periodTotalFee = (vals.totalFee || 0);
        const periodConc = concessionForPeriod || 0;
        const instShare = periodTotalFee > 0
          ? parseFloat(((periodConc * Number(inst.amount)) / periodTotalFee).toFixed(2))
          : 0;
        const adjDue = parseFloat(Math.max(rawInstDue - instShare, 0).toFixed(2));
        feeHeads.push({
          type:        "TUITION",
          feeHead:     inst.feeHead || "Tuition Fee",
          totalAmount: parseFloat(Number(inst.amount).toFixed(2)),
          paidAmount:  parseFloat(paid.toFixed(2)),
          dueAmount:   adjDue,
        });
      }

      // Additional fees for this period
      for (const f of myAdditional.filter(f => f.period === per)) {
        const paid = allocMap[f._id.toString()] || 0;
        const rawFDue = Math.max(Number(f.amount) - paid, 0);
        const periodTotalFee = (vals.totalFee || 0);
        const periodConc = concessionForPeriod || 0;
        const fShare = periodTotalFee > 0
          ? parseFloat(((periodConc * Number(f.amount)) / periodTotalFee).toFixed(2))
          : 0;
        const adjDue = parseFloat(Math.max(rawFDue - fShare, 0).toFixed(2));
        feeHeads.push({
          type:        "ADDITIONAL",
          feeHead:     f.feeName || "Additional Fee",
          totalAmount: parseFloat(Number(f.amount).toFixed(2)),
          paidAmount:  parseFloat(paid.toFixed(2)),
          dueAmount:   adjDue,
        });
      }

      // Transport fee for this period
      const transport = transportByPeriod[per];
      if (transport) {
        const paid = allocMap[transport._id.toString()] || 0;
        const rawTDue = Math.max(Number(transport.amount) - paid, 0);
        const periodTotalFee = (vals.totalFee || 0);
        const periodConc = concessionForPeriod || 0;
        const tShare = periodTotalFee > 0
          ? parseFloat(((periodConc * Number(transport.amount)) / periodTotalFee).toFixed(2))
          : 0;
        const adjDue = parseFloat(Math.max(rawTDue - tShare, 0).toFixed(2));
        feeHeads.push({
          type:        "TRANSPORT",
          feeHead:     "Transport Fee",
          totalAmount: parseFloat(Number(transport.amount).toFixed(2)),
          paidAmount:  parseFloat(paid.toFixed(2)),
          dueAmount:   adjDue,
        });
      }

      // Late fees for this period
      const myLateFees = (studentLateFeeMap[stId] || []).filter(lf => lf.period === per);
      let lateFeeTotalForPeriod = 0;
      for (const lf of myLateFees) {
        const paid = allocMap[lf._id.toString()] || 0;
        const due  = parseFloat(Math.max(Number(lf.amount) - paid, 0).toFixed(2));
        if (due <= 0) continue;
        lateFeeTotalForPeriod += due;
        feeHeads.push({
          type:        "LATE_FEE",
          feeHead:     "Late Fee",
          totalAmount: parseFloat(Number(lf.amount).toFixed(2)),
          paidAmount:  parseFloat(paid.toFixed(2)),
          dueAmount:   due,
        });
      }

      // Calculate fee-type-wise breakdown for summary
      const tuitionHeads = feeHeads.filter(f => f.type === "TUITION");
      const additionalHeads = feeHeads.filter(f => f.type === "ADDITIONAL");
      const transportHeads = feeHeads.filter(f => f.type === "TRANSPORT");
      const lateFeeHeads = feeHeads.filter(f => f.type === "LATE_FEE");

      const tuitionTotal = tuitionHeads.reduce((s, f) => s + f.totalAmount, 0);
      const tuitionPaid = tuitionHeads.reduce((s, f) => s + f.paidAmount, 0);
      const tuitionDue = tuitionHeads.reduce((s, f) => s + f.dueAmount, 0);

      const additionalTotal = additionalHeads.reduce((s, f) => s + f.totalAmount, 0);
      const additionalPaid = additionalHeads.reduce((s, f) => s + f.paidAmount, 0);
      const additionalDue = additionalHeads.reduce((s, f) => s + f.dueAmount, 0);

      const transportTotal = transportHeads.reduce((s, f) => s + f.totalAmount, 0);
      const transportPaid = transportHeads.reduce((s, f) => s + f.paidAmount, 0);
      const transportDue = transportHeads.reduce((s, f) => s + f.dueAmount, 0);

      const lateFeeTotal = lateFeeHeads.reduce((s, f) => s + f.totalAmount, 0);
      const lateFeePaid = lateFeeHeads.reduce((s, f) => s + f.paidAmount, 0);
      const lateFeeDue = lateFeeHeads.reduce((s, f) => s + f.dueAmount, 0);

      rows.push({
        studentId:         student.studentId,
        studentName:       `${student.firstName || ""} ${student.lastName || ""}`.trim(),
        fatherName:        student.fatherName,
        motherName:        student.motherName || "",
        phone:             student.phone,
        rollNumber:        student.rollNumber || "",
        formNo:            student.formNo || "",
        className:         classNameMap[cid] || "",
        sectionName:       sectionNameMap[student.currentSection?.toString()] || "",
        streamName:        streamNameMap[student.stream?.toString()] || "",
        period:            per,
        
        // Summary fields
        expectedAmt:       parseFloat(vals.totalFee.toFixed(2)),
        paidAmount:        parseFloat(vals.paidAmount.toFixed(2)),
        unPaidInstallment: adjustedDue,
        lateFee:           parseFloat(lateFeeTotalForPeriod.toFixed(2)),
        totalDue:          parseFloat((adjustedDue + lateFeeTotalForPeriod).toFixed(2)),
        concession:        parseFloat(concessionForPeriod.toFixed(2)),
        
        // Fee-type-wise breakdown (matches ledger structure)
        tuition: {
          total: parseFloat(tuitionTotal.toFixed(2)),
          paid: parseFloat(tuitionPaid.toFixed(2)),
          due: parseFloat(tuitionDue.toFixed(2)),
        },
        additional: {
          total: parseFloat(additionalTotal.toFixed(2)),
          paid: parseFloat(additionalPaid.toFixed(2)),
          due: parseFloat(additionalDue.toFixed(2)),
        },
        transport: {
          total: parseFloat(transportTotal.toFixed(2)),
          paid: parseFloat(transportPaid.toFixed(2)),
          due: parseFloat(transportDue.toFixed(2)),
        },
        lateFeeBreakdown: {
          total: parseFloat(lateFeeTotal.toFixed(2)),
          paid: parseFloat(lateFeePaid.toFixed(2)),
          due: parseFloat(lateFeeDue.toFixed(2)),
        },
        
        address:           student.address?.present?.Address1 || "",
        
        // Detailed fee heads for drill-down
        feeHeads,
      });
    }
  }

  rows.sort((a, b) =>
    (a.period || "").localeCompare(b.period || "") ||
    b.unPaidInstallment - a.unPaidInstallment
  );

  const totalRows  = rows.length;
  const totalPages = Math.ceil(totalRows / perPage);
  const list       = rows.slice(skip, skip + perPage);

  res.status(200).json(new apiResponse(200, {
    list, pagination: { totalRows, totalPages, currentPage, perPage },
  }, "Fee defaulter report fetched successfully"));
});

const classWiseFeeRegister = asyncHandler(async (req, res) => {
const StudentEnrolment = getStudentEnrolmentModel(req.db); // ✅ ADD
  const StudentPayment = getStudentPaymentModel(req.db); // ✅ ADD
  const {
    sessionId,
    fromDate,
    toDate,
    page = 1,
    limit = 10
  } = req.query;

  /* ================= VALIDATION ================= */

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId required"));
  }

  const sessionObjectId = new mongoose.Types.ObjectId(sessionId);

  const currentPage = Number(page);
  const perPage = Number(limit);
  const skip = (currentPage - 1) * perPage;

  /* ================= DATE FILTER ================= */

  const dateMatch = {};

  if (fromDate || toDate) {
    dateMatch.createdAt = {};

    if (fromDate) dateMatch.createdAt.$gte = new Date(fromDate);

    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      dateMatch.createdAt.$lte = end;
    }
  }

  /* ================= AGGREGATION ================= */

  const result = await StudentEnrolment.aggregate([

    {
      $match: {
        session: sessionObjectId,
        status: "Studying"
      }
    },

    /* ================= GROUP CLASS ================= */

    {
      $group: {
        _id: "$currentClass",
        totalStudents: { $sum: 1 },
        studentIds: { $push: "$_id" }
      }
    },

    /* ================= JOIN CLASS ================= */

    {
      $lookup: {
        from: "classes",
        localField: "_id",
        foreignField: "_id",
        as: "class"
      }
    },

    { $unwind: "$class" },

    /* ================= TOTAL FEE ================= */

    {
      $lookup: {
        from: "feestructures",
        let: { classId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$classId", "$$classId"] },
                  { $eq: ["$sessionId", sessionObjectId] }
                ]
              }
            }
          }
        ],
        as: "feeStructures"
      }
    },

    {
      $lookup: {
        from: "feeinstallments",
        localField: "feeStructures._id",
        foreignField: "feeStructureId",
        as: "installments"
      }
    },

    {
      $addFields: {
        totalFee: { $sum: "$installments.amount" }
      }
    },

    /* ================= COLLECTION ================= */

    {
      $lookup: {
        from: "studentpayments",
        let: { studentIds: "$studentIds" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $in: ["$studentId", "$$studentIds"] },
                  { $eq: ["$sessionId", sessionObjectId] },
                  { $eq: ["$paymentStatus", "SUCCESS"] }
                ]
              },
              ...dateMatch
            }
          },
        ],
        as: "successPayments"
      }
    },

    // Use allocations for accurate collected amount (consistent with defaulter reports)
    {
      $lookup: {
        from: "studentpaymentallocations",
        let: { payIds: "$successPayments._id" },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$paymentId", "$$payIds"] }
            }
          },
          {
            $group: {
              _id: null,
              totalCollected: { $sum: "$allocatedAmount" }
            }
          }
        ],
        as: "allocationData"
      }
    },

    {
      $addFields: {
        totalCollected: {
          $ifNull: [{ $arrayElemAt: ["$allocationData.totalCollected", 0] }, 0]
        }
      }
    },
    /* ================= BALANCE ================= */

    {
      $addFields: {
        balance: { $subtract: ["$totalFee", "$totalCollected"] },
        currentDue: { $subtract: ["$totalFee", "$totalCollected"] }
      }
    },

    /* ================= FINAL ================= */

    {
      $project: {
        classId: "$_id",
        className: "$class.name",
        totalStudents: 1,
        totalFee: 1,
        totalCollected: 1,
        balance: 1,
        currentDue: 1
      }
    },

    { $sort: { className: 1 } },

    /* ================= PAGINATION ================= */

    {
      $facet: {
        list: [
          { $skip: skip },
          { $limit: perPage }
        ],
        totalCount: [
          { $count: "count" }
        ]
      }
    }

  ]);

  /* ================= SAFE RESPONSE ================= */

  const list = result[0]?.list || [];
  const totalRows = result[0]?.totalCount?.[0]?.count || 0;
  const totalPages = Math.ceil(totalRows / perPage);

  res.status(200).json(
    new apiResponse(
      200,
      {
        list,
        pagination: {
          totalRows,
          totalPages,
          currentPage,
          perPage
        }
      },
      "Class-wise fee register fetched successfully"
    )
  );

});




const feeDefaulterReport_old = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db); // ✅ ADD
  const {
    sessionId,
    classId,
    page = 1,
    limit = 10
  } = req.query;

  if (!sessionId) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "sessionId required"));
  }

  const currentPage = Number(page);
  const perPage = Number(limit);
  const skip = (currentPage - 1) * perPage;

  const match = {
    session: new mongoose.Types.ObjectId(sessionId),
  };

  if (classId) {
    match.currentClass = new mongoose.Types.ObjectId(classId);
  }

  const result = await StudentEnrolment.aggregate([

    /* ================= MATCH STUDENTS ================= */

    { $match: match },

    /* ================= JOIN PAYMENTS ================= */

    {
      $lookup: {
        from: "studentpayments",
        localField: "_id",
        foreignField: "studentId",
        as: "payments",
      },
    },

    /* ================= CALCULATE TOTAL PAID ================= */

    {
      $addFields: {
        totalPaid: { $sum: "$payments.amountPaid" },
        lastPaymentDate: { $max: "$payments.createdAt" },
      },
    },

    /* ================= JOIN CLASS ================= */

    {
      $lookup: {
        from: "classes",
        localField: "currentClass",
        foreignField: "_id",
        as: "class",
      },
    },

    { $unwind: { path: "$class", preserveNullAndEmptyArrays: true } },

    /* ================= JOIN SECTION ================= */

    {
      $lookup: {
        from: "sections",
        localField: "currentSection",
        foreignField: "_id",
        as: "section",
      },
    },

    { $unwind: { path: "$section", preserveNullAndEmptyArrays: true } },

    /* ================= PROJECT ================= */

    {
      $project: {
        studentId: 1,
        studentName: { $concat: ["$firstName", " ", "$lastName"] },
        fatherName: 1,
        phone: 1,
        className: "$class.name",
        sectionName: "$section.name",
        totalPaid: 1,
        lastPaymentDate: 1,
      },
    },

    /* ================= FIND DEFAULTERS ================= */

    {
      $match: {
        totalPaid: { $lte: 0 },
      },
    },

    {
      $sort: { studentName: 1 },
    },

    /* ================= PAGINATION ================= */

    {
      $facet: {
        list: [
          { $skip: skip },
          { $limit: perPage }
        ],
        totalCount: [
          { $count: "count" }
        ]
      }
    }

  ]);

  const list = result[0].list;
  const totalRows = result[0].totalCount[0]?.count || 0;
  const totalPages = Math.ceil(totalRows / perPage);

  res.status(200).json(
    new apiResponse(
      200,
      {
        list,
        pagination: {
          totalRows,
          totalPages,
          currentPage,
          perPage
        }
      },
      "Fee defaulter report fetched successfully"
    )
  );

});
// school perfomance report - top 5, bottom 5, defaulter count, class ranking based on average percentage 

const getPerformanceReport = asyncHandler(async (req, res) => {
 const StudentEnrolment = getStudentEnrolmentModel(req.db); // ✅ ADD
  const Marksheet = getMarksheetModel(req.db); // ✅ ADD
  const StudentPayment = getStudentPaymentModel(req.db); // ✅ ADD
  const { sessionId, classId, sectionId, streamId } = req.query;

  if (!sessionId) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "sessionId required"));
  }

  const sessionObj = new mongoose.Types.ObjectId(sessionId);

  const match = {
    session: sessionObj,
    status: "Studying"
  };

  if (classId) match.currentClass = new mongoose.Types.ObjectId(classId);
  if (sectionId) match.currentSection = new mongoose.Types.ObjectId(sectionId);
  if (streamId) match.stream = new mongoose.Types.ObjectId(streamId);

  /* ================= STUDENTS ================= */

  const students = await StudentEnrolment.find(match)
  .select("_id firstName lastName studentId currentClass")
  .populate("currentClass", "name"); 

  const studentIds = students.map(s => s._id);

  /* ================= MARKS DATA ================= */

  const marksData = await Marksheet.aggregate([
    {
      $match: {
        sessionId: sessionObj,
        studentId: { $in: studentIds }
      }
    },
    {
      $group: {
        _id: "$studentId",
        percentage: { $avg: "$percentage" }
      }
    }
  ]);

  /* ================= MAP STUDENTS ================= */

  const studentMap = {};
  students.forEach(s => {
    studentMap[s._id.toString()] = {
      studentId: s.studentId,
      name: `${s.firstName} ${s.lastName || ""}`.trim(),
      classId: s.currentClass
    };
  });

  const performanceList = marksData.map(m => ({
    studentId: studentMap[m._id]?.studentId,
    name: studentMap[m._id]?.name,
    percentage: Number(m.percentage.toFixed(2)),
    classId: studentMap[m._id]?.classId
  }));

  /* ================= SORT PERFORMANCE ================= */

  performanceList.sort((a, b) => b.percentage - a.percentage);

  const topStudents = performanceList.slice(0, 5);
  const bottomStudents = performanceList.slice(-5).reverse();

  /* ================= CLASS RANKING ================= */

  const classAgg = {};

  performanceList.forEach(s => {
    const classKey = s.classId?.toString();

    if (!classAgg[classKey]) {
      classAgg[classKey] = {
        total: 0,
        count: 0
      };
    }

    classAgg[classKey].total += s.percentage;
    classAgg[classKey].count += 1;
  });

  const classRanking = Object.keys(classAgg).map(classId => ({
    classId,
    avgPercentage: Number(
      (classAgg[classId].total / classAgg[classId].count).toFixed(2)
    )
  }))
  .sort((a, b) => b.avgPercentage - a.avgPercentage);

  /* ================= DEFAULTER COUNT ================= */

  const payments = await StudentPayment.aggregate([
    {
      $match: {
        sessionId: sessionObj,
        studentId: { $in: studentIds },
        paymentStatus: "SUCCESS"
      }
    },
    {
      $group: {
        _id: "$studentId",
        totalPaid: { $sum: "$amountPaid" }
      }
    }
  ]);

  const paidMap = {};
  payments.forEach(p => {
    paidMap[p._id.toString()] = p.totalPaid;
  });

  let defaulterCount = 0;

  students.forEach(s => {
    const paid = paidMap[s._id.toString()] || 0;

    if (paid <= 0) {
      defaulterCount++;
    }
  });

  /* ================= FINAL RESPONSE ================= */

  res.status(200).json(
    new apiResponse(
      200,
      {
        topStudents,
        bottomStudents,
        defaulterCount,
        classRanking
      },
      "Advanced performance report fetched successfully"
    )
  );

});

export { feeDefaulterReport ,
  classWiseFeeRegister,
  getExamReport,
  getPerformanceReport
};
