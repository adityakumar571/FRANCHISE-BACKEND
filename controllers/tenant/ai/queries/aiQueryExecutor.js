// queries/aiQueryExecutor.js
// Routes AI chatbot intent to the appropriate query function.
// All report queries use aiReportBridge or aiReportQueries which
// delegate to the exact same production logic — no data divergence.

import { queryFeesToday, queryFeeDefaulters, queryFeeSummary, queryFeeDefaultersByClass, queryFeeHeads, queryFeeOverview } from "./aiFeeQueries.js";
import { queryStudents, queryStudentByName, queryTeacherByName } from "./aiStudentQueries.js";
import { queryAttendance, queryTeachers, queryClasses, queryHomework, queryNotices, queryTransport, queryTopper } from "./aiSchoolQueries.js";
import { queryReportFeeCollection, queryReportFeeOutstanding, queryReportFeeMode, queryReportDefaultersClasswise, queryReportTransport, queryReportScholarship, queryReportStudentsInactive } from "./aiReportQueries.js";
import {
  reportClassSectionDefaulters,
  reportFeeHead,
  reportFeeCollection,
  reportFeeDefaultersMonthwise,
  reportResultAnalysis,
  reportTransportRouteWise,
  reportTransportDefaulters,
  reportFeeDepositSummaryClasswise,
  reportStudentFeeDetailsClasswise,
  reportNewAdmissionFeeCollection,
  reportFeeDefaultersDetailed,
  reportFeeDepositedDetailed,
  reportRegistrationFeeStatement,
  reportRegistrationFeeClasswise,
  reportInactiveStudentFeeStatement,
} from "./aiReportBridge.js";

export { queryStudentByName, queryTeacherByName };

export async function executeQuery(db, intent, parsedParams = {}) {
  try {
    switch (intent) {

      // ── Core fee queries ──
      case "fee_today":               return await queryFeesToday(db);
      case "fee_defaulters":          return await queryFeeDefaulters(db, parsedParams);
      case "fee_defaulters_class":    return await queryFeeDefaultersByClass(db, parsedParams);
      case "fee_summary":             return await queryFeeSummary(db);
      case "fee_overview":            return await queryFeeOverview(db, parsedParams);
      case "fee_structure":
      case "fee_heads":               return await queryFeeHeads(db, parsedParams);

      // ── Student / teacher queries ──
      case "students":
      case "admissions":
      case "students_left":           return await queryStudents(db, parsedParams);
      case "student_search":          return await queryStudentByName(db, parsedParams);
      case "teacher_search":          return await queryTeacherByName(db, parsedParams);

      // ── School queries ──
      case "attendance":              return await queryAttendance(db);
      case "teachers":                return await queryTeachers(db, parsedParams);
      case "classes":                 return await queryClasses(db);
      case "homework":                return await queryHomework(db);
      case "notices":                 return await queryNotices(db, parsedParams);
      case "transport":               return await queryTransport(db);
      case "topper":                  return await queryTopper(db, parsedParams);

      // ── Report queries (exact parity with software reports) ──
      case "report_fee_collection":            return await reportFeeCollection(db, parsedParams);
      case "report_fee_mode":                  return await queryReportFeeMode(db);
      case "report_fee_head":                  return await reportFeeHead(db, parsedParams);
      case "report_fee_outstanding":           return await queryReportFeeOutstanding(db);
      case "report_defaulters_classwise":      return await queryReportDefaultersClasswise(db);
      case "report_class_section_defaulters":  return await reportClassSectionDefaulters(db, parsedParams);
      case "report_fee_defaulters_monthwise":  return await reportFeeDefaultersMonthwise(db, parsedParams);
      case "report_fee_deposit_classwise":     return await reportFeeDepositSummaryClasswise(db, parsedParams);
      case "report_student_fee_details":       return await reportStudentFeeDetailsClasswise(db, parsedParams);
      case "report_new_admission_fee":         return await reportNewAdmissionFeeCollection(db, parsedParams);
      case "report_fee_defaulters_detailed":   return await reportFeeDefaultersDetailed(db, parsedParams);
      case "report_fee_deposited_detailed":    return await reportFeeDepositedDetailed(db, parsedParams);
      case "report_registration_fee":          return await reportRegistrationFeeStatement(db, parsedParams);
      case "report_registration_fee_classwise": return await reportRegistrationFeeClasswise(db, parsedParams);
      case "report_inactive_fee_statement":    return await reportInactiveStudentFeeStatement(db, parsedParams);
      case "report_transport":                 return await queryReportTransport(db);
      case "report_transport_route_wise":      return await reportTransportRouteWise(db);
      case "report_transport_defaulters":      return await reportTransportDefaulters(db, parsedParams);
      case "report_result_analysis":           return await reportResultAnalysis(db, parsedParams);
      case "report_scholarship":               return await queryReportScholarship(db);
      case "report_students_inactive":         return await queryReportStudentsInactive(db);

      default:
        return { type: "unsupported", error: "Query not yet implemented" };
    }
  } catch (error) {
    console.error(`[QueryExecutor] Error [${intent}]:`, error.message);
    return { type: "error", error: error.message };
  }
}
