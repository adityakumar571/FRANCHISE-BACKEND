// queries/aiQueryHelpers.js
import { getSessionModel } from "../../../../models/tenant/master/Session.model.js";

export function inr(amount) {
  if (!amount || amount === 0) return "₹0";
  return "₹" + Number(amount).toLocaleString("en-IN");
}

export async function getCurrentSession(db) {
  const Session = getSessionModel(db);
  return (
    await Session.findOne({ isCurrent: true, isActive: true }).lean() ||
    await Session.findOne({ isActive: true }).sort({ createdAt: -1 }).lean()
  );
}

export function getISTDateBounds() {
  const IST_OFFSET_MS  = 5.5 * 60 * 60 * 1000;
  const nowIST         = new Date(Date.now() + IST_OFFSET_MS);
  const istDateStr     = nowIST.toISOString().slice(0, 10);
  const todayStart     = new Date(istDateStr + "T00:00:00+05:30");
  const todayEnd       = new Date(istDateStr + "T23:59:59+05:30");

  const [istYear, istMonth, istDay] = istDateStr.split("-").map(Number);
  const MONTH_NAMES    = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const istDateDisplay = `${istDay} ${MONTH_NAMES[istMonth - 1]} ${istYear}`;

  return { todayStart, todayEnd, istDateDisplay };
}
