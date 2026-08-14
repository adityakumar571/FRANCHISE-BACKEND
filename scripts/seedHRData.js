/**
 * HR Module — Complete Seed Script
 *
 * Flow: Department → Designation → Staff → SalaryStructure →
 *       Attendance → Leave (apply+approve) → Payroll (generate+pay) →
 *       AccountHeads → Vouchers
 *
 * Usage:
 *   node scripts/seedHRData.js <tenant-subdomain>
 *   e.g.  node scripts/seedHRData.js taha
 *
 * It reads the tenant's dbUri from the main DB and seeds HR data
 * directly into that tenant's database.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

// ─────────────────────────────────────────────────────────────────────────────
//  Inline model definitions (mirrors production models — avoids path issues)
// ─────────────────────────────────────────────────────────────────────────────

/* Department */
const DeptSchema = new mongoose.Schema(
  { name: { type: String, required: true, trim: true }, description: String, isActive: { type: Boolean, default: true } },
  { timestamps: true }
);
DeptSchema.index({ name: 1 }, { unique: true });

/* Designation */
const DesigSchema = new mongoose.Schema(
  {
    name:       { type: String, required: true, trim: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "HRDepartment" },
    staffType:  { type: String, enum: ["Teaching", "Non-Teaching"], default: "Non-Teaching" },
    isActive:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* Staff */
const StaffSchema = new mongoose.Schema(
  {
    employeeCode:   { type: String, trim: true },
    employeeName:   { type: String, required: true, trim: true },
    staffType:      { type: String, enum: ["Teaching", "Non-Teaching"], required: true },
    department:     { type: mongoose.Schema.Types.ObjectId, ref: "HRDepartment" },
    designation:    { type: mongoose.Schema.Types.ObjectId, ref: "HRDesignation" },
    mobile:         String,
    email:          String,
    gender:         { type: String, enum: ["Male", "Female", "Other"] },
    dateOfBirth:    Date,
    dateOfJoining:  Date,
    address:        String,
    employmentType: { type: String, enum: ["Permanent", "Temporary", "Contract", "Part-Time"] },
    monthlySalary:  { type: Number, default: 0 },
    bankName:       String,
    accountNumber:  String,
    ifscCode:       String,
    photo:          String,
    isActive:       { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* Salary Structure */
const SalStrSchema = new mongoose.Schema(
  {
    staff:          { type: mongoose.Schema.Types.ObjectId, ref: "HRStaff", required: true },
    effectiveFrom:  { type: Date, required: true },
    basicSalary:    { type: Number, required: true },
    allowance:      { type: Number, default: 0 },
    fixedDeduction: { type: Number, default: 0 },
    grossSalary:    { type: Number, required: true },
    status:         { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

/* Attendance */
const AttSchema = new mongoose.Schema(
  {
    staff:    { type: mongoose.Schema.Types.ObjectId, ref: "HRStaff", required: true },
    date:     { type: Date, required: true },
    status:   { type: String, enum: ["Present", "Absent", "Half Day", "Paid Leave", "Unpaid Leave", "Holiday", "Weekly Off"], required: true },
    remarks:  String,
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);
AttSchema.index({ staff: 1, date: 1 }, { unique: true });

/* Leave */
const LeaveSchema = new mongoose.Schema(
  {
    staff:      { type: mongoose.Schema.Types.ObjectId, ref: "HRStaff", required: true },
    leaveType:  { type: String, enum: ["Casual Leave", "Sick Leave", "Paid Leave", "Unpaid Leave"], required: true },
    fromDate:   { type: Date, required: true },
    toDate:     { type: Date, required: true },
    totalDays:  { type: Number, required: true },
    reason:     String,
    status:     { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    remarks:    String,
  },
  { timestamps: true }
);

/* Payroll */
const PayrollSchema = new mongoose.Schema(
  {
    salaryMonth:      { type: String, required: true },
    staff:            { type: mongoose.Schema.Types.ObjectId, ref: "HRStaff", required: true },
    monthlySalary:    { type: Number, required: true },
    presentDays:      { type: Number, default: 0 },
    absentDays:       { type: Number, default: 0 },
    paidLeave:        { type: Number, default: 0 },
    unpaidLeave:      { type: Number, default: 0 },
    extraEarning:     { type: Number, default: 0 },
    absentDeduction:  { type: Number, default: 0 },
    leaveDeduction:   { type: Number, default: 0 },
    advanceDeduction: { type: Number, default: 0 },
    otherDeduction:   { type: Number, default: 0 },
    totalDeduction:   { type: Number, default: 0 },
    netSalary:        { type: Number, required: true },
    paymentStatus:    { type: String, enum: ["Unpaid", "Paid", "Partially Paid", "On Hold"], default: "Unpaid" },
    remarks:          String,
    generatedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);
PayrollSchema.index({ staff: 1, salaryMonth: 1 }, { unique: true });

/* Salary Payment */
const SalPaySchema = new mongoose.Schema(
  {
    payroll:              { type: mongoose.Schema.Types.ObjectId, ref: "HRPayroll", required: true },
    staff:                { type: mongoose.Schema.Types.ObjectId, ref: "HRStaff", required: true },
    salaryMonth:          { type: String, required: true },
    paymentDate:          { type: Date, required: true },
    paymentMode:          { type: String, enum: ["Cash", "Bank Transfer", "UPI", "Cheque", "Other"], required: true },
    paidAmount:           { type: Number, required: true },
    transactionReference: String,
    remarks:              String,
  },
  { timestamps: true }
);

/* Account Head */
const AccHeadSchema = new mongoose.Schema(
  {
    accountName: { type: String, required: true, trim: true },
    accountType: { type: String, enum: ["Income", "Expense"], required: true },
    description: String,
    status:      { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);
AccHeadSchema.index({ accountName: 1, accountType: 1 }, { unique: true });

/* Voucher */
const VoucherSchema = new mongoose.Schema(
  {
    voucherNumber:     { type: String, unique: true, trim: true },
    voucherDate:       { type: Date, required: true },
    voucherType:       { type: String, enum: ["Income", "Expense"], required: true },
    paymentMode:       { type: String, enum: ["Cash", "Bank Transfer", "UPI", "Cheque", "Other"], default: "Cash" },
    referenceNumber:   String,
    remarks:           String,
    totalAmount:       { type: Number, required: true },
    sourceModule:      { type: String, default: "Manual" },
    sourceReferenceId: String,
    status:            { type: String, enum: ["Active", "Cancelled"], default: "Active" },
    transactions:      [{ accountHead: { type: mongoose.Schema.Types.ObjectId, ref: "HRAccountHead" }, amount: Number, remarks: String }],
    createdBy:         { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Return model — register it if first time on this connection */
const getModel = (conn, name, schema) =>
  conn.models[name] || conn.model(name, schema);

/** Upsert by filter, log result */
const upsert = async (Model, filter, data, label) => {
  const exists = await Model.findOne(filter);
  if (exists) {
    console.log(`  SKIP  ${label}`);
    return exists;
  }
  const doc = await Model.create(data);
  console.log(`  ADD   ${label}`);
  return doc;
};

/** Normalise date to midnight UTC */
const dateOnly = (d) => {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
};

/** Build a date array: fromDate..toDate (inclusive) */
const dateRange = (from, to) => {
  const dates = [];
  let cur = dateOnly(from);
  const end = dateOnly(to);
  while (cur <= end) {
    dates.push(new Date(cur));
    cur = new Date(cur);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
};

// ─────────────────────────────────────────────────────────────────────────────
//  SEED DATA DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const DEPARTMENTS = [
  { name: "Academic",        description: "Teaching & curriculum staff" },
  { name: "Administration",  description: "Office and admin staff" },
  { name: "Finance",         description: "Accounts and fee department" },
  { name: "IT & Library",    description: "Computer lab and library staff" },
  { name: "Sports & Health", description: "Sports teachers and medical staff" },
];

// Designations — linked to departments by index (resolved at runtime)
// format: { name, deptName, staffType }
const DESIGNATIONS_DEF = [
  { name: "Principal",           deptName: "Administration",  staffType: "Non-Teaching" },
  { name: "Vice Principal",      deptName: "Administration",  staffType: "Non-Teaching" },
  { name: "Office Superintendent",deptName: "Administration", staffType: "Non-Teaching" },
  { name: "Accountant",          deptName: "Finance",         staffType: "Non-Teaching" },
  { name: "PGT Teacher",         deptName: "Academic",        staffType: "Teaching" },
  { name: "TGT Teacher",         deptName: "Academic",        staffType: "Teaching" },
  { name: "PRT Teacher",         deptName: "Academic",        staffType: "Teaching" },
  { name: "Computer Teacher",    deptName: "IT & Library",    staffType: "Teaching" },
  { name: "Librarian",           deptName: "IT & Library",    staffType: "Non-Teaching" },
  { name: "Sports Teacher",      deptName: "Sports & Health", staffType: "Teaching" },
  { name: "Nurse",               deptName: "Sports & Health", staffType: "Non-Teaching" },
  { name: "Peon / Helper",       deptName: "Administration",  staffType: "Non-Teaching" },
];

// Staff definitions — deptName & desigName resolved at runtime
const STAFF_DEF = [
  {
    employeeCode: "STF-1001", employeeName: "Rajesh Kumar Sharma",
    staffType: "Non-Teaching", deptName: "Administration", desigName: "Principal",
    mobile: "9876543210", email: "principal@school.com",
    gender: "Male", dateOfBirth: "1972-04-15", dateOfJoining: "2010-06-01",
    employmentType: "Permanent", monthlySalary: 85000,
    address: "12, Gandhi Nagar, Lucknow, UP",
    bankName: "State Bank of India", accountNumber: "30045678901", ifscCode: "SBIN0001234",
  },
  {
    employeeCode: "STF-1002", employeeName: "Sunita Verma",
    staffType: "Non-Teaching", deptName: "Administration", desigName: "Vice Principal",
    mobile: "9867452310", email: "sunita.verma@school.com",
    gender: "Female", dateOfBirth: "1978-09-20", dateOfJoining: "2013-07-15",
    employmentType: "Permanent", monthlySalary: 65000,
    address: "45, Civil Lines, Lucknow, UP",
    bankName: "Punjab National Bank", accountNumber: "4502891234", ifscCode: "PUNB0045600",
  },
  {
    employeeCode: "STF-1003", employeeName: "Amit Tiwari",
    staffType: "Teaching", deptName: "Academic", desigName: "PGT Teacher",
    mobile: "9812345670", email: "amit.tiwari@school.com",
    gender: "Male", dateOfBirth: "1985-01-12", dateOfJoining: "2015-04-01",
    employmentType: "Permanent", monthlySalary: 45000,
    address: "78, Hazratganj, Lucknow, UP",
    bankName: "HDFC Bank", accountNumber: "5020098765", ifscCode: "HDFC0001122",
  },
  {
    employeeCode: "STF-1004", employeeName: "Priya Singh",
    staffType: "Teaching", deptName: "Academic", desigName: "TGT Teacher",
    mobile: "9934567812", email: "priya.singh@school.com",
    gender: "Female", dateOfBirth: "1990-06-05", dateOfJoining: "2018-07-10",
    employmentType: "Permanent", monthlySalary: 38000,
    address: "23, Indira Nagar, Lucknow, UP",
    bankName: "ICICI Bank", accountNumber: "101234567890", ifscCode: "ICIC0000987",
  },
  {
    employeeCode: "STF-1005", employeeName: "Mohd. Arif Khan",
    staffType: "Teaching", deptName: "Academic", desigName: "PRT Teacher",
    mobile: "9756423100", email: "arif.khan@school.com",
    gender: "Male", dateOfBirth: "1993-11-22", dateOfJoining: "2020-04-01",
    employmentType: "Permanent", monthlySalary: 28000,
    address: "56, Aminabad, Lucknow, UP",
    bankName: "Bank of Baroda", accountNumber: "20123456789", ifscCode: "BARB0AMRBAD",
  },
  {
    employeeCode: "STF-1006", employeeName: "Kavita Mishra",
    staffType: "Teaching", deptName: "IT & Library", desigName: "Computer Teacher",
    mobile: "9823401567", email: "kavita.mishra@school.com",
    gender: "Female", dateOfBirth: "1988-03-17", dateOfJoining: "2016-06-15",
    employmentType: "Permanent", monthlySalary: 35000,
    address: "89, Gomti Nagar, Lucknow, UP",
    bankName: "Axis Bank", accountNumber: "91505001234", ifscCode: "UTIB0000456",
  },
  {
    employeeCode: "STF-1007", employeeName: "Deepak Pandey",
    staffType: "Non-Teaching", deptName: "Finance", desigName: "Accountant",
    mobile: "9745612308", email: "deepak.pandey@school.com",
    gender: "Male", dateOfBirth: "1980-08-30", dateOfJoining: "2012-01-01",
    employmentType: "Permanent", monthlySalary: 32000,
    address: "34, Aliganj, Lucknow, UP",
    bankName: "Central Bank of India", accountNumber: "3012345678", ifscCode: "CBIN0280985",
  },
  {
    employeeCode: "STF-1008", employeeName: "Ritu Yadav",
    staffType: "Teaching", deptName: "Sports & Health", desigName: "Sports Teacher",
    mobile: "9867890123", email: "ritu.yadav@school.com",
    gender: "Female", dateOfBirth: "1991-12-08", dateOfJoining: "2019-07-01",
    employmentType: "Permanent", monthlySalary: 30000,
    address: "67, Mahanagar, Lucknow, UP",
    bankName: "UCO Bank", accountNumber: "01560200012345", ifscCode: "UCBA0000156",
  },
  {
    employeeCode: "STF-1009", employeeName: "Suresh Babu",
    staffType: "Non-Teaching", deptName: "Administration", desigName: "Peon / Helper",
    mobile: "9512367489", email: "suresh.babu@school.com",
    gender: "Male", dateOfBirth: "1995-05-14", dateOfJoining: "2021-03-10",
    employmentType: "Contract", monthlySalary: 14000,
    address: "12, Chowk, Lucknow, UP",
    bankName: "Post Office", accountNumber: "990123456", ifscCode: "IPOS0000001",
  },
  {
    employeeCode: "STF-1010", employeeName: "Anjali Dubey",
    staffType: "Non-Teaching", deptName: "IT & Library", desigName: "Librarian",
    mobile: "9678234501", email: "anjali.dubey@school.com",
    gender: "Female", dateOfBirth: "1987-07-19", dateOfJoining: "2014-09-01",
    employmentType: "Permanent", monthlySalary: 27000,
    address: "90, Vikas Nagar, Lucknow, UP",
    bankName: "Kotak Mahindra Bank", accountNumber: "7512345678", ifscCode: "KKBK0001234",
  },
];

// Account heads — Income & Expense
const ACCOUNT_HEADS = [
  { accountName: "Tuition Fee Income",       accountType: "Income",  description: "Income from student tuition fees" },
  { accountName: "Transport Fee Income",     accountType: "Income",  description: "Income from transport fees" },
  { accountName: "Admission Fee Income",     accountType: "Income",  description: "One-time admission fee income" },
  { accountName: "Donation Income",          accountType: "Income",  description: "Donations & grants received" },
  { accountName: "Staff Salary Expense",     accountType: "Expense", description: "Monthly salary payments to staff" },
  { accountName: "Office Supplies Expense",  accountType: "Expense", description: "Stationery, printer ink, misc supplies" },
  { accountName: "Electricity Expense",      accountType: "Expense", description: "Electricity bills" },
  { accountName: "Maintenance Expense",      accountType: "Expense", description: "Building & equipment maintenance" },
  { accountName: "Transport Expense",        accountType: "Expense", description: "Fuel, driver salary, vehicle upkeep" },
  { accountName: "Staff Welfare Expense",    accountType: "Expense", description: "Medical, bonus, and welfare expenses" },
];

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN SEED FUNCTION
// ─────────────────────────────────────────────────────────────────────────────
const seed = async (subdomain) => {
  // ── 1. Connect to Main DB to get tenant's dbUri ──────────────────────────
  const mainUri = process.env.MAIN_DB_URI;
  if (!mainUri) throw new Error("MAIN_DB_URI not set in .env");

  console.log("\n🔗 Connecting to Main DB...");
  const mainConn = await mongoose.createConnection(mainUri).asPromise();

  const TenantSchema = new mongoose.Schema({ subdomain: String, dbUri: String });
  const Tenant = mainConn.models.Tenant || mainConn.model("Tenant", TenantSchema, "tenants");

  const tenant = await Tenant.findOne({ subdomain: subdomain.toLowerCase().trim() });
  if (!tenant) throw new Error(`Tenant '${subdomain}' not found in Main DB`);
  if (!tenant.dbUri) throw new Error(`Tenant '${subdomain}' has no dbUri`);

  console.log(`✅ Tenant found: ${subdomain} → ${tenant.dbUri.substring(0, 50)}...`);

  // ── 2. Connect to Tenant DB ──────────────────────────────────────────────
  console.log("\n🔗 Connecting to Tenant DB...");
  const db = await mongoose.createConnection(tenant.dbUri).asPromise();
  console.log("✅ Tenant DB connected\n");

  // Register models on tenant connection
  const Department    = getModel(db, "HRDepartment",     DeptSchema);
  const Designation   = getModel(db, "HRDesignation",    DesigSchema);
  const Staff         = getModel(db, "HRStaff",          StaffSchema);
  const SalStr        = getModel(db, "HRSalaryStructure",SalStrSchema);
  const Attendance    = getModel(db, "HRAttendance",     AttSchema);
  const Leave         = getModel(db, "HRLeave",          LeaveSchema);
  const Payroll       = getModel(db, "HRPayroll",        PayrollSchema);
  const SalPay        = getModel(db, "HRSalaryPayment",  SalPaySchema);
  const AccountHead   = getModel(db, "HRAccountHead",    AccHeadSchema);
  const Voucher       = getModel(db, "HRVoucher",        VoucherSchema);

  // ────────────────────────────────────────────────────────────────────────
  //  STEP 1 — DEPARTMENTS
  // ────────────────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════");
  console.log("  STEP 1 — Departments");
  console.log("═══════════════════════════════════════════");

  const deptMap = {}; // name → _id
  for (const d of DEPARTMENTS) {
    const doc = await upsert(Department, { name: d.name }, d, `Department: ${d.name}`);
    deptMap[d.name] = doc._id;
  }

  // ────────────────────────────────────────────────────────────────────────
  //  STEP 2 — DESIGNATIONS
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log("  STEP 2 — Designations");
  console.log("═══════════════════════════════════════════");

  const desigMap = {}; // name → _id
  for (const d of DESIGNATIONS_DEF) {
    const departmentId = deptMap[d.deptName];
    const doc = await upsert(
      Designation,
      { name: d.name, department: departmentId },
      { name: d.name, department: departmentId, staffType: d.staffType },
      `Designation: ${d.name} (${d.deptName})`
    );
    desigMap[d.name] = doc._id;
  }

  // ────────────────────────────────────────────────────────────────────────
  //  STEP 3 — STAFF
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log("  STEP 3 — Staff Members");
  console.log("═══════════════════════════════════════════");

  const staffMap = {}; // employeeCode → _id
  for (const s of STAFF_DEF) {
    const data = {
      employeeCode:   s.employeeCode,
      employeeName:   s.employeeName,
      staffType:      s.staffType,
      department:     deptMap[s.deptName],
      designation:    desigMap[s.desigName],
      mobile:         s.mobile,
      email:          s.email,
      gender:         s.gender,
      dateOfBirth:    new Date(s.dateOfBirth),
      dateOfJoining:  new Date(s.dateOfJoining),
      address:        s.address,
      employmentType: s.employmentType,
      monthlySalary:  s.monthlySalary,
      bankName:       s.bankName,
      accountNumber:  s.accountNumber,
      ifscCode:       s.ifscCode,
      isActive:       true,
    };
    const doc = await upsert(Staff, { employeeCode: s.employeeCode }, data,
      `Staff: ${s.employeeName} (${s.employeeCode})`);
    staffMap[s.employeeCode] = doc._id;
  }

  // ────────────────────────────────────────────────────────────────────────
  //  STEP 4 — SALARY STRUCTURES
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log("  STEP 4 — Salary Structures");
  console.log("═══════════════════════════════════════════");

  // basic = 70% of monthlySalary, allowance = 20%, fixedDeduction = 10% (PF)
  for (const s of STAFF_DEF) {
    const staffId      = staffMap[s.employeeCode];
    const basic        = Math.round(s.monthlySalary * 0.70);
    const allowance    = Math.round(s.monthlySalary * 0.20);
    const deduction    = Math.round(s.monthlySalary * 0.10);
    const gross        = basic + allowance - deduction; // should equal monthlySalary

    const existing = await SalStr.findOne({ staff: staffId, status: "Active" });
    if (existing) {
      console.log(`  SKIP  SalaryStructure for ${s.employeeName}`);
      continue;
    }
    await SalStr.create({
      staff: staffId,
      effectiveFrom:  new Date("2026-04-01"),
      basicSalary:    basic,
      allowance:      allowance,
      fixedDeduction: deduction,
      grossSalary:    gross,
      status:         "Active",
    });
    // Also update staff.monthlySalary to gross
    await Staff.findByIdAndUpdate(staffId, { monthlySalary: gross });
    console.log(`  ADD   SalaryStructure: ${s.employeeName} → Basic ₹${basic} + Allow ₹${allowance} - PF ₹${deduction} = Gross ₹${gross}`);
  }

  // ────────────────────────────────────────────────────────────────────────
  //  STEP 5 — ATTENDANCE (July 2026 — 1st to 31st)
  //  Logic: Mon-Fri → Present, Sat → Half Day, Sun → Weekly Off
  //         3 random Absents, 2 random Paid Leaves per staff
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log("  STEP 5 — Attendance (July 2026)");
  console.log("═══════════════════════════════════════════");

  const MONTH = "2026-07";
  const [yr, mo] = MONTH.split("-").map(Number);
  const daysInMonth = new Date(yr, mo, 0).getDate();

  // Staff that will have absences/leaves — using first 5 staff
  const absenceStaff  = ["STF-1003", "STF-1005", "STF-1007"];
  const leaveStaff    = ["STF-1004", "STF-1006"];

  // days with absence (deterministic so re-runs are idempotent)
  const absentDaysFor = { "STF-1003": [7, 14], "STF-1005": [10], "STF-1007": [22, 28] };
  // leave periods
  const leavePeriods  = {
    "STF-1004": { from: "2026-07-21", to: "2026-07-22", type: "Casual Leave" },
    "STF-1006": { from: "2026-07-17", to: "2026-07-17", type: "Sick Leave"   },
  };

  let attAdded = 0, attSkipped = 0;
  const bulkOps = [];

  for (const s of STAFF_DEF) {
    const staffId = staffMap[s.employeeCode];
    const myAbsentDays = absentDaysFor[s.employeeCode] || [];
    const myLeave      = leavePeriods[s.employeeCode];
    const leaveDays    = myLeave ? dateRange(myLeave.from, myLeave.to).map(d => d.getUTCDate()) : [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date    = new Date(Date.UTC(yr, mo - 1, day));
      const weekday = date.getUTCDay(); // 0=Sun, 6=Sat

      let status = "Present";
      if      (weekday === 0)                status = "Weekly Off";
      else if (weekday === 6)                status = "Half Day";
      else if (myAbsentDays.includes(day))   status = "Absent";
      else if (leaveDays.includes(day))      status = "Paid Leave";

      bulkOps.push({
        updateOne: {
          filter: { staff: staffId, date },
          update: { $set: { staff: staffId, date, status, remarks: "" } },
          upsert: true,
        },
      });
    }
  }

  if (bulkOps.length) {
    const res = await Attendance.bulkWrite(bulkOps, { ordered: false });
    attAdded   = res.upsertedCount;
    attSkipped = res.modifiedCount;
  }
  console.log(`  ADD   ${attAdded} attendance records | Modified: ${attSkipped}`);

  // ────────────────────────────────────────────────────────────────────────
  //  STEP 6 — LEAVES (apply + approve with auto-attendance update)
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log("  STEP 6 — Leave Applications");
  console.log("═══════════════════════════════════════════");

  const LEAVES_DEF = [
    { code: "STF-1004", leaveType: "Casual Leave", from: "2026-07-21", to: "2026-07-22", reason: "Family function — sister's wedding", status: "Approved" },
    { code: "STF-1006", leaveType: "Sick Leave",   from: "2026-07-17", to: "2026-07-17", reason: "Fever and viral infection",          status: "Approved" },
    { code: "STF-1003", leaveType: "Casual Leave", from: "2026-08-04", to: "2026-08-05", reason: "Personal work",                       status: "Pending"  },
    { code: "STF-1008", leaveType: "Unpaid Leave",  from: "2026-08-11", to: "2026-08-12", reason: "Travel outside city",               status: "Pending"  },
  ];

  for (const l of LEAVES_DEF) {
    const staffId  = staffMap[l.code];
    const fromDate = dateOnly(l.from);
    const toDate   = dateOnly(l.to);
    const totalDays = dateRange(fromDate, toDate).length;

    const existing = await Leave.findOne({ staff: staffId, fromDate, toDate });
    if (existing) {
      console.log(`  SKIP  Leave: ${l.code} ${l.from}–${l.to}`);
      continue;
    }

    const leave = await Leave.create({
      staff: staffId, leaveType: l.leaveType,
      fromDate, toDate, totalDays,
      reason: l.reason, status: "Pending",
    });

    // Auto-approve if needed (mirrors leaveController.updateLeaveStatus logic)
    if (l.status === "Approved") {
      leave.status = "Approved";
      leave.approvedAt = new Date();
      await leave.save();

      // Mark attendance for leave days
      const attStatus = l.leaveType === "Unpaid Leave" ? "Unpaid Leave" : "Paid Leave";
      const dates = dateRange(fromDate, toDate);
      const ops = dates.map(date => ({
        updateOne: {
          filter: { staff: staffId, date },
          update: { $set: { staff: staffId, date, status: attStatus, remarks: `Auto: ${l.leaveType}` } },
          upsert: true,
        },
      }));
      if (ops.length) await Attendance.bulkWrite(ops, { ordered: false });
      console.log(`  ADD   Leave (APPROVED): ${l.code} — ${l.leaveType} — ${l.from} to ${l.to} (${totalDays}d)`);
    } else {
      console.log(`  ADD   Leave (PENDING): ${l.code} — ${l.leaveType} — ${l.from} to ${l.to}`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  //  STEP 7 — PAYROLL GENERATION (July 2026)
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log("  STEP 7 — Payroll Generation (July 2026)");
  console.log("═══════════════════════════════════════════");

  const attStart  = new Date(Date.UTC(yr, mo - 1, 1));
  const attEnd    = new Date(Date.UTC(yr, mo, 1));
  const allAtt    = await Attendance.find({
    staff: { $in: Object.values(staffMap) },
    date:  { $gte: attStart, $lt: attEnd },
  }).lean();

  // Build attendance summary per staff
  const attSummary = {};
  allAtt.forEach(({ staff, status }) => {
    const id = staff.toString();
    if (!attSummary[id]) attSummary[id] = { present: 0, absent: 0, paidLeave: 0, unpaidLeave: 0 };
    if      (status === "Present")       attSummary[id].present++;
    else if (status === "Half Day")      attSummary[id].present += 0.5;
    else if (status === "Absent")        attSummary[id].absent++;
    else if (status === "Paid Leave")    attSummary[id].paidLeave++;
    else if (status === "Unpaid Leave")  attSummary[id].unpaidLeave++;
  });

  const payrollIds = {}; // employeeCode → payroll _id
  for (const s of STAFF_DEF) {
    const staffId = staffMap[s.employeeCode];
    const existing = await Payroll.findOne({ staff: staffId, salaryMonth: MONTH });
    if (existing) {
      console.log(`  SKIP  Payroll: ${s.employeeName}`);
      payrollIds[s.employeeCode] = existing._id;
      continue;
    }

    const staffDoc  = await Staff.findById(staffId).lean();
    const salary    = staffDoc.monthlySalary || s.monthlySalary;
    const att       = attSummary[staffId.toString()] || { present: 0, absent: 0, paidLeave: 0, unpaidLeave: 0 };
    const perDay    = daysInMonth > 0 ? salary / daysInMonth : 0;
    const absDed    = Math.round(att.absent      * perDay);
    const lvDed     = Math.round(att.unpaidLeave * perDay);
    const totalDed  = absDed + lvDed;
    const netSalary = Math.max(0, salary - totalDed);

    const pr = await Payroll.create({
      salaryMonth:      MONTH,
      staff:            staffId,
      monthlySalary:    salary,
      presentDays:      Math.round(att.present),
      absentDays:       att.absent,
      paidLeave:        att.paidLeave,
      unpaidLeave:      att.unpaidLeave,
      absentDeduction:  absDed,
      leaveDeduction:   lvDed,
      totalDeduction:   totalDed,
      netSalary,
      paymentStatus:    "Unpaid",
    });
    payrollIds[s.employeeCode] = pr._id;
    console.log(`  ADD   Payroll: ${s.employeeName} → Gross ₹${salary} - Deduction ₹${totalDed} = Net ₹${netSalary}`);
  }

  // ────────────────────────────────────────────────────────────────────────
  //  STEP 8 — SALARY PAYMENTS (pay 7 out of 10 staff)
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log("  STEP 8 — Salary Payments");
  console.log("═══════════════════════════════════════════");

  const PAID_STAFF = ["STF-1001","STF-1002","STF-1003","STF-1004","STF-1005","STF-1006","STF-1007"];
  const PAY_DATE   = new Date("2026-08-02");
  const PAY_MODES  = ["Bank Transfer","Bank Transfer","UPI","Bank Transfer","Cash","Bank Transfer","UPI"];

  for (let i = 0; i < PAID_STAFF.length; i++) {
    const code       = PAID_STAFF[i];
    const staffId    = staffMap[code];
    const payrollId  = payrollIds[code];
    if (!payrollId) continue;

    const payroll  = await Payroll.findById(payrollId).lean();
    if (!payroll || payroll.paymentStatus === "Paid") {
      console.log(`  SKIP  Payment: ${code} (already Paid)`);
      continue;
    }

    const existing = await SalPay.findOne({ payroll: payrollId });
    if (existing) {
      console.log(`  SKIP  Payment: ${code} (payment record exists)`);
      continue;
    }

    const payment = await SalPay.create({
      payroll:     payrollId,
      staff:       staffId,
      salaryMonth: MONTH,
      paymentDate: PAY_DATE,
      paymentMode: PAY_MODES[i] || "Cash",
      paidAmount:  payroll.netSalary,
      transactionReference: `TXN-2026-${String(i + 1001).padStart(4,"0")}`,
      remarks:     "Full salary disbursed for July 2026",
    });

    // Update payroll status to Paid
    await Payroll.findByIdAndUpdate(payrollId, { paymentStatus: "Paid" });
    console.log(`  ADD   Payment: ${code} → ₹${payroll.netSalary} via ${PAY_MODES[i] || "Cash"}`);
  }

  // ────────────────────────────────────────────────────────────────────────
  //  STEP 9 — ACCOUNT HEADS
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log("  STEP 9 — Account Heads");
  console.log("═══════════════════════════════════════════");

  const accHeadMap = {}; // accountName → _id
  for (const ah of ACCOUNT_HEADS) {
    const doc = await upsert(
      AccountHead,
      { accountName: ah.accountName, accountType: ah.accountType },
      ah,
      `AccountHead: [${ah.accountType}] ${ah.accountName}`
    );
    accHeadMap[ah.accountName] = doc._id;
  }

  // ────────────────────────────────────────────────────────────────────────
  //  STEP 10 — VOUCHERS (manual income + expense entries)
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log("  STEP 10 — Vouchers");
  console.log("═══════════════════════════════════════════");

  const VOUCHERS_DEF = [
    {
      voucherNumber:  "INC-2026-0001",
      voucherDate:    new Date("2026-07-05"),
      voucherType:    "Income",
      paymentMode:    "Bank Transfer",
      remarks:        "Tuition fee collection — July 2026 batch A",
      transactions:   [{ head: "Tuition Fee Income", amount: 285000, remarks: "Class 9-12 tuition fee July" }],
    },
    {
      voucherNumber:  "INC-2026-0002",
      voucherDate:    new Date("2026-07-08"),
      voucherType:    "Income",
      paymentMode:    "UPI",
      remarks:        "Transport fee collection July 2026",
      transactions:   [{ head: "Transport Fee Income", amount: 42000, remarks: "Bus fee 35 students" }],
    },
    {
      voucherNumber:  "INC-2026-0003",
      voucherDate:    new Date("2026-07-12"),
      voucherType:    "Income",
      paymentMode:    "Cash",
      remarks:        "New admissions July 2026",
      transactions:   [{ head: "Admission Fee Income", amount: 18000, remarks: "6 new admissions × ₹3000" }],
    },
    {
      voucherNumber:  "EXP-2026-0001",
      voucherDate:    new Date("2026-07-10"),
      voucherType:    "Expense",
      paymentMode:    "Cash",
      remarks:        "Office supplies purchased",
      transactions:   [{ head: "Office Supplies Expense", amount: 4800, remarks: "Chalk, registers, printer paper" }],
    },
    {
      voucherNumber:  "EXP-2026-0002",
      voucherDate:    new Date("2026-07-15"),
      voucherType:    "Expense",
      paymentMode:    "Bank Transfer",
      remarks:        "Electricity bill July 2026",
      transactions:   [{ head: "Electricity Expense", amount: 12500, remarks: "UP Power Corp — July bill" }],
    },
    {
      voucherNumber:  "EXP-2026-0003",
      voucherDate:    new Date("2026-07-20"),
      voucherType:    "Expense",
      paymentMode:    "Cash",
      remarks:        "Building maintenance work",
      transactions:   [{ head: "Maintenance Expense", amount: 7200, remarks: "Classroom painting — 3 rooms" }],
    },
    {
      voucherNumber:  "EXP-2026-0004",
      voucherDate:    new Date("2026-07-25"),
      voucherType:    "Expense",
      paymentMode:    "Bank Transfer",
      remarks:        "Transport vehicle fuel July 2026",
      transactions:   [{ head: "Transport Expense", amount: 9600, remarks: "Diesel — 2 school buses" }],
    },
  ];

  for (const v of VOUCHERS_DEF) {
    const exists = await Voucher.findOne({ voucherNumber: v.voucherNumber });
    if (exists) {
      console.log(`  SKIP  Voucher: ${v.voucherNumber}`);
      continue;
    }
    const transactions = v.transactions.map(t => ({
      accountHead: accHeadMap[t.head],
      amount:      t.amount,
      remarks:     t.remarks,
    }));
    const totalAmount = transactions.reduce((s, t) => s + t.amount, 0);
    await Voucher.create({ ...v, transactions, totalAmount, status: "Active", sourceModule: "Manual" });
    console.log(`  ADD   Voucher: ${v.voucherNumber} [${v.voucherType}] ₹${totalAmount} — ${v.remarks.substring(0,45)}`);
  }

  // ────────────────────────────────────────────────────────────────────────
  //  DONE
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n✅ HR Seed Complete!\n");
  console.log("Summary of seeded data:");
  console.log(`  • ${DEPARTMENTS.length}   Departments`);
  console.log(`  • ${DESIGNATIONS_DEF.length}  Designations`);
  console.log(`  • ${STAFF_DEF.length}  Staff members`);
  console.log(`  • ${STAFF_DEF.length}  Salary structures`);
  console.log(`  • ${STAFF_DEF.length * daysInMonth}  Attendance records (all staff, full July)`);
  console.log(`  • ${LEAVES_DEF.length}   Leave applications (2 Approved, 2 Pending)`);
  console.log(`  • ${STAFF_DEF.length}  Payroll records (July 2026)`);
  console.log(`  • ${PAID_STAFF.length}   Salary payments (${PAID_STAFF.length} paid, ${STAFF_DEF.length - PAID_STAFF.length} pending)`);
  console.log(`  • ${ACCOUNT_HEADS.length}  Account heads`);
  console.log(`  • ${VOUCHERS_DEF.length}   Vouchers (3 Income, 4 Expense)`);

  await mainConn.close();
  await db.close();
  console.log("\n🔌 Connections closed.");
};

// ─────────────────────────────────────────────────────────────────────────────
//  ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
const subdomain = process.argv[2];
if (!subdomain) {
  console.error("Usage: node scripts/seedHRData.js <tenant-subdomain>");
  console.error("Example: node scripts/seedHRData.js taha");
  process.exit(1);
}

seed(subdomain).catch((err) => {
  console.error("\n❌ Seed failed:", err.message);
  process.exit(1);
});
