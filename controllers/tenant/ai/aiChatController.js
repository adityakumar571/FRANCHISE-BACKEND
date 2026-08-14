/* ════════════════════════════════════════════════════════════════
   AI CHAT CONTROLLER  v7
   File : controllers/tenant/ai/aiChatController.js

   Flow:
   ┌─────────────────────────────────────────────────────────────┐
   │  User message → Injection check → Input sanitize           │
   │      ↓                                                      │
   │  NLU Parser  → intent                                       │
   │      ↓                                                      │
   │  PATH 1 : DB_INTENTS  → DB fetch → AI formats reply        │
   │  PATH 2 : software_help → documentation AI                 │
   │  PATH 2.5 : student name → DB fetch → AI formats reply     │
   │  PATH 2.6 : teacher name → DB fetch → AI formats reply     │
   │  PATH 3 : dynamic_data  → AI generates pipeline + answer   │
   │  PATH 4 : general/other → conversational AI                │
   └─────────────────────────────────────────────────────────────┘

   ALL replies come from Mistral — no static/hardcoded responses.
════════════════════════════════════════════════════════════════ */

import { asyncHandler }                     from "../../../utils/asyncHandler.js";
import { apiResponse }                      from "../../../utils/apiResponse.js";
import { apiError }                         from "../../../utils/apiError.js";
import { parseUserIntent, detectPromptInjection, sanitizeInput } from "./aiNluParser.js";
import { executeQuery, queryStudentByName, queryTeacherByName } from "./queries/aiQueryExecutor.js";

/* ────────────────────────────────────────────────────────────────
   NAVIGATION PARSER
   Converts {{nav: /route | Label | Hint}} tags in AI reply
   into a structured navigationSteps array for the frontend
──────────────────────────────────────────────────────────────── */
function parseNavigationSteps(reply) {
  const NAV_REGEX = /\{\{nav:\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^}]+)\}\}/g;
  const steps = [];
  let match;
  while ((match = NAV_REGEX.exec(reply)) !== null) {
    steps.push({
      label: match[2].trim(),
      hint:  match[3].trim(),
    });
  }
  // Clean the raw tags from the reply text
  const cleanReply = reply.replace(NAV_REGEX, (_, _route, label) =>
    `**${label.trim()}**`
  );
  return { cleanReply, navigationSteps: steps };
}
import { callMistral, isRateLimitError }    from "./aiMistralService.js";
import { SOFTWARE_HELP_SYSTEM_PROMPT }      from "./aiSoftwarePrompt.js";
import { generateAndExecuteDynamicQuery }   from "./dynamic/aiDynamicQueryEngine.js";

/* ────────────────────────────────────────────────────────────────
   LANGUAGE DETECTOR
──────────────────────────────────────────────────────────────── */
function detectLanguage(text) {
  if (/[\u0900-\u097F]/.test(text)) return "hindi";
  if (/\b(kya|kitne|kaun|kaise|aaj|hai|hain|mein|ka|ki|ke|se|ko|bhi|nahi|karo|do|batao|dikhao|list|kitni|aur|ya|toh|tha|hoga|chahiye|school|naam|teacher|student|fee|attendance)\b/i.test(text)) return "hinglish";
  return "english";
}

