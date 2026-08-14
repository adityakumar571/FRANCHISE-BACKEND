/* ================================================================
   AI NLU PARSER
   File    : controllers/tenant/ai/aiNluParser.js
   Purpose : Use Mistral AI to parse user intent + params from ANY
             language / typo / variant — returns structured JSON

   OPTIMISATION: In-memory LRU cache so identical/similar messages
   don't hit Mistral API again (saves free-tier quota + cuts latency)
================================================================ */

import axios from "axios";
import { classifyIntent, extractClassName } from "./aiIntentClassifier.js";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

/* ────────────────────────────────────────────────────────────────
   SIMPLE IN-MEMORY LRU CACHE (no Redis dependency)
   TTL: 10 minutes, max 200 entries
──────────────────────────────────────────────────────────────── */
const NLU_CACHE     = new Map()
const NLU_CACHE_TTL = 10 * 60 * 1000   // 10 min
const NLU_CACHE_MAX = 200

function nluCacheGet(key) {
  const entry = NLU_CACHE.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > NLU_CACHE_TTL) { NLU_CACHE.delete(key); return null }
  return entry.value
}

function nluCacheSet(key, value) {
  if (NLU_CACHE.size >= NLU_CACHE_MAX) {
    // evict oldest
    NLU_CACHE.delete(NLU_CACHE.keys().next().value)
  }
  NLU_CACHE.set(key, { ts: Date.now(), value })
}

