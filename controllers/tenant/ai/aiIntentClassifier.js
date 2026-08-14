/* ================================================================
   AI INTENT CLASSIFIER
   File    : controllers/tenant/ai/aiIntentClassifier.js
   Purpose : Classify user message intent for routing to appropriate data

   PRIORITY ORDER (most specific → most generic):
   1. Topper / Result        ← Check FIRST (has "class" + result words)
   2. Fee queries
   3. Attendance
   4. Teachers
   5. Students
   6. Homework / Exams / Subjects / Notices / Transport
   7. Classes (generic)      ← Check LAST for "class" keyword
   8. Privacy block
   9. General
================================================================ */

export function classifyIntent(message) {
  const m = message.toLowerCase()
    // ── Typo fixes ──
    .replace(/toper/g, "topper")
    // Nursery variants
    .replace(/younurssary|younursary|yunursary|nussary|nursary|nusery|narsary/g, "nursery")
    // "baki / baky / baqi" → "baaki"
    .replace(/\bbak[iy]\b/g, "baaki")
    // "kon / kaun / kaon" → "kaun" (ALL forms, not just end-of-word)
    .replace(/\bkon\b/g, "kaun")
    .replace(/\bkaon\b/g, "kaun")
    // "nahi / nahin / nhi" → "nahi"
    .replace(/\bnahi[n]?\b|\bnhi\b/g, "nahi")
    // Other normalizations
    .replace(/btao|bata do|bata de/g, "batao")
    .replace(/\baaj\b|\baaj ka\b/g, "today")
    .replace(/\bsabhi\b|\bsab\b/g, "all");

  const has = (...w) => w.some((x) => m.includes(x));

  /* ──────────────────────────────────────────────────────────────
     1. TOPPER / RESULT (HIGHEST PRIORITY — before "class" check)
     Catches: "class ka topper", "nursery topper", "top student"
     NOTE: "class first mein" = ordinal class name, NOT topper query
     So only match "class first" when paired with result/rank words
  ────────────────────────────────────────────────────────────── */
  if (has("topper", "top student", "highest marks", "best student",
          "first rank", "1st rank", "brightest", "merit list",
          "rank 1", "no 1", "number 1", "sabse zyada marks",
          "sabse acha", "highest percentage")) {
    return "topper";
  }

  // "class first" → topper ONLY if paired with result/rank context, not when asking student count
  if (has("class first") && has("kaun", "who", "rank", "topper", "best", "result", "marks", "score")) {
    return "topper";
  }

  /* ──────────────────────────────────────────────────────────────
     1b. MARKS / RESULT query with "kaun" → topper
  ────────────────────────────────────────────────────────────── */
  if (has("marks", "score", "percentage") && has("kaun", "who", "kis", "kiska"))
    return "topper";

  /* ──────────────────────────────────────────────────────────────
     2. FEE QUERIES
  ────────────────────────────────────────────────────────────── */
  if (has("today", "aaj", "abhi") && has("fee", "collection", "jama"))
    return "fee_today";

  // "expected fee", "collected fee", "pending fee total", "fee recovery", "collection rate"
  // → fee_overview (dashboard-accurate: expected vs collected vs pending)
  if (has("expected fee", "expected fees", "kitni fee expected"))
    return "fee_overview";
  if (has("collection rate", "recovery rate", "fee recovery", "fee ka overview", "fee overview"))
    return "fee_overview";
  if (has("collected fee", "collected fees", "fee collect hui", "fee aayi aur baki"))
    return "fee_overview";
  // "pending fee kitni" / "pending fees total" / "fee pending hai kitni" → overview (accurate calc)
  if (has("fee", "fees") && has("pending", "baaki", "baki", "due") &&
      !has("kaun", "kon", "list", "naam", "student", "kis", "defaulter") &&
      !has("today", "aaj"))
    return "fee_overview";

  // "kis student ki fee baaki" / "nursery mein fee pending kaun" → class defaulter list
  if (has("fee", "fees") && has("baaki", "pending", "due", "jama nahi", "nahi di", "nahi bhari") &&
      has("kis", "kaun", "kon", "list", "student", "kaun kaun"))
    return "fee_defaulters_class";

  // "defaulter list" / "defaulters ki list" → detailed student list
  if (has("defaulter", "defaulters") && has("list", "naam", "name", "kaun kaun", "students", "dikhao", "do", "batao", "dikha"))
    return "fee_defaulters_class";

  // "kitne defaulters" / "outstanding" → count only (no list)
  if (has("defaulter", "defaulters") || has("outstanding", "dues", "arrear"))
    return "fee_defaulters";

  if (has("fee structure", "fee amount", "kitni fee", "fees kitni"))
    return "fee_structure";

  // "check kro", "se check", "dekhna hai", "verify" with fee context → fee data query, NOT software_help
  if (has("fee") && has("check", "dekhna", "verify", "dekho", "dekh", "se check", "check kro", "check karna"))
    return "fee_summary";

  if (has("fee", "payment", "collection", "jama", "receipt"))
    return "fee_summary";

  /* ──────────────────────────────────────────────────────────────
     3. ATTENDANCE
  ────────────────────────────────────────────────────────────── */
  if (has("attendance", "absent", "present", "hazri", "bunk"))
    return "attendance";

  /* ──────────────────────────────────────────────────────────────
     4. TEACHERS
  ────────────────────────────────────────────────────────────── */
  if (has("teacher", "staff", "faculty", "shikshak", "principal"))
    return "teachers";

  /* ──────────────────────────────────────────────────────────────
     5. STUDENTS
  ────────────────────────────────────────────────────────────── */
  if (has("admission", "naya student", "new student", "aaj admit"))
    return "admissions";

  if (has("left", "tc", "transfer certificate", "gaya student"))
    return "students_left";

  if (has("total", "kitne", "how many", "count") && has("student", "bachcha"))
    return "students";

  if (has("student", "bachcha", "boy", "girl", "ladka", "ladki"))
    return "students";

  /* ──────────────────────────────────────────────────────────────
     6. ACADEMICS
  ────────────────────────────────────────────────────────────── */
  if (has("homework", "home work", "assignment", "ghar ka kaam"))
    return "homework";

  // Exams - but NOT if query is about "who" (that's topper intent)
  if (has("exam", "test", "pariksha") && !has("kaun", "who", "kis"))
    return "exams";

  if (has("subject", "vishay", "syllabus"))
    return "subjects";

  if (has("notice", "circular", "announcement", "suchna", "notification"))
    return "notices";

  if (has("bus", "transport", "route", "driver", "van", "vehicle", "gaadi"))
    return "transport";

  /* ──────────────────────────────────────────────────────────────
     7. CLASSES / SECTIONS  (generic — AFTER topper check)
  ────────────────────────────────────────────────────────────── */
  if (has("class", "section", "grade", "stream", "kaksha") &&
      !has("topper", "top", "first", "rank", "merit", "result", "marks"))
    return "classes";

  /* ──────────────────────────────────────────────────────────────
     8. INDIVIDUAL STUDENT DATA REQUEST
     "XYZ kis class mein hai", "XYZ ka roll number", "XYZ ki detail"
     → dynamic_data (DB mein search karo, hallucinate mat karo)

     ONLY block (no_individual_data) for: phone, address, Aadhaar requests
  ────────────────────────────────────────────────────────────── */

  // Privacy block — personal contact/identity ONLY (phone, Aadhaar, home address)
  // NOT for school records like roll no, class, section, fee, marks, DOB, category
  if (
    has("phone", "mobile") && has("ka", "ki", "ke", "dedo", "do", "batao", "chahiye")
  ) return "no_individual_data";

  if (
    has("aadhaar", "aadhar", "aadhar card", "aadhaar number") &&
    has("ka", "ki", "ke", "dedo", "do", "batao", "chahiye")
  ) return "no_individual_data";

  // Address is privacy-sensitive ONLY when NOT asking school-related context
  if (
    has("address", "ghar ka address", "home address", "ghar ka pata", "pata") &&
    has("ka", "ki", "ke", "dedo", "do", "batao", "chahiye") &&
    !has("class", "school", "fee", "admission", "roll", "result", "marks", "attendance")
  ) return "no_individual_data";

  // Named student info queries → dynamic_data (let DB answer, not AI guess)
  if (has("kis class", "kaunsi class", "which class", "class mein hai",
          "kis section", "kaunse section", "roll number", "roll no",
          "ka detail", "ki detail", "ka record",
          "ka result", "ke marks", "ka roll", "ka dob", "ki dob",
          "ka janam", "ki janam", "ka admission", "ki admission",
          "ki category", "ka category", "ki attendance", "ka transport",
          "ka route", "ki route", "ke father", "ki mother", "ka student id",
          "ki fee", "fee status", "fee baaki", "fee paid", "jama ki",
          "kahan padh", "kab admit", "kab se padh"))
    return "dynamic_data";

  /* ──────────────────────────────────────────────────────────────
     8b. SOFTWARE HELP — how to USE the software (process/steps)
     ALSO catches: general questions about the software itself
     ("software kya hai", "is app ke baare mein", "yeh system kya karta hai")
  ────────────────────────────────────────────────────────────── */
  // General "what is this software / tell me about the system" questions
  if (
    has("software", "system", "portal", "app", "application", "platform") &&
    has("kya hai", "batao", "bata", "baare mein", "bare mein", "kya karta",
        "what is", "about", "tell me", "explain", "samjhao", "introduction",
        "features", "modules", "kya kya", "kaise", "functionality")
  )
    return "software_help";

  // First — block data queries that contain "kaise" but are really asking for numbers
  const isDataQuery = has(
    "kitna", "kitni", "kitne", "total", "count", "kitna aaya", "kitni aayi",
    "pending", "baaki", "due", "collect", "collection", "attendance", "present",
    "absent", "marks", "result", "fee", "fees", "student", "teacher",
    "topper", "pass", "fail", "admission"
  );

  // Only software_help if genuinely asking HOW TO DO something, not data
  if (
    !isDataQuery &&
    has("kaise", "how to", "how do", "kaise kaam", "kaise use", "kaise add",
        "kaise lagaein", "kaise dein", "kaise banate", "kaise karte",
        "samjhao", "explain", "steps", "process", "guide",
        "module", "feature", "functionality", "work karta", "kaam karta") &&
    has("fee", "student", "attendance", "homework", "result", "exam",
        "notice", "transport", "teacher", "staff", "class", "section",
        "admission", "marksheet", "salary", "report", "software", "system",
        "portal", "app", "management")
  )
    return "software_help";

  /* ──────────────────────────────────────────────────────────────
     9. PREDICTION
  ────────────────────────────────────────────────────────────── */
  if (has("predict", "forecast", "future", "next month",
          "next year", "estimate", "projection", "trend"))
    return "prediction";

  return "general";
}

