// Registers all tenant models on a given DB connection.
// Call this once per connection (idempotent — each getter checks connection.models first).
// This ensures Mongoose can resolve all `ref` names during .populate() calls.

import { getUserModel } from "../models/tenant/user.model.js";
import { getTeacherModel } from "../models/tenant/teacher/Teacher.model.js";
import { getStudentEnrolmentModel } from "../models/tenant/student/StudentEnrolment.model.js";
import { getStudentRegistrationModel } from "../models/tenant/student/StudentRegistration.model.js";
import { getAttendanceModel } from "../models/tenant/student/Attendance.model.js";

import { getSessionModel } from "../models/tenant/master/Session.model.js";
import { getClassModel } from "../models/tenant/master/Class.modal.js";
import { getSectionModel } from "../models/tenant/master/Section.modal.js";
import { getStreamModel } from "../models/tenant/master/Stream.model.js";
import { getSubjectModel } from "../models/tenant/master/Subject.model.js";
import { getDocumentModel } from "../models/tenant/master/documents.modal.js";
import { getCategoryMasterModel } from "../models/tenant/master/categoryMaster.model.js";
import { getExamModel } from "../models/tenant/master/Exam.model.js";
import { getExamListModel } from "../models/tenant/master/ExamList.model.js";
import { getFeeStructureModel } from "../models/tenant/master/FeeStructure.model.js";
import { getFeeInstallmentModel } from "../models/tenant/master/FeeInstallment.model.js";
import { getInstallmentTypeModel } from "../models/tenant/master/InstallmentType.model.js";
import { getAdditionalFeeModel } from "../models/tenant/master/AdditionalFee.model.js";
import { getAdditionalFeeWaiverModel } from "../models/tenant/master/AdditionalFeeWaiver.model.js";
import { getTransportFeeWaiverModel } from "../models/tenant/master/TransportFeeWaiver.model.js";
import { getStudentPaymentModel } from "../models/tenant/master/StudentPayment.model.js";
import { getStudentPaymentAllocationModel } from "../models/tenant/master/StudentPaymentAllocation.model.js";
import { getLateFeeModel } from "../models/tenant/master/LateFee.model.js";
import { getLateFeeSettingModel } from "../models/tenant/master/LateFeeSetting.model.js";
import { getTransportFeeModel } from "../models/tenant/master/TransportFee.model.js";
import { getStudentTransportModel } from "../models/tenant/master/StudentTransport.model.js";
import { getRouteModel } from "../models/tenant/master/RouteMaster.model.js";
import { getRouteStopModel } from "../models/tenant/master/RouteStops.model.js";
import { getBusModel } from "../models/tenant/master/BusMaster.model.js";
import { getHomeworkModel } from "../models/tenant/master/HomeWork.model.js";
import { getMarksheetModel } from "../models/tenant/report/Marksheet.model.js";
import { getConductCertificateModel } from "../models/tenant/master/ConductCertificate.model.js";
import { getCertificateModel } from "../models/tenant/master/Certificate.model.js";

import { getNoticeModel } from "../models/tenant/Notice.model.js";
import { getNotificationModel } from "../models/tenant/Notification.model.js";
import { getServicesModel } from "../models/tenant/Services.model.js";
import { getGalleryModel } from "../models/tenant/Gallery.model.js";
import { getBannerModel } from "../models/tenant/HomeBanner.model.js";
import { getCategoryModel } from "../models/tenant/Category.model.js";
import { getTestimonialsModel } from "../models/tenant/Testimonials.model.js";

// ── HR Module Models ──────────────────────────────────────────────────────────
import { getDepartmentModel }      from "../models/tenant/hr/Department.model.js";
import { getDesignationModel }     from "../models/tenant/hr/Designation.model.js";
import { getStaffModel }           from "../models/tenant/hr/Staff.model.js";
import { getAttendanceHRModel }    from "../models/tenant/hr/Attendance.model.js";
import { getLeaveModel }           from "../models/tenant/hr/Leave.model.js";
import { getPayrollModel }         from "../models/tenant/hr/Payroll.model.js";
import { getSalaryStructureModel } from "../models/tenant/hr/SalaryStructure.model.js";
import { getSalaryPaymentModel }   from "../models/tenant/hr/SalaryPayment.model.js";
import { getAccountHeadModel }     from "../models/tenant/hr/AccountHead.model.js";
import { getVoucherModel }         from "../models/tenant/hr/Voucher.model.js";

export const registerTenantModels = (db) => {
    getUserModel(db);
    getTeacherModel(db);
    getStudentEnrolmentModel(db);
    getStudentRegistrationModel(db);
    getAttendanceModel(db);

    getSessionModel(db);
    getClassModel(db);
    getSectionModel(db);
    getStreamModel(db);
    getSubjectModel(db);
    getDocumentModel(db);
    getCategoryMasterModel(db);
    getExamModel(db);
    getExamListModel(db);
    getFeeStructureModel(db);
    getFeeInstallmentModel(db);
    getInstallmentTypeModel(db);
    getAdditionalFeeModel(db);
    getAdditionalFeeWaiverModel(db);
    getTransportFeeWaiverModel(db);
    getStudentPaymentModel(db);
    getStudentPaymentAllocationModel(db);
    getLateFeeModel(db);
    getLateFeeSettingModel(db);
    getTransportFeeModel(db);
    getStudentTransportModel(db);
    getRouteModel(db);
    getRouteStopModel(db);
    getBusModel(db);
    getHomeworkModel(db);
    getMarksheetModel(db);
    getConductCertificateModel(db);
    getCertificateModel(db);

    getNoticeModel(db);
    getNotificationModel(db);
    getServicesModel(db);
    getGalleryModel(db);
    getBannerModel(db);
    getCategoryModel(db);
    getTestimonialsModel(db);

    // ── HR Module ─────────────────────────────────────────────
    getDepartmentModel(db);
    getDesignationModel(db);
    getStaffModel(db);
    getAttendanceHRModel(db);
    getLeaveModel(db);
    getPayrollModel(db);
    getSalaryStructureModel(db);
    getSalaryPaymentModel(db);
    getAccountHeadModel(db);
    getVoucherModel(db);
};