/* ────────────────────────────────────────────────────────────────
   STUDENT NAME EXTRACTOR
──────────────────────────────────────────────────────────────── */
function extractStudentName(message) {
  // Pre-process: strip student ID in parentheses like "(STD011)" so name extraction works
  // "Aashu Mishra (STD011) ka payment status" → "Aashu Mishra ka payment status"
  // "Aashu Mishra (STD011) - Mishra kya fee status h" → "Aashu Mishra kya fee status h"
  const cleaned = message
    .replace(/\([A-Z]{1,5}\d{2,}\)/gi, "")   // remove (STD011), (S001), (STU123) etc.
    .replace(/\bSTD\d+\b/gi, "")              // remove STD011 without parens
    .replace(/\bSTU\d+\b/gi, "")              // remove STU011
    // Strip app-generated " - LastName" suffix after ID removal (e.g. "Aashu Mishra  - Mishra kya fee")
    // Pattern: " - <word>" where the word is a capitalized name fragment before a keyword
    .replace(/\s*-\s*[A-Z][a-z]+\s+(?=kya|ka|ki|ke|k\s|ne|ko|se|mein|fee|status|h\b)/i, " ")
    .replace(/\s{2,}/g, " ")                  // collapse extra spaces
    .trim();

  const m = cleaned.trim();
  // Word boundary pattern for a name: 2+ letters, 1-3 words
  const NAME = "([a-zA-Z][a-zA-Z]+(?:\\s+[a-zA-Z][a-zA-Z]+){0,2})";

  const patterns = [
    // "Amrita ka fee/roll/class/section/detail/attendance/marks/result/address/admission/dob/category"
    new RegExp(`^${NAME}\\s+(?:ka|ki|ke|k|kya)\\s+(?:roll|fee|fees|class|section|detail|attendance|marks|result|status|info|registration|payment|paid|jama|pending|address|admission|dob|category|gender|father|mother|contact|phone|mobile|naam|name|profile|record|transport|route|subject|exam|percentage|grade|baaki|baki|outstanding|concession|discount|sibling)`, "i"),
    // "Amrita ne ab tk kitni fee", "Amrita ne fee jama ki"
    new RegExp(`^${NAME}\\s+ne\\s+`, "i"),
    // "Amrita ki fees kya hai", "Amrita ka result kya raha" — 2 words after ka/ki/ke
    new RegExp(`^${NAME}\\s+(?:ki|ka|ke)\\s+\\S+(?:\\s+\\S+)?\\s*(?:kya|hai|h|batao|do|dikhao|dena|chahiye|bata|tha|thi|the|raha|rahi|hai|hain)?\\s*$`, "i"),
    // "Amrita Srivastva ka registration fee"
    new RegExp(`^${NAME}\\s+(?:kis|kaunsi|which|kahan|kaunse)`, "i"),
    // "find/search/dhundo Amrita"
    new RegExp(`(?:find|search|dhundo|nikalo|batao|dikhao)\\s+(?:student\\s+)?${NAME}`, "i"),
    // "Amrita detail / profile / record"
    new RegExp(`^${NAME}\\s+(?:ki|ka|ke)?\\s*(?:detail|info|profile|record|baare|bare|puri|complete|full)`, "i"),
    // "student Amrita", "student named Amrita"
    new RegExp(`student\\s+(?:named?\\s+)?${NAME}`, "i"),
    // "Amrita kahan padhti hai", "Amrita kahan hai"
    new RegExp(`^${NAME}\\s+(?:kahan|kaha|kahaan)\\s*(?:hai|h|padhta|padhti|padh|study|studying)?`, "i"),
    // "Amrita Srivastva ke baare mein"
    new RegExp(`^${NAME}\\s+ke\\s+baare`, "i"),
    // "Amrita kis class mein hai", "Amrita kaunsi class mein padhti hai"
    new RegExp(`^${NAME}\\s+(?:kis|kaunsi|kaunse|which|konsi|konse)\\s+(?:class|section|school|grade|stream)`, "i"),
    // "Amrita ka roll number batao", "Rahul ka roll no kya hai"
    new RegExp(`^${NAME}\\s+ka\\s+roll`, "i"),
    // "Amrita kab aayi thi", "Amrita kab se padh rahi hai"
    new RegExp(`^${NAME}\\s+kab\\s+`, "i"),
    // "Amrita ko class 5 mein admit kab kiya"
    new RegExp(`^${NAME}\\s+ko\\s+`, "i"),
    // "Amrita se related info", "Amrita ke baare mein sab batao"
    new RegExp(`^${NAME}\\s+(?:se|related|ke|ki|ka)\\s+`, "i"),
    // Fallback: name at start + any hindi connector word
    new RegExp(`^${NAME}\\s+(?:ka|ki|ke|ne|ko|se|mein|k)\\b`, "i"),
    // "Aashu Mishra kya fee status h" — name followed by kya + topic
    new RegExp(`^${NAME}\\s+kya\\s+(?:fee|fees|attendance|marks|result|transport|roll|payment|status)`, "i"),
    // "mujhe Amrita ki info chahiye", "mujhe Amrita ka detail batao"
    new RegExp(`(?:mujhe|please|pls)\\s+${NAME}\\s+(?:ka|ki|ke|k|ki|info|detail|batao)`, "i"),
  ];

  // Words that are definitely NOT student names
  const KEYWORDS = /^(aaj|today|class|section|fee|fees|attendance|student|students|teacher|teachers|school|kis|kya|kaun|total|kitne|kitni|kitna|all|sabhi|kahan|kaha|hai|hain|mein|ka|ki|ke|se|ko|ne|aur|ya|toh|tha|ab|tk|tak|jama|paid|pending|last|latest|recent|pehla|aakhri|sabse|registration|payment|collection|roll|number|result|marks|admission|report|list|naam|name|detail|info|profile|record|baare|bare|kis|kaunsi|kaunse|which|kab|kaise|kyun|kyu|kyunki|agar|toh|sirf|bas|only|please|pls|mujhe|muje|mujhe|batao|bataiye|dikhao|dikhaiye|do|dena|chahiye|karo|karein|bata|lao|nikalo|dhundo|search|find|hota|hoti|hote|hain|hai|h|raha|rahi|the|thi|tha|padhta|padhti|padh|study|studying)$/i;

  for (const re of patterns) {
    const match = m.match(re);
    if (match?.[1]) {
      const name = match[1].trim();
      const words = name.split(/\s+/);
      // Reject if all words are common keywords
      if (words.every(w => KEYWORDS.test(w))) continue;
      if (KEYWORDS.test(name)) continue;
      // Reject single very short words (likely not a name)
      if (words.length === 1 && name.length < 3) continue;
      // Reject if starts with a number
      if (/^\d/.test(name)) continue;
      return name;
    }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────
   TEACHER NAME EXTRACTOR
──────────────────────────────────────────────────────────────── */
function extractTeacherName(message) {
  const m = message.trim();
  const NAME = "([a-zA-Z][a-zA-Z]+(?:\\s+[a-zA-Z][a-zA-Z]+){0,2})";

  const patterns = [
    // "Amit sir kon hai", "Priya ma'am kaun hai"
    new RegExp(`^${NAME}\\s+(?:sir|mam|ma'?am|madam|teacher)`, "i"),
    // "sir Amit", "teacher Priya"
    new RegExp(`(?:sir|mam|ma'?am|madam|teacher)\\s+${NAME}`, "i"),
    // "Amit sir ka class", "Priya ma'am ki detail"
    new RegExp(`^${NAME}\\s+(?:sir|mam|ma'?am|madam)\\s+(?:ka|ki|ke|k|kon|kaun|kya|kahan|kaunsa|kaunse|kaunsi)`, "i"),
    // "Amit sir ke baare mein"
    new RegExp(`^${NAME}\\s+(?:sir|mam|ma'?am|madam)\\s+ke\\s+baare`, "i"),
    // "teacher Amit ki information", "teacher Priya kaun hai"
    new RegExp(`teacher\\s+${NAME}`, "i"),
    // "Amit sir detail", "Priya mam profile"
    new RegExp(`^${NAME}\\s+(?:sir|mam|ma'?am|madam)\\s+(?:detail|profile|info|kaun|kon|kya|class|subject)`, "i"),
  ];

  const KEYWORDS = /^(aaj|class|section|fee|student|teacher|school|kya|kaun|total|kitne|kitni|kitna|hai|hain|mein|ka|ki|ke|se|ko|ne|aur|ya|toh|sir|mam|madam)$/i;

  for (const re of patterns) {
    const match = m.match(re);
    if (match?.[1]) {
      const name  = match[1].trim();
      const words = name.split(/\s+/);
      if (words.every(w => KEYWORDS.test(w))) continue;
      if (KEYWORDS.test(name)) continue;
      if (words.length === 1 && name.length < 3) continue;
      return name;
    }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────
   LANGUAGE INSTRUCTION HELPER
──────────────────────────────────────────────────────────────── */
function langInstruction(lang) {
  if (lang === "english") return `Reply in natural, direct English — like a sharp school admin typing in Slack.
Short sentences. Lead with the key number or fact. No filler.
✅ "Class 5 has 42 students — 23 boys, 19 girls."
❌ "Based on the database, Class 5 currently has a total of 42 enrolled students."`;

  return `Hinglish mein jawab do — Hindi + English ka natural mix, jaise ek experienced school admin WhatsApp pe type karta hai.
Short, direct, Roman script only.
✅ "Class 5 mein 42 students hain — 23 boys, 19 girls."
✅ "Aaj ₹18,500 collect hua. 7 transactions."
❌ "Database ke anusaar aaj ki fee collection ₹18,500 hai jisme 7 transactions shamil hain."`;
}

/* ────────────────────────────────────────────────────────────────
   SCENARIO TONE GUIDE
──────────────────────────────────────────────────────────────── */
function scenarioTone(scenario, lang) {
  const hi = lang !== "english";
  const tones = {
    greeting: hi
      ? `Warm intro — apna naam batao, 2-3 capabilities mention karo, 2 example questions suggest karo. Ek emoji theek hai. Formal mat bano.
Example start: "Main SchoolCloudX AI hoon — aapke school ka built-in assistant 👋 Mujhse fee, attendance, students, reports — sab pooch sakte hain."`
      : `Warm intro — name yourself, 2-3 capabilities, 2 example questions. One emoji fine.
Example start: "Hi! I'm SchoolCloudX AI — your school's built-in assistant 👋 Ask me anything about fees, attendance, students, or reports."`,

    student_profile: hi
      ? `Caring tone — jaise koi class teacher parent ko update de raha ho. Har section clearly dikhao. Fee clear hai → "Clear ✅". Fee pending hai → "⚠️ Pending ₹X". Attendance % ke saath label do.`
      : `Caring, like a teacher updating a parent. Show each section clearly. Fee clear → "Clear ✅". Fee pending → "⚠️ Pending ₹X". Label attendance %.`,

    fee_summary: hi
      ? `Business-like, direct. Expected → Received → Pending order. Collection rate bold. Indian ₹. Concession already applied hai — dobara calculate mat karo.`
      : `Business-like, direct. Show Expected → Received → Pending. Bold collection rate. Indian ₹. Concession is pre-applied — do not recalculate.`,

    data_found: hi
      ? `Direct — key number pehle, bold. Context sirf tab jab genuinely helpful ho. Padding nahi.`
      : `Direct — key number first, bold. Context only if it genuinely helps. No padding.`,

    empty_result: hi
      ? `Ek line: "Koi [X] record nahi mila." Brief reason agar obvious ho. Bas itna. Kabhi [] ya null mat dikhao.`
      : `One line: "No [X] records found." Brief reason if obvious. That's it. Never show [] or null.`,
  };
  return tones[scenario] || tones.data_found;
}

/* ────────────────────────────────────────────────────────────────
   SHARED RESPONSE RULES
──────────────────────────────────────────────────────────────── */
const RESPONSE_RULES = `
## Identity
You are SchoolCloudX AI — the built-in school assistant. Sound like a sharp, experienced school admin who types fast on WhatsApp. You know the data, you don't fuss around.

## Format rules
- Length: exactly what the question needs. Count query = 1-2 lines. Report = bullets/table.
- Numbers: Indian format ALWAYS — ₹1,20,000 not ₹120000. Percentages as whole number — "87%" not "87.32%"
- Bold: the single most important number or name per answer
- Emojis: 0-1 per full response. ✅ for cleared/good, ⚠️ for warning only.
- Lists: only when 3+ parallel items. 2 items = prose.
- Dates: DD-MM-YYYY always
- 10+ items: one summary line first, then the list
- 50-record cap hit: end with _(full list — Reports section dekhein)_

## Banned phrases (never use these)
"Database mein", "Record show ho raha hai", "As per data", "As per the records",
"Sure!", "Of course!", "Certainly!", "Great question!", "I'd be happy to",
"I don't have access", "I cannot", "Based on the database"

## Accuracy (hard rule)
- ONLY state what is in the Data section — zero fabrication, zero guessing
- FEE VALUES: Every fee number (grossFee, netPayable, totalPaid, pendingFee, concession) is pre-calculated and final. Copy each field value DIRECTLY. NEVER compute fee values yourself — not even simple addition or subtraction. If data says grossFee=22500, show ₹22,500. Period.
- Concession/waiver already applied — do NOT add or subtract anything yourself
- Empty data → "Koi record nahi mila" — naturally, once, no [] or null
- Raw technical fields → skip entirely: _id, ObjectId, sessionId, classId, __v, bsontype`;

/* ────────────────────────────────────────────────────────────────
   FOLLOW-UP SUGGESTIONS PARSER
   Extracts FOLLOWUP: lines from AI replies and strips them
──────────────────────────────────────────────────────────────── */
function parseFollowUpFromReply(rawReply) {
  if (!rawReply) return { cleanReply: rawReply || "", followUpSuggestions: [] };
  const followUpMatch = rawReply.match(/\nFOLLOWUP:\s*(.+)$/m);
  if (!followUpMatch) return { cleanReply: rawReply.trim(), followUpSuggestions: [] };

  const suggestions = followUpMatch[1]
    .split("|")
    .map(s => s.trim())
    .filter(s => s.length > 2 && s.length < 80)
    .slice(0, 3);

  const cleanReply = rawReply.replace(/\nFOLLOWUP:.*$/m, "").trim();
  return { cleanReply, followUpSuggestions: suggestions };
}

/* ────────────────────────────────────────────────────────────────
   AI FORMAT REPLY
   Takes raw DB data + original question → Mistral formats the reply
──────────────────────────────────────────────────────────────── */
async function aiFormatReply(question, rawData, lang, schoolName, chatHistory = [], isDetailedProfile = false) {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST     = new Date(Date.now() + IST_OFFSET);
  const currentDate = `${String(nowIST.getUTCDate()).padStart(2,"0")}-${String(nowIST.getUTCMonth()+1).padStart(2,"0")}-${nowIST.getUTCFullYear()}`;

  // ── INR formatter (server-side, guaranteed correct) ──
  const inrFmt = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

  // ── For detailed student profile: build the complete fee section on the SERVER.
  //    Do NOT let Mistral touch fee numbers — it miscalculates them.
  //    Instead: inject a fully-rendered fee string. Mistral copies it verbatim.
  let serverRenderedFeeSection = null;
  let dataStr;

  if (isDetailedProfile && rawData?.fee && typeof rawData.fee === "object") {
    const fee = rawData.fee;

    const feeLines = [
      `💰 **Fee Status** (Full Session)`,
      `• Gross Fee    : **${inrFmt(fee.grossFee)}**`,
      fee.concession > 0  ? `• Concession   : ${inrFmt(fee.concession)}`  : null,
      fee.waived > 0      ? `• Waived       : ${inrFmt(fee.waived)}`       : null,
      `• Net Payable  : ${inrFmt(fee.netPayable)}`,
      `• Total Paid   : ${inrFmt(fee.totalPaid)}`,
      `• Outstanding  : **${inrFmt(fee.pendingFee)}** ${fee.pendingFee <= 0 ? "✅" : "⚠️"}`,
      fee.lateFee > 0     ? `• Late Fee Due : ${inrFmt(fee.lateFee)}`      : null,
    ].filter(Boolean).join("\n");

    // Period-wise breakdown — show only non-PAID periods (or all if student has paid some)
    let periodSection = "";
    if (fee.periodBreakdown?.length) {
      const duePeriods = fee.periodBreakdown.filter(p =>
        ["DUE","PARTIAL","PARTIAL_WAIVED"].includes(p.status)
      );
      if (duePeriods.length > 0 && duePeriods.length <= 12) {
        const periodLines = duePeriods.map(p =>
          `  • ${p.period}: ₹${Number(p.due).toLocaleString("en-IN")} due` +
          (Number(p.paid) > 0 ? ` (₹${Number(p.paid).toLocaleString("en-IN")} paid)` : "")
        ).join("\n");
        periodSection = `\n• **Due Periods (${duePeriods.length}):**\n${periodLines}`;
      }
    }

    serverRenderedFeeSection = feeLines + periodSection;

    // Recent payments
    if (fee.recentPayments?.length) {
      const recentLines = fee.recentPayments.slice(0, 3).map((p, i) =>
        `  ${i + 1}. ${p.date} — ${inrFmt(p.amount)} (${p.mode})${p.receipt !== "N/A" ? ` — Receipt: ${p.receipt}` : ""}`
      ).join("\n");
      serverRenderedFeeSection += `\n• Recent Payments:\n${recentLines}`;
    }

    // Strip fee from rawData sent to Mistral — replace with the pre-rendered string
    // so Mistral cannot see raw numbers and cannot miscalculate
    const dataForMistral = {
      ...rawData,
      fee: `[FEE_SECTION_RENDERED_BELOW — do NOT rewrite fee numbers]`,
    };
    dataStr = JSON.stringify(dataForMistral, null, 2);
  } else {
    dataStr = JSON.stringify(rawData, null, 2);
  }

  const historyContext = chatHistory.length > 0
    ? "\n## Already answered (do NOT repeat these facts):\n" +
      chatHistory.slice(-4).map(m => `${m.role === "user" ? "Q" : "A"}: ${String(m.content || "").slice(0, 120)}`).join("\n") + "\n"
    : "";

  const q        = question.toLowerCase();
  const isClassSectionDefaulter = /class.*(section|wise).*default|default.*class.*(section|wise)/.test(q);
  const isFee    = /fee|jama|payment|paid|pending|baaki|collection|defaulter/.test(q);
  const isFeeList = isFee && /list|naam|kiski|kaun kaun|detail/.test(q) && !isClassSectionDefaulter;
  const isFeeMode = isFee && /mode|cash|online|upi/.test(q);
  const isFeeClasswise = isFee && /class|wise|breakdown/.test(q) && !isClassSectionDefaulter;
  const scenario = isDetailedProfile ? "student_profile" : isFee ? "fee_summary" : "data_found";

  const dataFormatRules = isDetailedProfile
    ? `## Student Profile Layout
The fee section has ALREADY been rendered server-side and will be appended after your response.
DO NOT write any fee numbers, fee amounts, or fee section yourself.

Your job — write ONLY these sections (skip if data is null/empty):
👤 **Basic Info** — name bold, then: Class | Section | Roll No | Gender | DOB | Category | Medium
👨‍👩‍👧 **Parents** — Father: X | Mother: Y (one line)
📅 **Attendance (This Month)** — Present/Absent/Leave counts + percentage
   Label: ≥90% Excellent 🟢 | 75-89% Good | 60-74% Average 🟡 | <60% Low 🔴
   Also: Today's status if available
📚 **Academics** — latest published exam only: exam name, marks obtained/total, percentage, result
🚌 **Transport** — Route + Stop (skip if not assigned)

Rules:
- Max 20 lines total
- No raw IDs, no ObjectIds
- The fee section will be appended automatically — do NOT add it`
    : isClassSectionDefaulter
    ? `## Class-Section Wise Defaulter Table Format
This is a SUMMARY table — show amounts per class, NOT individual student names.
Use numbered list format:
1. **Class-Section** — N defaulters | Defaulters Amt ₹X | Transport ₹X | Late Fine ₹X | Grand Total ₹X
Example: "1. **2nd-A** — 1 defaulter | Defaulters Amt ₹7,600 | Transport ₹1,000 | Late Fine ₹0 | **Grand Total ₹8,600**"
- Sort by class order (Nursery → LKG → UKG → 1st → 2nd ... 12th)
- Show all rows from the data.rows array
- Last line: Grand Total summary
- ⚠️ Show the amounts from data EXACTLY — do NOT list student names, do NOT show roll numbers`
    : isFeeList
    ? `## Fee Payment List Format
- Summary line FIRST: "Kul N payments — ₹Total" (if 3+ records)
- Numbered list: "1. Student Name — ₹Amount — Mode — Receipt No — DD-MM-YYYY"
- ISO paymentDate → convert to DD-MM-YYYY before showing
- Indian ₹ format: ₹1,20,000
- Max 20 items, then "...aur X aur payments"`
    : isFeeMode
    ? `## Payment Mode Breakdown Format
- Each mode on its own line: "• **Mode** — ₹Amount (N txn) — X%"
- Sort by amount descending
- Grand total at the end: "**Total: ₹Amount (N transactions)**"
- Percentages as whole numbers`
    : isFeeClasswise
    ? `## Class-wise Fee Format
- Numbered list sorted by amount descending
- Each: "1. **Class Name** — ₹Amount (N txn, N students)"
- Grand total at end
- Percentages whole numbers`
    : `## Data rules
- Show exact numbers from data — no rounding fee amounts, no recalculating
- Empty → "Koi record nahi mila" (once, naturally)
- Money → ₹ Indian format. Lists of 10+ → summary line first
- Skip null/undefined/ObjectId fields entirely
- Concession and waiver already applied — do not add or subtract
- ISO date strings → convert to DD-MM-YYYY`;

  const followUpInstr = lang === "english"
    ? `\n\nBlank line, then:\nFOLLOWUP: [2-3 natural follow-ups | pipe-separated | max 7 words each]`
    : `\n\nEk blank line ke baad:\nFOLLOWUP: [2-3 natural follow-ups | pipe se alag | max 7 words each]`;

  // Fee-specific follow-up hints so suggestions stay relevant
  const feeFollowUp = isFeeList
    ? (lang === "english"
        ? `\n\nFOLLOWUP: [today total collection|class-wise breakdown|yesterday payment list]`
        : `\n\nFOLLOWUP: [aaj ka total amount|class-wise breakdown|kal ki fee list]`)
    : isFeeMode
    ? (lang === "english"
        ? `\n\nFOLLOWUP: [this month mode breakdown|online payment list|today collection]`
        : `\n\nFOLLOWUP: [is mahine mode breakdown|online payment list|aaj ka collection]`)
    : isFeeClasswise
    ? (lang === "english"
        ? `\n\nFOLLOWUP: [class defaulters|payment mode breakdown|this week collection]`
        : `\n\nFOLLOWUP: [class-wise defaulters|payment mode breakdown|is hafte collection]`)
    : isFee
    ? (lang === "english"
        ? `\n\nFOLLOWUP: [who paid today list|class-wise fee breakdown|payment mode summary]`
        : `\n\nFOLLOWUP: [aaj fee dene walon ki list|class-wise breakdown|payment mode summary]`)
    : followUpInstr;

  const systemPrompt = `Tum SchoolCloudX AI ho — ${schoolName} school ka built-in assistant.
${RESPONSE_RULES}

Today (IST): ${currentDate}
${historyContext}
${langInstruction(lang)}

## This response style
${scenarioTone(scenario, lang)}

## Data parity rule
This data comes from the SAME database as the software's Reports pages.
Show it exactly as-is. Do not recalculate, do not round fee amounts, do not add or subtract.
Concession/waiver values are already applied — treat as final.
ISO date strings → convert to DD-MM-YYYY before showing.

Data:
${dataStr}

${dataFormatRules}
${isFee ? feeFollowUp : followUpInstr}`;

  const { reply, error } = await callMistral(
    [
      { role: "system", content: systemPrompt },
      ...chatHistory.slice(-4).map(m => ({
        role:    m.role === "model" ? "assistant" : m.role,
        content: String(m.content || ""),
      })),
      { role: "user", content: question },
    ],
    { max_tokens: isDetailedProfile ? 1400 : 900, temperature: 0.3, timeout: 25000 }
  );

  if (reply) {
    let finalReply = reply;

    // Append the server-rendered fee section AFTER Mistral's reply
    // This guarantees fee numbers are 100% accurate — Mistral never touched them
    if (serverRenderedFeeSection) {
      // Remove any fee-related lines Mistral may have accidentally written
      finalReply = reply
        .replace(/💰[\s\S]*?(?=\n📅|\n📚|\n🚌|\n👤|\nFOLLOWUP:|$)/m, "")
        .replace(/\*?\*?Fee Status[\s\S]*?(?=\n📅|\n📚|\n🚌|\n👤|\nFOLLOWUP:|$)/mi, "")
        .replace(/gross fee[\s\S]*?(?=\n[^\s•]|\nFOLLOWUP:|$)/mi, "")
        .trim();
      finalReply = `${finalReply}\n\n${serverRenderedFeeSection}`;
    }

    const parsed = parseFollowUpFromReply(finalReply);
    return { reply: parsed.cleanReply, followUpSuggestions: parsed.followUpSuggestions, error: null };
  }
  return { reply: null, followUpSuggestions: [], error };
}

/* ────────────────────────────────────────────────────────────────
   FAST PATH INTENTS
──────────────────────────────────────────────────────────────── */
const FAST_PATH_INTENTS = new Set([
  "fee_today", "fee_defaulters", "fee_defaulters_class", "fee_summary", "fee_structure", "fee_heads", "fee_overview",
  "students", "admissions", "students_left",
  "attendance", "teachers", "classes", "homework", "notices", "transport", "topper",
  "report_fee_collection", "report_fee_mode", "report_fee_outstanding",
  "report_defaulters_classwise", "report_class_section_defaulters", "report_transport", "report_scholarship",
  "report_students_inactive",
  "report_fee_defaulters_detailed", "report_fee_deposited_detailed",
  "report_registration_fee", "report_registration_fee_classwise",
  "report_inactive_fee_statement",
  "report_fee_defaulters_monthwise", "report_fee_deposit_classwise",
  "report_student_fee_details", "report_new_admission_fee",
  "report_transport_route_wise", "report_transport_defaulters",
  "report_fee_head", "report_result_analysis",
]);

/* ────────────────────────────────────────────────────────────────
   NEEDS DYNAMIC — detect queries that need specific/AI-generated pipelines
   even when they fall under a fast-path intent
──────────────────────────────────────────────────────────────── */
function needsDynamic(intent, msg) {
  const DYNAMIC_FIRST = new Set(["dynamic_data", "admissions", "students_left", "report_result_analysis"]);
  if (DYNAMIC_FIRST.has(intent)) {
    // EXCEPTION: Named student queries → PATH 2.5 handles them, dynamic gives wrong aggregate data
    const studentNameSignals = [
      /\b(?:ka|ki|ke|k)\s+(?:roll|fee|fees|class|section|detail|attendance|marks|result|status|info|profile|record|admission|dob|category|transport|route|baaki|pending|percentage|grade|father|mother|sibling|payment)\b/i,
      /\bne\s+(?:fee|jama|payment|kitni)\b/i,
      /\b(?:kis|kaunsi|kaunse|which|kahan|konsi)\s+(?:class|section|school|grade|stream)\b/i,
      /\bka\s+roll\b/i,
      /\bke\s+baare\b/i,
      /\bkahan\s+padh/i,
      /\bkab\s+(?:se|aayi|aaya|admit)\b/i,
      // "Name (STDXXX) ka ..." or "Name ka payment status"
      /\([A-Z]{2,5}\d{3,}\)\s+ka\b/i,
      /payment\s+status/i,
      /\bstatus\s+kya\b/i,
    ];
    if (studentNameSignals.some(re => re.test(msg))) {
      // Still dynamic only for clear aggregate/list queries
      const isAggregateQuery = /\b(?:list|kitne|total|count|sabhi|sab|all|class.*wise|section.*wise|gender.*wise|kaun\s+kaun|sabse|top\s*\d|first\s*\d|\d+\s*student)\b/i.test(msg);
      if (!isAggregateQuery) return false;
    }
    return true;
  }

  // ── Report intents with dedicated fast-path handlers → NEVER dynamic ──
  const ALWAYS_FAST = new Set([
    "report_class_section_defaulters", "report_defaulters_classwise",
    "report_fee_collection", "report_fee_mode", "report_fee_head",
    "report_fee_outstanding", "report_transport", "report_scholarship",
    "report_fee_defaulters_monthwise", "report_fee_deposit_classwise",
    "report_student_fee_details", "report_new_admission_fee",
    "report_fee_defaulters_detailed", "report_fee_deposited_detailed",
    "report_registration_fee", "report_registration_fee_classwise",
    "report_inactive_fee_statement",
    "report_transport_route_wise", "report_transport_defaulters",
    "report_fee_head", "report_result_analysis",
  ]);
  if (ALWAYS_FAST.has(intent)) return false;

  const m = msg.toLowerCase();

  // ── DATE-SPECIFIC queries → always dynamic (static code can't handle arbitrary dates)
  // "kal", "parso", "28 ko", "is mahine", "pichle hafte", specific date numbers, etc.
  if (/\bkal\b|\bparso\b|\bpichle?\b|\bpichli\b/.test(m)) return true;
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(m)) return true;
  if (/\b(jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/.test(m)) return true;
  if (/\b\d{1,2}\s*(ko|ka|ki|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/.test(m)) return true;
  if (/pichle?\s+\d+\s*(din|dino|hafte|mahine|ghante)/.test(m)) return true;
  if (/is\s+(hafte|mahine|week|month)/.test(m) && !/aaj|today/.test(m)) return true;
  if (/\b(last|this|previous)\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(m)) return true;
  if (/\b\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?\b/.test(m)) return true; // date formats like 28/07 or 28-07-2025

  // ── STUDENT NAME LIST queries
  if (/last|latest|recent|pehla|aakhri|pahla|newest|aaj.*naam|naam.*aaj/.test(m)) return true;
  if (/\blist\b.*\b(student|naam|name)\b|\b(student|naam|name)\b.*\blist\b/.test(m)) return true;
  if (/kaun.*student|student.*kaun|kiska.*naam|naam.*kiska/.test(m)) return true;
  if (/top\s*\d|first\s*\d|\d+.*student.*naam/.test(m)) return true;
  if (/sabse.*pehle.*admit|pehle.*admit|last.*admit/.test(m)) return true;

  // ── FEE STRUCTURE/HEADS class-specific → dynamic (queries both feestructures + additionalfees)
  if ((intent === "fee_structure" || intent === "fee_heads") &&
      /nursery|lkg|ukg|class|kaksha|\bkg\b|\d+\s*(?:st|nd|rd|th)|\d/.test(m)) return true;

  // ── FEE COLLECTION LIST / BREAKDOWN → always dynamic
  // "kiski fee aayi", "fee list", "class-wise collection", "payment mode breakdown"
  if (/kiski\s+fee|fee.*list|list.*fee/.test(m)) return true;
  if (/class.*(wise|mein|ka|ki|ke).*fee|fee.*(class|wise|breakdown)/.test(m)) return true;
  if (/payment\s*mode|mode.*breakdown|cash.*online|online.*cash|upi.*breakdown/.test(m)) return true;
  if (/kitni\s+fee\s+(aayi|collect|aai|mili)|fee\s+collect.*kitni/.test(m)) return true;
  if (/sabse\s+zyada\s+fee|top.*fee|fee.*top/.test(m)) return true;
  if (/monthly.*fee|fee.*monthly|mahine.*mahine.*fee/.test(m)) return true;

  return false;
}

/* ────────────────────────────────────────────────────────────────
   CURRENT SESSION HELPER
──────────────────────────────────────────────────────────────── */
async function getCurrentSession(db) {
  const { getSessionModel } = await import("../../../models/tenant/master/Session.model.js");
  const Session = getSessionModel(db);
  return (
    await Session.findOne({ isCurrent: true, isActive: true }).lean() ||
    await Session.findOne({ isActive: true }).sort({ createdAt: -1 }).lean()
  );
}

/* ────────────────────────────────────────────────────────────────
   CONVERSATIONAL AI  (PATH 4)
──────────────────────────────────────────────────────────────── */
async function handleConversational(req, res, message, chatHistory, intent, lang) {
  const tenant     = req.tenant || {};
  const schoolName = tenant.schoolName || tenant.subdomain || "Your School";

  if (!process.env.MISTRAL_API_KEY)
    return apiError(res, 500, false, "AI service not configured");

  // Current date/time in IST — injected so AI never guesses wrong
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST     = new Date(Date.now() + IST_OFFSET);
  const DAYS       = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const currentDate = `${nowIST.getUTCDate().toString().padStart(2,"0")}-${(nowIST.getUTCMonth()+1).toString().padStart(2,"0")}-${nowIST.getUTCFullYear()}`;
  const currentDay  = DAYS[nowIST.getUTCDay()];
  const currentTime = `${nowIST.getUTCHours().toString().padStart(2,"0")}:${nowIST.getUTCMinutes().toString().padStart(2,"0")}`;

  const isGreeting = /^(hi|hello|hey|hii|helo|namaste|namaskar|jai hind|salaam|assalam|kya haal|kaise ho|good morning|good afternoon|good evening|shuru karo|start|help me|help karo|batao|bolo|kya kar sakte|kya kar sakti|kya puch sakta|kya pooch sakta)\b/i.test(message.trim());
  const scenario   = isGreeting ? "greeting" : "data_found";

  const followUpInstr = lang === "english"
    ? `\n\nBlank line, then:\nFOLLOWUP: [2-3 relevant follow-up questions | pipe-separated | max 7 words each]`
    : `\n\nEk blank line ke baad:\nFOLLOWUP: [2-3 relevant follow-ups | pipe se alag | max 7 words each]`;

  const systemPrompt = `Tum SchoolCloudX AI ho — ${schoolName} school ka built-in assistant.
${RESPONSE_RULES}

Date: ${currentDate} (${currentDay}) | Time: ${currentTime}
School: ${schoolName}${tenant.city ? `, ${tenant.city}` : ""}

${langInstruction(lang)}

## This response style
${scenarioTone(scenario, lang)}

## What you can do
- Live school data: fee, attendance, students, defaulters, toppers, reports
- Individual student or teacher full profile
- All reports — same data as the Reports section in software
- Software how-to guides

## Accuracy rule
Specific data nahi hai → "Yeh data abhi mere paas nahi, Reports section check karo." Never guess.
${followUpInstr}`;

  const { reply, model, error } = await callMistral(
    [
      { role: "system", content: systemPrompt },
      ...chatHistory.slice(-6).map(m => ({
        role:    m.role === "model" ? "assistant" : m.role,
        content: String(m.content || ""),
      })),
      { role: "user", content: message },
    ],
    { max_tokens: 700, temperature: 0.55, timeout: 20000 }
  );

  if (reply) {
    const { cleanReply: afterNav, navigationSteps } = parseNavigationSteps(reply);
    const { cleanReply, followUpSuggestions } = parseFollowUpFromReply(afterNav);
    return res.status(200).json(
      new apiResponse(200, { reply: cleanReply, navigationSteps, followUpSuggestions, intent, mode: "conversational_ai", model }, "AI response")
    );
  }

  if (isRateLimitError(error))
    return apiError(res, 503, false, "AI temporarily unavailable. Please try again.");

  // Only true last resort — Mistral completely down
  return apiError(res, 503, false, "AI service unavailable. Please try again shortly.");
}

/* ════════════════════════════════════════════════════════════════
   MAIN HANDLER  POST /api/ai/chat
════════════════════════════════════════════════════════════════ */
export const aiChat = asyncHandler(async (req, res) => {

  const { message: rawMessage, chatHistory = [] } = req.body;
  if (!rawMessage?.trim()) return apiError(res, 400, false, "Message is required");

  // ── Security: sanitize input length and control characters ──
  const message = sanitizeInput(rawMessage);
  if (!message) return apiError(res, 400, false, "Invalid message");

  // ── Security: prompt injection detection ──
  if (detectPromptInjection(message)) {
    console.warn(`[AI Security] Prompt injection attempt blocked | tenant: ${req.tenant?.subdomain || "unknown"} | msg: "${message.slice(0, 80)}"`);
    return res.status(200).json(
      new apiResponse(200, {
        reply:              "Yeh request process nahi ho sakti. Please school-related question poochein.",
        intent:             "blocked",
        mode:               "security_block",
        followUpSuggestions: [],
      }, "Blocked")
    );
  }

  const db         = req.db;
  const tenant     = req.tenant || {};
  const schoolName = tenant.schoolName || tenant.subdomain || "Your School";
  const lang       = detectLanguage(message);
  const reqStart   = Date.now();

  /* ── Build context string from recent chat ── */
  const recentContext = chatHistory.slice(-4)
    .map(m => `${m.role === "user" ? "User" : "AI"}: ${String(m.content || "").slice(0, 200)}`)
    .join("\n");
  const messageWithContext = recentContext
    ? `[Recent conversation:\n${recentContext}\n]\nCurrent question: ${message}`
    : message;

  /* ── NLU parse ── */
  const nlu = await parseUserIntent(messageWithContext);
  const { intent, className, sectionName, dateRange, tillMonth, source } = nlu;

  // NLU returned injection_blocked (injected inside the context string)
  if (nlu.injectionDetected) {
    return res.status(200).json(
      new apiResponse(200, {
        reply:              "Yeh request process nahi ho sakti.",
        intent:             "blocked",
        mode:               "security_block",
        followUpSuggestions: [],
      }, "Blocked")
    );
  }

  console.log(`🤖 [${schoolName}] intent=${intent} lang=${lang} class=${className} src=${source} | "${message.slice(0, 60)}"`);

  /* ══════════════════════════════════════════════════════════
     PATH 2.5-EARLY: Student name detected → profile lookup
     Run this FIRST before dynamic/fast-path so named student
     queries never accidentally hit aggregate pipelines
  ══════════════════════════════════════════════════════════ */
  {
    const studentName = extractStudentName(message);
    if (studentName) {
      console.log(`[Path2.5-Early] Student name detected: "${studentName}" | intent=${intent}`);
      try {
        const result = await queryStudentByName(db, { nameQuery: studentName });
        if (!result.error) {
          const isDetailedProfile = result.type === "student_search_detailed";

          const isFeeQuery        = /fee|jama|payment|paid|pending|baaki|receipt|collection|outstanding|concession|discount|status/i.test(message);
          const isAttendanceQuery = /attendance|present|absent|hazri/i.test(message);
          const isMarksQuery      = /marks|result|percentage|grade|exam|topper|pass|fail/i.test(message);
          const isRollQuery       = /roll|roll\s*no|roll\s*number|registration\s*no|sr\s*no/i.test(message);
          const isClassQuery      = /kis\s*class|kaunsi\s*class|which\s*class|class\s*mein\s*hai|kahan\s*padh|section|stream/i.test(message);
          const isAdmissionQuery  = /admission|admit|kab\s*aayi|kab\s*aaya|kab\s*se|dob|date\s*of\s*birth|janam|birthday/i.test(message);
          const isTransportQuery  = /bus|transport|route|stop|van|vehicle|gaadi/i.test(message);
          const isParentQuery     = /father|mother|parent|guardian/i.test(message);

          const focusHint = isFeeQuery
            ? "\n\nFOCUS: User fee/payment status ke baare mein pooch raha hai — fee status section clearly dikhao."
            : isAttendanceQuery
            ? "\n\nFOCUS: User attendance ke baare mein pooch raha hai — attendance section highlight karo."
            : isMarksQuery
            ? "\n\nFOCUS: User marks/result ke baare mein pooch raha hai — academics section highlight karo."
            : isRollQuery
            ? "\n\nFOCUS: User roll number pooch raha hai — Roll No, Student ID clearly dikhao."
            : isClassQuery
            ? "\n\nFOCUS: User class/section pooch raha hai — Class, Section clearly dikhao."
            : isAdmissionQuery
            ? "\n\nFOCUS: User admission date ya DOB pooch raha hai — Admission Date, DOB clearly dikhao."
            : isTransportQuery
            ? "\n\nFOCUS: User transport ke baare mein pooch raha hai — Route, Stop clearly dikhao."
            : isParentQuery
            ? "\n\nFOCUS: User parents ke baare mein pooch raha hai — Father, Mother, Guardian clearly dikhao."
            : "";

          const { reply, followUpSuggestions, error: fmtErr } = await aiFormatReply(
            message + focusHint,
            result.rawData || result,
            lang,
            schoolName,
            chatHistory,
            isDetailedProfile
          );

          if (reply) {
            console.log(`✅ [${schoolName}] student profile early: "${studentName}" | ${Date.now() - reqStart}ms`);
            return res.status(200).json(
              new apiResponse(200, {
                reply,
                followUpSuggestions: followUpSuggestions || [],
                intent: "student_search",
                mode:   isDetailedProfile ? "student_profile_detailed" : "database_direct",
              }, "Student search")
            );
          }
          console.warn("[Path2.5-Early] AI format failed:", fmtErr?.message);
        } else {
          console.warn("[Path2.5-Early] Student not found:", result.error, "— continuing to other paths");
        }
      } catch (err) {
        console.error(`[Path2.5-Early] Exception [${schoolName}]:`, err.message);
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     PATH 3: Dynamic DB query — AI generates pipeline + formats reply
     Runs BEFORE fast path for specific/detail queries
  ══════════════════════════════════════════════════════════ */

  if (needsDynamic(intent, message)) {
    try {
      const session = await getCurrentSession(db);

      if (session) {
        const enrichedMessage = className
          ? `${message} [class: ${className}${sectionName ? `, section: ${sectionName}` : ""}]`
          : message;

        const dynResult = await generateAndExecuteDynamicQuery(
          db,
          enrichedMessage,
          String(session._id),
          lang,
          { schoolName, schoolCity: tenant.city || "", schoolSubdomain: tenant.subdomain || "" },
          chatHistory
        );

        if (dynResult.success) {
          console.log(`✅ [${schoolName}] dynamic: ${dynResult.rowCount} rows | ${dynResult.description} | ${Date.now() - reqStart}ms`);
          return res.status(200).json(
            new apiResponse(200, {
              reply:              dynResult.reply,
              followUpSuggestions: dynResult.followUpSuggestions || [],
              intent,
              mode:               "dynamic_db_query",
              description:        dynResult.description,
            }, "Dynamic DB query")
          );
        }
        console.warn(`[Path3-Early] Dynamic failed (${dynResult.reason}) — falling to fast path`);
      }
    } catch (dynErr) {
      console.error(`[Path3-Early] Exception [${schoolName}]:`, dynErr.message);
    }
  }

  /* ══════════════════════════════════════════════════════════
     PATH 1: Fast path — DB fetch → AI formats reply
  ══════════════════════════════════════════════════════════ */
  if (FAST_PATH_INTENTS.has(intent)) {
    try {
      const wantsNames = /\b(naam|name|names|list|kaun|kaun kaun|batao|dikhao|kon kon)\b/i.test(message);
      const result = await executeQuery(db, intent, { className, sectionName, dateRange, tillMonth, nameQuery: wantsNames });

      if (!result.error) {
        const { reply, followUpSuggestions, error } = await aiFormatReply(message, result, lang, schoolName, chatHistory);

        if (reply) {
          console.log(`✅ [${schoolName}] fast-path: intent=${intent} | ${Date.now() - reqStart}ms`);
          return res.status(200).json(
            new apiResponse(200, {
              reply,
              followUpSuggestions: followUpSuggestions || [],
              intent,
              mode: "database_fast_path",
            }, "DB fast path")
          );
        }
        // AI format failed — fall through to dynamic
        console.warn(`[Path1] AI format failed: ${error?.message} — falling to dynamic`);
      } else {
        console.warn(`[Path1] DB query error: ${result.error} — falling to dynamic`);
      }
    } catch (err) {
      console.error(`[Path1] Exception [${schoolName}]:`, err.message);
    }
  }

  /* ══════════════════════════════════════════════════════════
     PATH 2: Software help (how-to documentation)
  ══════════════════════════════════════════════════════════ */
  if (intent === "software_help") {
    if (!process.env.MISTRAL_API_KEY)
      return apiError(res, 500, false, "AI service not configured");

    const langNote = lang === "english" ? "Respond in English only."
      : lang === "hindi" ? "Hindi ya Hinglish mein jawab do."
      : "Hinglish mein jawab do.";

    const { reply, error } = await callMistral(
      [
        { role: "system", content: `${SOFTWARE_HELP_SYSTEM_PROMPT}\n\nUSER LANGUAGE: ${langNote}` },
        ...chatHistory.slice(-5).map(m => ({
          role:    m.role === "model" ? "assistant" : m.role,
          content: String(m.content || ""),
        })),
        { role: "user", content: message },
      ],
      { max_tokens: 2000, temperature: 0.3, timeout: 30000 }
    );

    if (reply) {
      const { cleanReply: afterNav, navigationSteps } = parseNavigationSteps(reply);
      const { cleanReply, followUpSuggestions } = parseFollowUpFromReply(afterNav);
      console.log(`✅ [${schoolName}] software_help | ${Date.now() - reqStart}ms`);
      return res.status(200).json(
        new apiResponse(200, {
          reply: cleanReply,
          navigationSteps,
          followUpSuggestions: followUpSuggestions || [],
          intent,
          mode: "software_help",
        }, "Software help")
      );
    }

    if (isRateLimitError(error))
      return apiError(res, 503, false, "AI temporarily unavailable. Please retry.");

    // Fall through to conversational
  }

  /* ══════════════════════════════════════════════════════════
     PATH 2.5: Student name search → DB fetch → AI formats reply
     Runs for ANY intent when a student name is detected in message
  ══════════════════════════════════════════════════════════ */
  {
    const studentName = extractStudentName(message);
    if (studentName) {
      console.log(`[Path2.5] Student name detected: "${studentName}" | intent=${intent}`);
      try {
        const result = await queryStudentByName(db, { nameQuery: studentName });
        if (!result.error) {
          const isDetailedProfile = result.type === "student_search_detailed";

          // For fee-specific queries about a named student, build focused prompt
          const isFeeQuery        = /fee|jama|payment|paid|pending|baaki|receipt|collection|outstanding|concession|discount/i.test(message);
          const isAttendanceQuery = /attendance|present|absent|hazri/i.test(message);
          const isMarksQuery      = /marks|result|percentage|grade|exam|topper|pass|fail/i.test(message);
          const isRollQuery       = /roll|roll\s*no|roll\s*number|registration\s*no|sr\s*no/i.test(message);
          const isClassQuery      = /kis\s*class|kaunsi\s*class|which\s*class|class\s*mein\s*hai|kahan\s*padh|section|stream/i.test(message);
          const isAdmissionQuery  = /admission|admit|kab\s*aayi|kab\s*aaya|kab\s*se|dob|date\s*of\s*birth|janam|birthday|age/i.test(message);
          const isTransportQuery  = /bus|transport|route|stop|van|vehicle|gaadi/i.test(message);
          const isParentQuery     = /father|mother|parent|guardian|fatherName|motherName|baap|maa|mata|pita/i.test(message);
          const isCategoryQuery   = /category|caste|religion|house|medium|type|general|obc|sc|st/i.test(message);

          const focusHint = isFeeQuery
            ? "\n\nFOCUS: User fee ke baare mein pooch raha hai — fee status section ko clearly highlight karo. Gross Fee, Concession, Net Payable, Paid, Outstanding dikhao."
            : isAttendanceQuery
            ? "\n\nFOCUS: User attendance ke baare mein pooch raha hai — sirf attendance section highlight karo. Month percentage aur today status dikhao."
            : isMarksQuery
            ? "\n\nFOCUS: User marks/result ke baare mein pooch raha hai — sirf academic/exam section highlight karo."
            : isRollQuery
            ? "\n\nFOCUS: User roll number ya registration number pooch raha hai — Roll No, Student ID, SR No clearly dikhao."
            : isClassQuery
            ? "\n\nFOCUS: User class/section/stream pooch raha hai — Class, Section, Stream clearly dikhao."
            : isAdmissionQuery
            ? "\n\nFOCUS: User admission date ya date of birth pooch raha hai — Admission Date, DOB, Admission Month clearly dikhao."
            : isTransportQuery
            ? "\n\nFOCUS: User transport ke baare mein pooch raha hai — Route, Stop, Transport Type clearly dikhao."
            : isParentQuery
            ? "\n\nFOCUS: User parents ke baare mein pooch raha hai — Father Name, Mother Name, Guardian, Contact clearly dikhao."
            : isCategoryQuery
            ? "\n\nFOCUS: User category/caste/religion pooch raha hai — Category, Caste, Religion, House, Medium clearly dikhao."
            : "";

          const focusedMessage = message + focusHint;

          const { reply, followUpSuggestions, error } = await aiFormatReply(
            focusedMessage,
            result.rawData || result,
            lang,
            schoolName,
            chatHistory,
            isDetailedProfile
          );

          if (reply) {
            console.log(`✅ [${schoolName}] student profile: "${studentName}" | ${Date.now() - reqStart}ms`);
            return res.status(200).json(
              new apiResponse(200, {
                reply,
                followUpSuggestions: followUpSuggestions || [],
                intent: "student_search",
                mode:   isDetailedProfile ? "student_profile_detailed" : "database_direct",
              }, "Student search")
            );
          }
          console.warn("[Path2.5] AI format failed:", error?.message);
        } else {
          console.warn("[Path2.5] Student search DB error:", result.error);
        }
      } catch (err) {
        console.error(`[Path2.5] Exception [${schoolName}]:`, err.message);
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     PATH 2.6: Teacher name search → DB fetch → AI formats reply
  ══════════════════════════════════════════════════════════ */
  {
    const teacherName = extractTeacherName(message);
    if (teacherName) {
      console.log(`[Path2.6] Teacher name detected: "${teacherName}" | intent=${intent}`);
      try {
        const result = await queryTeacherByName(db, { nameQuery: teacherName });
        if (!result.error) {
          const isDetailed = result.type === "teacher_search_detailed";

          const { reply, followUpSuggestions, error } = await aiFormatReply(message, result.rawData || result, lang, schoolName, chatHistory);

          if (reply) {
            console.log(`✅ [${schoolName}] teacher profile: "${teacherName}" | ${Date.now() - reqStart}ms`);
            return res.status(200).json(
              new apiResponse(200, {
                reply,
                followUpSuggestions: followUpSuggestions || [],
                intent:  "teacher_search",
                mode:    isDetailed ? "teacher_profile_detailed" : "database_direct",
              }, "Teacher search")
            );
          }
          console.warn("[Path2.6] AI format failed:", error?.message);
        } else {
          console.warn("[Path2.6] Teacher search DB error:", result.error);
        }
      } catch (err) {
        console.error(`[Path2.6] Exception [${schoolName}]:`, err.message);
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     PATH 3: Dynamic DB query — fallback for remaining intents
     (already ran above for dynamic_data and specific queries)
  ══════════════════════════════════════════════════════════ */
  // Only truly skip dynamic for: software_help (needs docs), no_individual_data (privacy block)
  // "general" and "prediction" → pure conversational, never DB query
  const SKIP_DYNAMIC_INTENTS = new Set([
    "software_help", "no_individual_data", "general", "prediction",
  ]);

  if (!SKIP_DYNAMIC_INTENTS.has(intent) && !needsDynamic(intent, message)) {
    try {
      const session = await getCurrentSession(db);

      if (session) {
        const enrichedMessage = className
          ? `${message} [class: ${className}${sectionName ? `, section: ${sectionName}` : ""}]`
          : message;

        const dynResult = await generateAndExecuteDynamicQuery(
          db,
          enrichedMessage,
          String(session._id),
          lang,
          { schoolName, schoolCity: tenant.city || "", schoolSubdomain: tenant.subdomain || "" },
          chatHistory
        );

        if (dynResult.success) {
          console.log(`✅ [${schoolName}] dynamic fallback: ${dynResult.rowCount} rows | ${dynResult.description} | ${Date.now() - reqStart}ms`);
          return res.status(200).json(
            new apiResponse(200, {
              reply:              dynResult.reply,
              followUpSuggestions: dynResult.followUpSuggestions || [],
              intent,
              mode:               "dynamic_db_query",
              description:        dynResult.description,
            }, "Dynamic DB query")
          );
        }
        console.warn(`[Path3] Dynamic failed (${dynResult.reason}) — falling to conversational`);
      } else {
        console.warn(`[Path3] No active session found for ${schoolName}`);
      }
    } catch (dynErr) {
      console.error(`[Path3] Exception [${schoolName}]:`, dynErr.message);
    }
  }

  /* ══════════════════════════════════════════════════════════
     PATH 4: Conversational AI — all remaining cases
     (general, no_individual_data, dynamic fallback, software fallback)
  ══════════════════════════════════════════════════════════ */
  console.log(`[Path4] Conversational fallback | intent=${intent} | ${schoolName}`);
  return handleConversational(req, res, message, chatHistory, intent, lang);
});