/* ────────────────────────────────────────────────────────────────
   CLASS NAME EXTRACTOR — parse class/grade from user message
   Handles typos, Hindi ordinals, short forms
──────────────────────────────────────────────────────────────── */
export function extractClassName(message) {
  const m = message.toLowerCase()
    .replace(/younurssary|younursary|yunursary|nussary|nursary|nusery|narsary/g, "nursery")
    .replace(/toper/g, "topper")
    .replace(/\bkon\b/g, "kaun");

  // Priority: named special classes first
  const namedMap = {
    "nursery": "Nursery",
    "nur":     "Nursery",
    "lkg":     "LKG",
    "l.k.g":   "LKG",
    "ukg":     "UKG",
    "u.k.g":   "UKG",
    "kg":      "KG",
    "prep":    "Prep",
    "pre-primary": "Pre-Primary",
    "preprimary":  "Pre-Primary",
    "play group":  "Play Group",
    "playgroup":   "Play Group",
  };

  for (const [key, val] of Object.entries(namedMap)) {
    if (m.includes(key)) return val;
  }

  // Ordinal words → digits
  const wordMap = {
    "first":"1","second":"2","third":"3","fourth":"4","fifth":"5",
    "sixth":"6","seventh":"7","eighth":"8","ninth":"9","tenth":"10",
    "eleventh":"11","twelfth":"12",
    "one":"1","two":"2","three":"3","four":"4","five":"5",
    "six":"6","seven":"7","eight":"8","nine":"9","ten":"10",
    "eleven":"11","twelve":"12",
  };
  for (const [word, digit] of Object.entries(wordMap)) {
    if (m.includes(word)) return digit;
  }

  // Ordinal suffixes: 1st, 2nd … 12th
  const ordMatch = m.match(/\b(1[0-2]|[1-9])(st|nd|rd|th)\b/);
  if (ordMatch) return ordMatch[1];

  // Bare digits 1–12
  const digitMatch = m.match(/\bclass\s*(1[0-2]|[1-9])\b|\b(1[0-2]|[1-9])\s*class\b|\b(1[0-2]|[1-9])\b/);
  if (digitMatch) return digitMatch[1] || digitMatch[2] || digitMatch[3];

  return null; // means "all classes"
}