/* Normalise message for cache key — lowercase, collapse spaces, strip punctuation */
function normKey(msg) {
  return msg.toLowerCase().replace(/[?!.,;:'"]/g, '').replace(/\s+/g, ' ').trim()
}

/* Date-sensitive queries should NOT be cached — they depend on "today" */
function isDateSensitive(msg) {
  const m = msg.toLowerCase();
  return /\baaj\b|\btoday\b|\bkal\b|\byesterday\b|\bparso\b|\bis hafte\b|\bis mahine\b|\bthis week\b|\bthis month\b|\blast week\b|\blast month\b/.test(m)
    || extractTillMonth(msg) !== null;  // "till July" queries are date-specific
}

/* ────────────────────────────────────────────────────────────────
   TILL-MONTH EXTRACTOR
   "pending fee till July" / "July tak kitni pending" / "upto June"
   Handles typos: "jully", "peding", "tk" (tak), "jul", etc.
   Returns uppercase month name like "JULY" or null
──────────────────────────────────────────────────────────────── */
export function extractTillMonth(message) {
  if (!message) return null;
  const m = message.toLowerCase();

  // English full + short, Hindi transliterations — no duplicate keys
  const MONTH_MAP = {
    // English full
    january: "JANUARY", february: "FEBRUARY", march: "MARCH",
    april: "APRIL", may: "MAY", june: "JUNE",
    july: "JULY", august: "AUGUST", september: "SEPTEMBER",
    october: "OCTOBER", november: "NOVEMBER", december: "DECEMBER",
    // English short
    jan: "JANUARY", feb: "FEBRUARY", mar: "MARCH",
    apr: "APRIL", jun: "JUNE", jul: "JULY",
    aug: "AUGUST", sep: "SEPTEMBER", sept: "SEPTEMBER",
    oct: "OCTOBER", nov: "NOVEMBER", dec: "DECEMBER",
    // Hindi transliterations
    janvari: "JANUARY", janwari: "JANUARY",
    farvari: "FEBRUARY", farawari: "FEBRUARY",
    sitambar: "SEPTEMBER",
    disambar: "DECEMBER",
  };

  // Typo map — common misspellings → canonical key that exists in MONTH_MAP
  const TYPO_MAP = {
    jully: "july", julay: "july", julai: "july",
    junne: "june", june: "june",
    jannuary: "january", januray: "january",
    feburary: "february", febuary: "february",
    augest: "august", augast: "august",
    septmber: "september", setember: "september",
    octover: "october", ocober: "october",
    novmber: "november",
    decmber: "december",
    marh: "march", marhc: "march",
    aril: "april", apirl: "april",
  };

  // Normalise "tk" → "tak", "me" → "mein" in message for pattern matching
  const mn = m
    .replace(/\btk\b/g, "tak")
    .replace(/\bme\b/g, "mein")
    .replace(/\bh\b/g, "hai")
    .replace(/peding/g, "pending")
    .replace(/pendin\b/g, "pending");

  // Resolve word: check typo map first, then MONTH_MAP directly
  function resolveMonth(word) {
    const clean = word.toLowerCase().replace(/[^a-z]/g, "");
    if (MONTH_MAP[clean]) return MONTH_MAP[clean];
    if (TYPO_MAP[clean] && MONTH_MAP[TYPO_MAP[clean]]) return MONTH_MAP[TYPO_MAP[clean]];
    return null;
  }

  // Patterns in normalized message
  const patterns = [
    /(?:till|upto|up to|until|through|by)\s+([a-z]+)/i,
    /([a-z]+)\s+(?:tak|me|mein|ki|ka|ke)\b/i,
    /(?:pending|outstanding|due|baaki|baki)\s+(?:fee\s+)?(?:till|upto|until)?\s*([a-z]+)/i,
    /([a-z]+)\s+(?:month|mahine|mahina)\s+(?:tak|till|upto)/i,
  ];

  for (const pattern of patterns) {
    const match = mn.match(pattern);
    if (match?.[1]) {
      const resolved = resolveMonth(match[1]);
      if (resolved) return resolved;
    }
  }

  // Fallback: any month word (incl typos) in message with fee/pending context
  if (/pending|peding|till|tak|tk|upto|outstanding|baaki|baki|due/.test(mn)) {
    const words = mn.split(/\s+/);
    for (const word of words) {
      const resolved = resolveMonth(word);
      if (resolved) return resolved;
    }
  }

  return null;
}

/* ────────────────────────────────────────────────────────────────
   PROMPT INJECTION GUARD
   Detects attempts to hijack the NLU parser via crafted user input.
   Returns true if the message looks like a prompt injection attempt.
──────────────────────────────────────────────────────────────── */
export function detectPromptInjection(message) {
  if (!message || typeof message !== "string") return false;
  const m = message.toLowerCase();

  const INJECTION_PATTERNS = [
    /ignore (all |previous |above |prior )?(instructions?|rules?|system|prompt)/i,
    /you are now/i,
    /act as (a |an )?(?!school|admin|teacher|assistant)/i,
    /forget (all |everything|your |previous )/i,
    /disregard (your |all |the )/i,
    /new (role|persona|instructions?|system)/i,
    /override (your |the |all )/i,
    /system:\s*you/i,
    /\[system\]/i,
    /\{\{.*\}\}/,          // template injection
    /<\|.*\|>/,            // token injection
    /###\s*(instruction|system|input|response)/i,
    /do not follow/i,
    /jailbreak/i,
    /dan mode/i,
    /pretend (you are|to be)/i,
    /roleplay as/i,
    /from now on (you|respond|act|ignore)/i,
  ];

  return INJECTION_PATTERNS.some(p => p.test(m));
}

/* ────────────────────────────────────────────────────────────────
   INPUT SANITIZER — strip dangerous characters for logging/display
──────────────────────────────────────────────────────────────── */
export function sanitizeInput(message) {
  if (!message || typeof message !== "string") return "";
  return message
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")  // control chars
    .replace(/\u200B-\u200D\uFEFF/g, "")                  // zero-width chars
    .slice(0, 1000);                                        // hard cap at 1000 chars
}

/* ────────────────────────────────────────────────────────────────
   QUICK REGEX PRE-CHECK — if regex is confident, skip Mistral call
   Returns intent string or null (null = ask Mistral)
──────────────────────────────────────────────────────────────── */
function quickClassify(message) {
  const intent = classifyIntent(message)
  // Only trust regex for high-confidence, unambiguous intents
  // NOTE: 'notices' is removed — it needs dateRange extraction via Mistral
  //       (e.g. "aaj kinte notice aayi" → dateRange: "today")
  const TRUSTED = new Set([
    'fee_today', 'fee_overview', 'attendance', 'transport', 'homework',
    'classes', 'admissions', 'students_left',
  ])
  if (TRUSTED.has(intent)) return intent
  return null
}

/* ────────────────────────────────────────────────────────────────
   TYPO / COLLOQUIAL NORMALISATION
   "8 class mein kitne school h" → "8 class mein kitne students hain"
   "school" used as shorthand for "students" in Hinglish
──────────────────────────────────────────────────────────────── */
export function normaliseMessage(raw) {
  let m = raw.trim()
  // "kitne school" / "school kitne" near a class reference → replace with "students"
  m = m.replace(/\bkitne\s+school\b/gi, 'kitne students')
  m = m.replace(/\bschool\s+kitne\b/gi, 'students kitne')
  // "class mein kitne school" pattern
  m = m.replace(/\bclass\s*(mein|me|mai|mn)?\s*kitne\s+school\b/gi, (match) =>
    match.replace(/school/i, 'students'))
  return m
}



/* ────────────────────────────────────────────────────────────────
   SYSTEM PROMPT — tells AI exactly what JSON to return
──────────────────────────────────────────────────────────────── */
const NLU_SYSTEM_PROMPT = `You are an NLU (Natural Language Understanding) parser for a School Management System.

Your ONLY job: read the user message and return a JSON object.

AVAILABLE INTENTS:
- fee_today           → Today's fee collection total
- fee_defaulters      → Count of students with pending fees
- fee_defaulters_class → List of students with pending fees (with names), optionally for a specific class
- fee_summary         → Overall fee collection summary for the session
- fee_overview        → Dashboard-style fee summary: expected fees, collected fees, pending fees, collection rate, recovery percentage (till current month)
- fee_structure       → Fee structure / fee heads
- fee_heads           → Fee heads list: what fee heads exist, fee head names, fee head wise amounts, installment breakdown per head
- students            → Total student count, gender breakdown, class-wise
- admissions          → New admissions
- students_left       → Students who left / took TC
- attendance          → Today's attendance (school-wide + class-wise)
- teachers            → Teacher count and breakdown
- classes             → Total classes and sections count
- homework            → Homework due today
- exams               → Exam list
- subjects            → Subject count
- notices             → Recent notices
- transport           → Bus/route/transport info
- topper              → Class topper(s) based on marksheet percentage
- prediction          → Future forecast / trend
- dynamic_data        → User is asking for SPECIFIC data that isn't covered above — class-wise breakdown, month-wise data, filtered lists, comparisons, trends. Use this INSTEAD of "general" when user clearly wants real numbers/data from the system.
- software_help       → User asking HOW TO USE the software, how a module works, steps to do something (e.g. "fee module kaise use karein", "student kaise enroll karein", "attendance module kaise kaam karta hai"). ALSO use software_help when user asks general questions ABOUT the software itself ("software kya hai", "is app ke baare mein batao", "SchoolCloudX kya karta hai", "yeh system kya hai", "features kya hain"). STRICT RULE: Only use software_help when user wants a TUTORIAL/GUIDE/STEPS or wants to KNOW ABOUT the software. If user is asking for ACTUAL DATA ("fee kaise collect hui", "attendance kaise rahi", "kitna collected") → use dynamic_data or appropriate data intent, NOT software_help.
- report_fee_collection → Fee collection report: total collected, transactions, date/class wise summary
- report_fee_mode      → Fee payment mode report: Cash/Online/UPI/Cheque breakdown
- report_fee_head      → Fee head-wise report: tuition/transport/additional fee breakdown per fee head name
- report_fee_outstanding → Class-wise outstanding fee report: total fee, paid, balance per class
- report_defaulters_classwise → Class-section wise defaulter count and amount summary (grouped, no names)
- report_class_section_defaulters → Detailed class+section defaulter table with amounts (defaultersAmt, transport, lateFine, grandTotal) per class-section
- report_fee_defaulters_monthwise → Month-wise pending fee breakdown: each academic month's expected/collected/pending
- report_fee_defaulters_detailed → Period-wise per-student detailed defaulter list showing due months, total due per student. Use when user asks "detailed defaulter list", "har student ki due months", "period wise defaulter"
- report_fee_deposit_classwise → Class-wise total fee deposited (collected amount per class)
- report_fee_deposited_detailed → Receipt-wise payment list showing student name, amount, receipt no, date, mode. Use when user asks "fee receipt list", "payment list", "fee deposited list", "kaun kaun ne fee di"
- report_student_fee_details → Per-student fee details summary for a class (expected/paid/balance)
- report_new_admission_fee → Fee collected from new admissions in a date range
- report_registration_fee → Registration fee statement (enrolled + non-enrolled students). Use when user asks "registration fee statement", "reg fee list", "form fee"
- report_registration_fee_classwise → Class-wise registration fee summary: total reg fee, collected, balance. Use when user asks "registration fee class wise", "class wise reg fee"
- report_inactive_fee_statement → Left/TC/Passed students with their fee summary (totalFee, paid, balance). Use when user asks "left student fee", "TC student fee", "inactive student fee statement", "chale gaye students ki fee"
- report_transport     → Transport students report: bus count, route count, students using transport
- report_transport_route_wise → Route-wise transport fee billing vs collection summary
- report_transport_defaulters → Students with pending transport fee balance
- report_result_analysis → Exam result analysis: class-wise pass%, above 90/80/70% counts
- report_scholarship   → Scholarship/concession report: students with fee concession
- report_students_inactive → Left/TC/inactive students list (names only, no fee). Use for "left students", "TC list", "school chhod dene wale"
- no_individual_data  → User asks for a specific named person's PRIVATE CONTACT details ONLY: phone number, mobile, address, Aadhaar card number, email. E.g. "Rahul ka phone do", "Priya ki address". DO NOT use this for roll number, class, section, fee status, attendance, marks — those are school records, use dynamic_data instead.
- general             → School name/info, greetings, general questions, anything not fitting above

PARAMETERS to extract (only if relevant, else null):
- className: the class name mentioned (e.g. "Nursery", "LKG", "UKG", "1", "2", ... "12", "KG", "Prep"). Normalize typos.
- sectionName: section name if mentioned (e.g. "A", "B")
- dateRange: "today" | "this_week" | "this_month" | "this_session" | null

RULES:
1. Return ONLY valid JSON, no extra text, no markdown.
2. Normalize all typos, Hindi/Urdu/Hinglish spellings.
3. If user asks "who has pending fee" with a class name → fee_defaulters_class
4. If user asks for a "list" of defaulters (names) → fee_defaulters_class (even without a class name)
5. If user asks "how many defaulters" / "kitne defaulters" (only count, no list/names) → fee_defaulters
6. Topper = class topper from marksheet results
7. Be generous with intent matching — school context only.
8. KEY RULE: words like "list", "naam", "dikhao", "do", "batao", "kaun kaun" with "defaulter" → fee_defaulters_class
   EXCEPTION: if the query contains "class.*section", "class-section", "classwise.*section", "section.*wise.*class" or "class.*wise.*defaulter.*list" → use report_class_section_defaulters instead (this gives amounts per class-section row, not individual names)
9. software_help: ONLY if user asks HOW TO USE a feature/module — wants a tutorial, steps, or guide. Keywords: "kaise use karein", "kaise add karein", "steps batao", "samjhao", "how to use", "process kya hai".
   CRITICAL — these are NOT software_help, they are data queries:
   - "fee kitni collect hui" → fee_summary
   - "fee collection se check kro" → fee_summary  ← "check kro" = wants DATA not steps
   - "fee collection check karna" → fee_summary
   - "attendance kaise rahi" → attendance
   - "fee kaise check karein class 5" → dynamic_data (wants data)
   - "pending fees kaise dekhein" → dynamic_data (wants data)
   - "kitna collected hua" → fee_summary
   - "fee status check karo" → fee_summary
   - "student ki fee check karo" → dynamic_data
   RULE: If "check", "dekhna", "verify", "dekho" appears with fee/attendance/student → it's a DATA query.
   If user asks "kaise" WITH a number/amount/count question → data intent, not software_help.
10. report_* intents: if user asks for a "report", "summary", "kitna", "breakdown" about a specific area → map to appropriate report intent
11. report_fee_collection: "fee collection report", "kitni fee aayi", "fee summary report", "collection report"
12. report_fee_mode: "payment mode report", "cash kitna aayi", "online payment kitna", "UPI kitna"
13. report_fee_head: "fee head report", "tuition kitna collect hua", "fee head wise"
14. fee_heads: "fee head kya hain", "fee heads dikhao", "fee structure mein kya kya hai", "kaunsi kaunsi fees hain", "fee heads ki list", "Tuition fee kitni hai", "Lab fee hai kya", "fee head information", "fee head batao", "fee heads", "fee ka structure". IMPORTANT: fee_heads = what fee heads EXIST / their amounts. fee_structure = same. Use fee_heads when user wants to SEE the fee heads/names/amounts.
15. fee_overview: "expected fee kitni hai", "collected fee kitni", "pending fee kitni", "fee recovery kitni hai", "fee collection rate", "fee ka overview do", "fee summary dashboard", "expected collected pending batao", "kitni fee expected thi", "kitni fee aayi kitni baki", "collection rate kya hai". Use fee_overview when user wants the EXPECTED vs COLLECTED vs PENDING dashboard view.
14. report_fee_outstanding: "outstanding report", "class wise balance", "fee baaki report class wise"
15. report_defaulters_classwise: "class wise defaulters", "section wise defaulters", "defaulter summary class"
16. report_class_section_defaulters → PRIORITY RULE: if user asks "class section wise defaulter list", "class-sectionwise defaulter", "class wise defaulter list", "section wise defaulter list", "class aur section defaulter", "class section defaulter" — ALWAYS use report_class_section_defaulters. This shows a TABLE with amounts (defaultersAmt, transport, lateFine, grandTotal) per class-section. Do NOT use fee_defaulters_class for these queries.
16. report_transport: "transport report", "bus report", "route wise students"
17. report_result_analysis: "result analysis", "pass percentage", "class performance report", "kitne pass hue"
18. report_scholarship: "scholarship report", "concession report", "discount wale students"
19. report_students_inactive: "left students", "TC students", "school chhod dene wale" — names/list only (no fee details)
    report_inactive_fee_statement: "left student ki fee", "TC student fee kitni baki", "chale gaye students ka fee statement", "inactive student fee" — includes fee amounts
20. report_fee_defaulters_detailed: "detailed defaulter list", "period wise defaulter", "har student ki due months", "defaulter detail report", "month wise student defaulter"
21. report_fee_deposited_detailed: "fee receipt list", "kaun kaun ne fee di", "fee deposited list", "payment receipt", "fee jama list", "fee deposit detail"
22. report_registration_fee: "registration fee statement", "reg fee list", "form fee list", "registration fee record"
    report_registration_fee_classwise: "registration fee class wise", "class wise reg fee", "class wise form fee summary"
23. CRITICAL — no_individual_data ONLY for PRIVATE CONTACT/IDENTITY info:
    USE no_individual_data: "Rahul ka phone do", "Priya ki address", "student XYZ ka Aadhaar" — phone number, mobile, home address, Aadhaar card, email ID.
    NEVER use no_individual_data for school records — use dynamic_data:
    ✅ dynamic_data: roll number, class, section, fee status, fee amount, attendance, marks, result, admission date, DOB, category, religion, caste, father name, mother name, guardian, transport, route, stop, student ID, SR number, house, medium, concession, gender
    "School ka naam", "principal kaun hai", general questions → general.

24. NAMED STUDENT INFO — when user mentions a STUDENT NAME + school-related info → ALWAYS dynamic_data:
    "Rahul ka roll number" → dynamic_data
    "Amrita kis class mein hai" → dynamic_data
    "Priya ki attendance" → dynamic_data
    "Rohan ka result" → dynamic_data
    "Sneha kahan padhti hai" → dynamic_data
    "Amit ke marks" → dynamic_data
    "Rahul ki fee baaki" → dynamic_data
    "Priya ki admission date" → dynamic_data
    "Mohit ka DOB" → dynamic_data
    "Kavya ki category" → dynamic_data
    "Sanjay ka transport route" → dynamic_data
    "Neha ke father ka naam" → dynamic_data
    "Vikram ki section" → dynamic_data
    "Deepak ka student ID" → dynamic_data
    "Arjun kab admit hua" → dynamic_data
    KEY RULE: Person's name + school record = dynamic_data. Person's name + phone/Aadhaar/address = no_individual_data.

25. HINGLISH TYPO RULE — "school" is sometimes used as shorthand for "students" in Hinglish:
    - "8 class mein kitne school h" → intent: students, className: "8"
    - "class 5 mein kitne school hain" → intent: students, className: "5"
    - Whenever "school" appears after "kitne" or near a class number, treat it as "students"
    - This is a VERY common Hinglish typing shortcut

26. dynamic_data: if user asks for ANY data/numbers/lists/comparisons that don't map to the specific intents above.
    Use dynamic_data for questions like:
    - "is mahine kitne new admissions hue?"
    - "class 5 section B mein absent students kaun hain aaj?"
    - "kaunsi class mein sabse zyada absent students hain?"
    - "pichle hafte ki fee collection kitni rahi?"
    - "October mein kitni fee aayi?"
    - "kitne students ne CASH se fee di?"
    - "kitne teachers female hain?"
    - "class 3 mein kitne students hain?"
    - "is session mein sabse zyada fee wali class kaunsi hai?"
    - "kaunse students ki attendance 75% se kam hai?"
    - "class 10 mein pass percentage kya raha?"
    - "Sunday ko kitne absent the?"
    - "aaj kaunsi class ki attendance nahi hui?"
    - "class 8 section A mein kitni girls hain?"
    - "pichle mahine kitne students ne admission liya?"
    KEY: When the question needs FILTERED, COMPARED, MONTH-WISE, SECTION-WISE, or CUSTOM data → dynamic_data

OUTPUT FORMAT (always exactly this):
{"intent":"<intent>","className":<"ClassName" or null>,"sectionName":<"A" or null>,"dateRange":<"today"|"this_session"|null>}

EXAMPLES:
User: "Younurssary mein kon kon se student ka fee baki h"
→ {"intent":"fee_defaulters_class","className":"Nursery","sectionName":null,"dateRange":null}

User: "aaj ki fee kitni aayi"
→ {"intent":"fee_today","className":null,"sectionName":null,"dateRange":"today"}

User: "class 10 ka toper kon h"
→ {"intent":"topper","className":"10","sectionName":null,"dateRange":null}

User: "nussary class ka topper batao"
→ {"intent":"topper","className":"Nursery","sectionName":null,"dateRange":null}

User: "total students kitne hain"
→ {"intent":"students","className":null,"sectionName":null,"dateRange":null}

User: "Nursery mein kitne students hain"
→ {"intent":"students","className":"Nursery","sectionName":null,"dateRange":null}

User: "Younursary mein kitne student h"
→ {"intent":"students","className":"Nursery","sectionName":null,"dateRange":null}

User: "class 5 mein kitne bachche hain"
→ {"intent":"students","className":"5","sectionName":null,"dateRange":null}

User: "LKG mein kitni girls hain"
→ {"intent":"students","className":"LKG","sectionName":null,"dateRange":null}

User: "kitne defaulters hain"
→ {"intent":"fee_defaulters","className":null,"sectionName":null,"dateRange":null}

User: "defaulter list do"
→ {"intent":"fee_defaulters_class","className":null,"sectionName":null,"dateRange":null}

User: "defaulters ki list dikhao"
→ {"intent":"fee_defaulters_class","className":null,"sectionName":null,"dateRange":null}

User: "defaulter students batao"
→ {"intent":"fee_defaulters_class","className":null,"sectionName":null,"dateRange":null}

User: "fee defaulters kaun kaun hain"
→ {"intent":"fee_defaulters_class","className":null,"sectionName":null,"dateRange":null}

User: "5vi class mein fee pending kaun hai"
→ {"intent":"fee_defaulters_class","className":"5","sectionName":null,"dateRange":null}

User: "fee management kaise kaam karta hai"
→ {"intent":"software_help","className":null,"sectionName":null,"dateRange":null}

User: "student kaise add karein"
→ {"intent":"software_help","className":null,"sectionName":null,"dateRange":null}

User: "attendance kaise lagaate hain"
→ {"intent":"software_help","className":null,"sectionName":null,"dateRange":null}

User: "result kaise publish karein"
→ {"intent":"software_help","className":null,"sectionName":null,"dateRange":null}

User: "homework module kaise use karein"
→ {"intent":"software_help","className":null,"sectionName":null,"dateRange":null}

User: "fee structure kaise banate hain"
→ {"intent":"software_help","className":null,"sectionName":null,"dateRange":null}

User: "is software ke bare mein batao"
→ {"intent":"software_help","className":null,"sectionName":null,"dateRange":null}

User: "SchoolCloudX kya hai"
→ {"intent":"software_help","className":null,"sectionName":null,"dateRange":null}

User: "yeh system kya karta hai"
→ {"intent":"software_help","className":null,"sectionName":null,"dateRange":null}

User: "app ke features kya hain"
→ {"intent":"software_help","className":null,"sectionName":null,"dateRange":null}

User: "is portal mein kya kya hota hai"
→ {"intent":"software_help","className":null,"sectionName":null,"dateRange":null}

User: "fee kaise collect hui class 5 mein"
→ {"intent":"dynamic_data","className":"5","sectionName":null,"dateRange":null}

User: "LKG mein pending fees kaise check karein"
→ {"intent":"fee_overview","className":"LKG","sectionName":null,"dateRange":null}

User: "attendance kaise rahi aaj"
→ {"intent":"attendance","className":null,"sectionName":null,"dateRange":"today"}

User: "is mahine kitna fee collect hua"
→ {"intent":"fee_summary","className":null,"sectionName":null,"dateRange":"this_month"}

User: "fee collection report do"
→ {"intent":"report_fee_collection","className":null,"sectionName":null,"dateRange":null}

User: "expected fee kitni hai"
→ {"intent":"fee_overview","className":null,"sectionName":null,"dateRange":null}

User: "collected aur pending fee kitni hai"
→ {"intent":"fee_overview","className":null,"sectionName":null,"dateRange":null}

User: "fee recovery kitni hai"
→ {"intent":"fee_overview","className":null,"sectionName":null,"dateRange":null}

User: "collection rate kya hai"
→ {"intent":"fee_overview","className":null,"sectionName":null,"dateRange":null}

User: "kitni fee aayi kitni baki hai"
→ {"intent":"fee_overview","className":null,"sectionName":null,"dateRange":null}

User: "fee head kya hain"
→ {"intent":"fee_heads","className":null,"sectionName":null,"dateRange":null}

User: "fee heads dikhao"
→ {"intent":"fee_heads","className":null,"sectionName":null,"dateRange":null}

User: "fee head ki information do"
→ {"intent":"fee_heads","className":null,"sectionName":null,"dateRange":null}

User: "kaunsi kaunsi fees hain"
→ {"intent":"fee_heads","className":null,"sectionName":null,"dateRange":null}

User: "fee structure mein kya kya hai"
→ {"intent":"fee_heads","className":null,"sectionName":null,"dateRange":null}

User: "class 5 ki fee heads batao"
→ {"intent":"fee_heads","className":"5","sectionName":null,"dateRange":null}

User: "Tuition fee kitni hai"
→ {"intent":"fee_heads","className":null,"sectionName":null,"dateRange":null}

User: "payment mode wise kitna collection hua"
→ {"intent":"report_fee_mode","className":null,"sectionName":null,"dateRange":null}

User: "class wise outstanding report"
→ {"intent":"report_fee_outstanding","className":null,"sectionName":null,"dateRange":null}

User: "class section wise defaulters kitne hain"
→ {"intent":"report_defaulters_classwise","className":null,"sectionName":null,"dateRange":null}

User: "transport report dikhao"
→ {"intent":"report_transport","className":null,"sectionName":null,"dateRange":null}

User: "result analysis report"
→ {"intent":"report_result_analysis","className":null,"sectionName":null,"dateRange":null}

User: "scholarship wale students kitne hain"
→ {"intent":"report_scholarship","className":null,"sectionName":null,"dateRange":null}

User: "left students list"
→ {"intent":"report_students_inactive","className":null,"sectionName":null,"dateRange":null}

User: "is mahine kitne new admissions hue"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":"this_month"}

User: "kaunsi class mein sabse zyada absent students hain aaj"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":"today"}

User: "class 5 section B mein kitni girls hain"
→ {"intent":"dynamic_data","className":"5","sectionName":"B","dateRange":null}

User: "pichle hafte kitni fee aayi"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":"this_week"}

User: "cash se kitni fee collect hui is session mein"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":"this_session"}

User: "kitne female teachers hain"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "aaj kaunsi class ki attendance nahi bhari"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":"today"}

User: "class 10 ka pass percentage kya raha"
→ {"intent":"dynamic_data","className":"10","sectionName":null,"dateRange":null}

User: "school ka naam kya hai"
→ {"intent":"general","className":null,"sectionName":null,"dateRange":null}

User: "hamara school kaunsa hai"
→ {"intent":"general","className":null,"sectionName":null,"dateRange":null}

User: "Rahul ka phone number do"
→ {"intent":"no_individual_data","className":null,"sectionName":null,"dateRange":null}

User: "Priya Singh ki address kya hai"
→ {"intent":"no_individual_data","className":null,"sectionName":null,"dateRange":null}

User: "Rahul Kumar ka roll number batao"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Amrita kis class mein hai"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Rohit ki fee status kya hai"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Sneha ka result kya raha"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Rohan ki attendance kaisi hai"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Pooja kahan padhti hai"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Arjun ka section kya hai"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Deepak ki admission date kya thi"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Kavya ka DOB kya hai"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Sanjay ka transport route batao"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Neha ke father ka naam kya hai"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Vikram ki category kya hai"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Priya ne kitni fee jama ki"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Rahul kab admit hua tha"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Amit ke marks kya hain"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Sunita ka student ID kya hai"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Mohit ki fee baaki hai kya"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}

User: "Riya ke baare mein sab batao"
→ {"intent":"dynamic_data","className":null,"sectionName":null,"dateRange":null}`;

/* ────────────────────────────────────────────────────────────────
   PARSE USER MESSAGE → structured intent + params
──────────────────────────────────────────────────────────────── */
export async function parseUserIntent(message) {
  // Extract the actual user question for caching (strip prepended context)
  const actualMsg = message.includes("Current question:") 
    ? message.split("Current question:").pop().trim()
    : message;

  // 0. Prompt injection guard — reject silently, return safe fallback
  if (detectPromptInjection(actualMsg)) {
    console.warn(`[NLU] Prompt injection detected: "${actualMsg.slice(0, 80)}"`);
    return {
      intent:      "general",
      className:   null,
      sectionName: null,
      dateRange:   null,
      source:      "injection_blocked",
      injectionDetected: true,
    };
  }

  // 1. Quick regex pre-check — saves Mistral call for common patterns
  const quickIntent = quickClassify(actualMsg)
  if (quickIntent) {
    return {
      intent:      quickIntent,
      className:   extractClassName(actualMsg),
      sectionName: null,
      dateRange:   null,
      tillMonth:   extractTillMonth(actualMsg) || null,
      source:      "regex_fast",
    }
  }

  // 2. Cache check — same question asked before? (use actualMsg, not full context)
  // Skip cache for date-sensitive queries — "aaj", "kal", "this week" etc change daily
  const cacheKey      = normKey(actualMsg)
  const dateSensitive = isDateSensitive(actualMsg)
  const cached        = dateSensitive ? null : nluCacheGet(cacheKey)
  if (cached) {
    console.log(`[NLU] cache hit: "${message.slice(0, 40)}"`)
    return { ...cached, source: "cache" }
  }

  // 3. Fallback if no API key
  if (!MISTRAL_API_KEY) {
    return { intent: "general", className: null, sectionName: null, dateRange: null, source: "fallback" };
  }

  try {
    const response = await axios.post(
      MISTRAL_API_URL,
      {
        model:       "mistral-large-latest",
        messages: [
          { role: "system",  content: NLU_SYSTEM_PROMPT },
          { role: "user",    content: message },
        ],
        temperature: 0.0,    // deterministic
        max_tokens:  80,      // small — just JSON
        response_format: { type: "json_object" },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${MISTRAL_API_KEY}`,
        },
        timeout: 8000,        // fast — if slow, fallback
      }
    );

    const raw    = response.data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    const result = {
      intent:      parsed.intent      || "general",
      className:   parsed.className   || null,
      sectionName: parsed.sectionName || null,
      dateRange:   parsed.dateRange   || null,
      tillMonth:   extractTillMonth(actualMsg) || null,
      source:      "ai_nlu",
    }

    // Cache the result (skip for date-sensitive queries — they change daily)
    if (!dateSensitive) nluCacheSet(cacheKey, result)

    return result;

  } catch (err) {
    console.warn("⚠️  NLU parse failed, using regex fallback:", err.message);
    const result = {
      intent:      classifyIntent(message),
      className:   extractClassName(message),
      sectionName: null,
      dateRange:   null,
      tillMonth:   extractTillMonth(actualMsg) || null,
      source:      "regex_fallback",
    }
    // Cache regex fallback too (skip for date-sensitive queries)
    if (!dateSensitive) nluCacheSet(cacheKey, result)
    return result
  }
}
