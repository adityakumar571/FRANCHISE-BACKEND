import { Router } from "express";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";
import { aiChat } from "../../../controllers/tenant/ai/aiChatController.js";
import { getSessionModel } from "../../../models/tenant/master/Session.model.js";
import { getAttendanceModel } from "../../../models/tenant/student/Attendance.model.js";
import mongoose from "mongoose";

const router = Router();

/* POST /api/ai/chat */
router.post("/chat", verifyJWT, aiChat);

/* GET /api/ai/debug — check raw attendance data from DB */
router.get("/debug", verifyJWT, async (req, res) => {
  try {
    const db = req.db;

    // Current session
    const Session  = getSessionModel(db);
    const session  = await Session.findOne({ isCurrent: true, isActive: true }).lean()
                  || await Session.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();

    const Attendance = getAttendanceModel(db);

    // IST-based today range
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const nowIST     = new Date(Date.now() + IST_OFFSET_MS);
    const istDateStr = nowIST.toISOString().slice(0, 10);
    const todayStart = new Date(istDateStr + "T00:00:00+05:30");
    const todayEnd   = new Date(istDateStr + "T23:59:59+05:30");

    // UTC-based today range (old method, for comparison)
    const utcStart = new Date(new Date().setHours(0, 0, 0, 0));
    const utcEnd   = new Date(new Date().setHours(23, 59, 59, 999));

    // Raw attendance docs today (IST)
    const todayDocsIST = await Attendance.find({
      date: { $gte: todayStart, $lte: todayEnd },
    }).lean();

    // Raw attendance docs today (UTC)
    const todayDocsUTC = await Attendance.find({
      date: { $gte: utcStart, $lte: utcEnd },
    }).lean();

    // Last 5 attendance records regardless of date
    const last5 = await Attendance.find({})
      .sort({ date: -1 }).limit(5)
      .select("date classId sectionId attendance").lean();

    const countPerDoc = todayDocsIST.map(d => ({
      date:       d.date,
      classId:    d.classId,
      sectionId:  d.sectionId,
      studentCount: d.attendance?.length || 0,
      statuses:   d.attendance?.reduce((acc, a) => {
        acc[a.status] = (acc[a.status] || 0) + 1; return acc;
      }, {}),
    }));

    return res.json({
      school:       req.tenant?.schoolName,
      subdomain:    req.tenant?.subdomain,
      session:      { name: session?.sessionName, id: session?._id },
      now_server:   new Date().toISOString(),
      now_IST:      nowIST.toISOString(),
      todayStart_IST: todayStart.toISOString(),
      todayEnd_IST:   todayEnd.toISOString(),
      todayStart_UTC: utcStart.toISOString(),
      todayEnd_UTC:   utcEnd.toISOString(),
      attendanceDocsToday_IST: todayDocsIST.length,
      attendanceDocsToday_UTC: todayDocsUTC.length,
      perClassBreakdown: countPerDoc,
      last5Records: last5.map(d => ({
        date: d.date,
        studentCount: d.attendance?.length,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
