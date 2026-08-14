// dynamic/aiDynamicSchema.js
export const SCHEMA_CONTEXT = `
## MongoDB Collections — School Tenant DB
## ⚠️ SESSION FIELD NAMES DIFFER PER COLLECTION — follow exactly

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### sessions  (collection: sessions)
  sessionName  String   (e.g. "2025-26")
  isCurrent    Boolean
  isActive     Boolean
  order        Number
  transportVacations Array[{ level:"SCHOOL"|"CLASS", classIds:[ObjectId], months:[String], reason:String, isActive:Boolean }]
  createdAt, updatedAt  Date

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### classes  (collection: classes)
  name     String   (e.g. "Nursery","LKG","UKG","1"…"12","Prep")
  session  ObjectId → sessions._id   ← field name is "session"
  isSenior Boolean  (true for class 9-12)
  isActive Boolean
  order    Number

### sections  (collection: sections)
  name     String   (e.g. "A","B","C")
  classes  ObjectId → classes._id   ← field name is "classes" (NOT classId)
  session  ObjectId → sessions._id  ← field name is "session"
  order    Number
  isActive Boolean

### streams  (collection: streams)   [Science / Commerce / Arts — for Class 11-12]
  name     String
  classId  ObjectId → classes._id
  session  ObjectId → sessions._id   ← field name is "session"
  isActive Boolean
  order    Number

### subjects  (collection: subjects)
  name     String
  classes  ObjectId → classes._id    ← field name is "classes" (not classId)
  streamId ObjectId → streams._id    (nullable)
  session  ObjectId → sessions._id   ← field name is "session"
  isActive Boolean
  order    Number

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### studentenrolments  (collection: studentenrolments)
  session          ObjectId → sessions._id   ← MUST use "session" (NOT sessionId)
  firstName, middleName, lastName  String
  gender           "Male"|"Female"|"Other"
  dob              Date
  category, religion, caste  String
  rollNumber, studentId, srNumber, registrationNo, formNo  String
  admissionDate    Date
  admissionMonth   String   (e.g. "April")
  currentClass     ObjectId → classes._id
  currentSection   ObjectId → sections._id
  stream           ObjectId → streams._id
  status           "Studying"|"Passed"|"Left"
  resultStatus     "Pass"|"Fail"|""
  fatherName, motherName  String
  fatherOccupation, motherOccupation  String
  guardianName, guardianPhone  String
  address          { present: { City, State, Pin }, permanent: { City, State, Pin } }
  transportRequired "YES"|"NO"|"NOT_CONFIRM"
  transportType    "HOME_TO_SCHOOL"|"SCHOOL_TO_HOME"|"BOTH"
  transportExemptMonths  [String]   (months where transport is waived, e.g. ["JUNE","JULY"])
  transportHistory Array[{ action:"START"|"STOP", month:String, date:Date, reason:String }]
  routeId          ObjectId → routemasters._id
  stopId           ObjectId → routestops._id
  fullFeeConcession      Boolean  (entire fee waived)
  fullFeeExceptTransport Boolean  (all fee waived except transport)
  discount         String   (numeric discount value)
  discountType     "%"|"₹"
  sibling          Array[{ siblingStudentId:ObjectId, class:ObjectId, section:ObjectId }]
  house, medium, studentType  String
  createdAt, updatedAt  Date    ← use createdAt for "latest/recent admission"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### teachers  (collection: teachers)
  firstName, middleName, lastName  String
  gender       "Male"|"Female"|"Other"
  dob          Date
  designation  String   (e.g. "Principal","TGT","PGT","PRT")
  department   String
  employmentType "Permanent"|"Contract"|"Temporary"
  employeeId   String
  dateOfJoining Date
  subjects     [String]
  salary       String
  status       "Active"|"On Leave"|"Resigned"|"Retired"
  classesAssigned Array[{ session:ObjectId, classId:ObjectId, sectionId:ObjectId, subjectId:ObjectId, isClassTeacher:Boolean }]
  createdAt, updatedAt  Date
  ⚠️ No sessionId — teachers are global. Filter by classesAssigned.session if session-specific needed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### attendances  (collection: attendances)
  sessionId  ObjectId → sessions._id   ← MUST use "sessionId"
  classId    ObjectId → classes._id
  sectionId  ObjectId → sections._id
  date       Date
  attendance Array[{ studentId:ObjectId, status:"P"|"A"|"L"|"H" }]
             P=Present  A=Absent  L=Leave  H=Holiday

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### homeworks  (collection: homeworks)
  sessionId  ObjectId → sessions._id   ← MUST use "sessionId"
  classId    ObjectId → classes._id
  sectionId  ObjectId → sections._id
  subject    String
  description String
  dueDate    Date
  isActive   Boolean
  createdAt  Date

### notices  (collection: notices)
  session    ObjectId → sessions._id   ← field name is "session" (NOT sessionId)
  title, description  String
  isActive   Boolean
  createdAt  Date

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### feestructures  (collection: feestructures)   ← Tuition fee heads per class
  sessionId        ObjectId → sessions._id   ← MUST use "sessionId"
  classId          ObjectId → classes._id
  streamId         ObjectId → streams._id    (null = all streams)
  feeHeadName      String   (e.g. "Tuition Fee","Sports Fee","Computer Lab Fee")
  installmentType  ObjectId → installmenttypes._id  ($lookup for name: "MONTHLY"|"QUARTERLY"|"CUSTOM_10")
  totalInstallments Number
  totalAmount      Number   (annual total for this fee head)
  order            Number
  remark           String
  isActive         Boolean

### feeinstallments  (collection: feeinstallments)   ← Per-installment breakdown of feestructures
  feeStructureId  ObjectId → feestructures._id
  installmentNo   Number   (1, 2, 3 …)
  period          "APRIL"|"MAY"|"JUNE"|"JULY"|"AUGUST"|"SEPTEMBER"|
                  "OCTOBER"|"NOVEMBER"|"DECEMBER"|"JANUARY"|"FEBRUARY"|"MARCH"|
                  "APR-JUN"|"JUL-SEP"|"OCT-DEC"|"JAN-MAR"
  amount          Number
  dueDate         Date
  status          "PENDING"|"PAID"

### installmenttypes  (collection: installmenttypes)
  name      "MONTHLY"|"QUARTERLY"|"CUSTOM_10"
  isActive  Boolean

### additionalfees  (collection: additionalfees)   ← Extra fees: Lab, Exam, Activity, Annual Charge etc.
  sessionId  ObjectId → sessions._id   ← MUST use "sessionId"
  classId    ObjectId → classes._id    (null = applies to ALL classes)
  streamId   ObjectId → streams._id    (null = all streams)
  feeName    String   (e.g. "Lab Fee","Exam Fee","Activity Fee","Annual Charge","Computer Fee")
  feeType    "ONE_TIME"|"MONTH"|"QUARTER"
  period     String   (e.g. "APRIL","APR-JUN")
  amount     Number
  dueDate    Date
  remark     String
  isActive   Boolean
  ⚠️ classId=null means fee applies to ALL classes — always include null-classId records when filtering by class

### additionalfeewaivers  (collection: additionalfeewaivers)   ← Waiver for additional fees per student
  sessionId      ObjectId → sessions._id
  studentId      ObjectId → studentenrolments._id
  additionalFeeId ObjectId → additionalfees._id
  classId, sectionId  ObjectId
  feeName        String
  period         String
  amount         Number
  waivedAmount   Number
  isWaived       Boolean
  waiverReason   String
  waivedAt       Date

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### studentpayments  (collection: studentpayments)   ← Every payment transaction
  sessionId     ObjectId → sessions._id   ← MUST use "sessionId"
  studentId     ObjectId → studentenrolments._id
  classId       ObjectId → classes._id
  streamId      ObjectId → streams._id    (null)
  clerkId       ObjectId → users._id      (who collected)
  amountPaid    Number
  paymentMode   "CASH"|"ONLINE"|"CHEQUE"|"UPI"
  paymentType   "OFFLINE"|"ONLINE"
  paymentStatus "PENDING"|"SUCCESS"|"FAILED"|"CANCELLED"
  receiptNo     String   (unique)
  referenceNo   String
  remarks       String
  paymentDate   Date
  createdAt     Date

### studentpaymentallocations  (collection: studentpaymentallocations)   ← How each payment was split
  paymentId       ObjectId → studentpayments._id
  feeType         "TUITION"|"ADDITIONAL"|"TRANSPORT"|"LATE_FEE"
  referenceId     ObjectId → (feeinstallments._id | additionalfees._id | transportfees._id | latefees._id)
  allocatedAmount Number

### latefees  (collection: latefees)   ← Late payment fines per student per installment
  sessionId     ObjectId → sessions._id
  studentId     ObjectId → studentenrolments._id
  classId       ObjectId → classes._id
  referenceId   ObjectId → feeinstallments._id
  referenceType String   (default: "TUITION")
  period        String
  amount        Number   (calculated fine)
  paidAmount    Number   (how much fine is paid)
  isWaived      Boolean
  waivedAmount  Number
  waivedBy      ObjectId
  waiverReason  String
  waivedAt      Date

### latefeeSettings  (collection: latefeesettings)   ← Rules for calculating late fees
  sessionId   ObjectId → sessions._id
  graceDays   Number   (days after due date before fine starts)
  fineType    "PER_DAY"|"FIXED"
  fineAmount  Number
  maxFine     Number   (maximum cap)
  isActive    Boolean

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### transportfees  (collection: transportfees)   ← Per-student per-period transport fee record
  studentId    ObjectId → studentenrolments._id
  sessionId    ObjectId → sessions._id   ← MUST use "sessionId"
  routeId      ObjectId → routemasters._id
  stopId       ObjectId → routestops._id
  transportType "HOME_TO_SCHOOL"|"SCHOOL_TO_HOME"|"BOTH"
  period       String   (e.g. "APRIL","APR-JUN")
  amount       Number
  dueDate      Date
  isActive     Boolean

### transportfeewaivers  (collection: transportfeewaivers)   ← Waiver for transport fee per student
  sessionId      ObjectId → sessions._id
  studentId      ObjectId → studentenrolments._id
  transportFeeId ObjectId → transportfees._id
  classId, sectionId  ObjectId
  period         String
  amount         Number
  waivedAmount   Number
  isWaived       Boolean
  waiverReason   String
  waivedAt       Date

### studenttransports  (collection: studenttransports)   ← Student-route assignment
  studentId  ObjectId → studentenrolments._id
  routeId    ObjectId → routemasters._id
  stopId     ObjectId → routestops._id
  sessionId  ObjectId → sessions._id
  pickupType "ONE_WAY"|"TWO_WAY"
  feeAmount  Number
  isActive   Boolean

### routemasters  (collection: routemasters)
  routeName      String
  routeCode      String
  startLocation  String
  endLocation    String
  isActive       Boolean

### routestops  (collection: routestops)
  routeId        ObjectId → routemasters._id
  stopName       String
  stopOrder      Number
  pickupTime, dropTime  String
  feeAmount      Number    (legacy, single direction)
  feeHomeToSchool Number
  feeSchoolToHome Number
  feeBoth         Number
  isActive        Boolean

### busmasters  (collection: busmasters)
  busNumber      String
  busName        String
  driverName     String
  driverPhone    String
  conductorName  String
  conductorPhone String
  capacity       Number
  isActive       Boolean

### busroutes  (collection: busroutes)   ← Bus-to-route assignment per session
  busId      ObjectId → busmasters._id
  routeId    ObjectId → routemasters._id
  sessionId  ObjectId → sessions._id
  isActive   Boolean

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### examlists  (collection: examlists)   ← Exam schedule per class per session
  examMasterId  ObjectId → exammasters._id
  sessionId     ObjectId → sessions._id
  classId       ObjectId → classes._id
  streamId      ObjectId → streams._id  (null)
  fromDate, toDate  Date
  isActive, isPublished  Boolean
  order         Number
  remarks       String
  subjects      Array[{ subjectId:ObjectId, maxMarks:Number, passingMarks:Number }]

### exammasters  (collection: exammasters)   ← Exam name/type master
  examName   String   (e.g. "Unit Test 1","Half Yearly","Annual Exam")
  session    ObjectId → sessions._id   ← field name is "session"
  category   "EXAM"|"TEST"
  isActive   Boolean
  order      Number

### marksheets  (collection: marksheets)   ← Student result per exam per class
  examListId          ObjectId → examlists._id
  sessionId           ObjectId → sessions._id   ← MUST use "sessionId"
  studentId           ObjectId → studentenrolments._id
  classId             ObjectId → classes._id
  sectionId           ObjectId → sections._id
  streamId            ObjectId → streams._id    (null)
  subjects            Array[{ subjectId:ObjectId, marksObtained:Number, maxMarks:Number }]
  totalObtainedMarks  Number
  totalMarks          Number
  percentage          Number
  result              "PASS"|"FAIL"
  isPublished         Boolean   ← ONLY published marksheets are visible to students/parents
  createdAt           Date

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## CRITICAL: SESSION FIELD NAME CHEATSHEET
  studentenrolments   → "session"     (ObjectId)
  classes             → "session"     (ObjectId)
  sections            → "session"     (ObjectId)
  streams             → "session"     (ObjectId)
  subjects            → "session"     (ObjectId)
  notices             → "session"     (ObjectId)
  exammasters         → "session"     (ObjectId)
  studentregistrations → "session"    (ObjectId)

  attendances         → "sessionId"   (ObjectId)
  studentpayments     → "sessionId"   (ObjectId)
  homeworks           → "sessionId"   (ObjectId)
  feestructures       → "sessionId"   (ObjectId)
  additionalfees      → "sessionId"   (ObjectId)
  additionalfeewaivers → "sessionId"  (ObjectId)
  transportfees       → "sessionId"   (ObjectId)
  transportfeewaivers → "sessionId"   (ObjectId)
  studenttransports   → "sessionId"   (ObjectId)
  latefees            → "sessionId"   (ObjectId)
  latefeesettings     → "sessionId"   (ObjectId)
  feeinstallments     → (no sessionId — join via feeStructureId → feestructures.sessionId)
  marksheets          → "sessionId"   (ObjectId)
  examlists           → "sessionId"   (ObjectId)
  busroutes           → "sessionId"   (ObjectId)
  teachers            → no sessionId  (use classesAssigned.session for session-specific)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## FEE DATA ARCHITECTURE
- Tuition fee heads       → feestructures  (one record per fee head per class)
- Tuition installments    → feeinstallments ($lookup via feeStructureId)
- Additional fees         → additionalfees  (Lab, Exam, Activity etc.)
- Per-student transport   → transportfees  (one record per student per period)
- All payments            → studentpayments
- Payment split detail    → studentpaymentallocations (TUITION/ADDITIONAL/TRANSPORT/LATE_FEE)
- Late fines              → latefees
- Late fee rules          → latefeesettings
- Additional fee waivers  → additionalfeewaivers
- Transport fee waivers   → transportfeewaivers

## KEY QUERY PATTERNS
- "fee heads / fee structure class X" → feestructures + additionalfees ($facet both) + $lookup installmenttypes
- "total fee collected today/this week" → studentpayments WHERE paymentStatus="SUCCESS"
- "defaulters (who hasn't paid)" → studentenrolments LEFT JOIN studentpayments GROUP → totalPaid=0
- "attendance today class X" → attendances WHERE date=TODAY → unwind → count P/A/L
- "absent student list" → attendances → unwind → filter status="A" → $lookup studentenrolments
- "topper class X" → marksheets WHERE isPublished=true → $lookup studentenrolments → sort percentage desc → limit 1
- "class/section-wise student count" → studentenrolments → $lookup classes → $group by class name
- "transport students" → studentenrolments WHERE transportRequired="YES" OR studenttransports
- "exam result class X" → marksheets WHERE isPublished=true → $lookup classes filter → group by result
- "subject list class X" → subjects WHERE classes=classId AND session=sessionId
- "teacher class assignment" → teachers → $unwind classesAssigned → $lookup classes/sections/subjects
- For additionalfees: always include { classId: null } records (global fees) alongside class-specific

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### studentregistrations  (collection: studentregistrations)   ← Pre-admission enquiry/registration
  session            ObjectId → sessions._id   ← field name is "session"
  firstName, middleName, lastName  String
  gender             String
  fatherName         String
  currentClass       ObjectId → classes._id
  registrationDate   Date
  registrationFee    String
  paymentMode        String
  formNo             String
  isEnroll           Boolean   (true = converted to full admission)
  remark             String
  createdAt          Date

### certificates  (collection: certificates)   ← TC / Character certificate issued
  type        "transfer"|"character"
  studentId   ObjectId → studentenrolments._id
  studentName String
  admissionNo String
  className   String
  section     String
  session     String   (stored as text e.g. "2025-26")
  fatherName  String
  dateOfLeaving  String
  reasonForLeaving String
  feesPaidUpTo   String
  conductRating  String
  issueDate   Date
  status      "Draft"|"Issued"|"Cancelled"
  serialNo    Number
  issuedBy    ObjectId → users._id
  createdAt   Date

### notifications  (collection: notifications)   ← In-app push notifications
  userId    ObjectId → users._id
  userRole  String
  title     String
  message   String
  isRead    Boolean
  readAt    Date
  payload   Object
  createdAt Date

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## BLOCKED (never expose in pipelines)
  password, token, secret, aadhaarNo, studentAdhaarNumber,
  fatherAdhaarNumber, motherAdhaarNumber, gatewaySignature, phone,
  address.present.Mobile, address.permanent.Mobile, bankAccount
`;
