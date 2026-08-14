// dynamic/aiDynamicQueryEngine.js
import axios    from "axios";
import { buildGeneratorPrompt, buildFormatterPrompt } from "./aiDynamicPrompts.js";
import { validatePipeline, hydrate, sanitizeRows, fallbackFormat } from "./aiDynamicPipeline.js";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

/* ── Raw Mistral call used only inside this engine ── */
async function callMistralRaw(messages, { maxTokens = 1200, temp = 0, jsonMode = false, timeout = 25000, model = "mistral-large-latest" } = {}) {
  const body = { model, messages, temperature: temp, max_tokens: maxTokens };
  if (jsonMode) body.response_format = { type: "json_object" };
  const resp = await axios.post(MISTRAL_API_URL, body, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${MISTRAL_API_KEY}` },
    timeout,
  });

  // Log token usage
  const usage = resp.data.usage;
  if (usage) {
    console.debug(`[DynQuery] ${model} | tokens: ${usage.total_tokens} (P:${usage.prompt_tokens} C:${usage.completion_tokens})`);
  }

  return resp.data.choices?.[0]?.message?.content || "";
}

/* ── Parse follow-up suggestions out of AI reply ── */
function parseFollowUpFromReply(rawReply) {
  if (!rawReply) return { cleanReply: rawReply, followUpSuggestions: [] };

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

/* ── Post-process: clean ISO dates in final reply ── */
function cleanISODates(text) {
  if (!text) return text;
  // Convert ISO timestamps like "2026-07-28T18:30:00.000Z" → DD-MM-YYYY
  return text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, (match) => {
    try {
      const d = new Date(match);
      const IST = 5.5 * 60 * 60 * 1000;
      const istDate = new Date(d.getTime() + IST);
      const dd = String(istDate.getUTCDate()).padStart(2, "0");
      const mm = String(istDate.getUTCMonth() + 1).padStart(2, "0");
      const yyyy = istDate.getUTCFullYear();
      return `${dd}-${mm}-${yyyy}`;
    } catch { return match; }
  });
}

export async function generateAndExecuteDynamicQuery(db, question, sessionId, lang = "hinglish", schoolContext = {}, chatHistory = []) {
  if (!MISTRAL_API_KEY) return { success: false, reason: "no_api_key" };

  const IST    = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST);
  const istStr = nowIST.toISOString().slice(0, 10);
  const todayStart    = new Date(istStr + "T00:00:00+05:30").toISOString();
  const todayEnd      = new Date(istStr + "T23:59:59+05:30").toISOString();

  // Yesterday in IST
  const yesterdayDate  = new Date(new Date(istStr + "T00:00:00+05:30") - 86400000);
  const yStr           = yesterdayDate.toISOString().slice(0, 10);
  const yesterdayStart = new Date(yStr + "T00:00:00+05:30").toISOString();
  const yesterdayEnd   = new Date(yStr + "T23:59:59+05:30").toISOString();

  /* ── Helper: generate pipeline from Mistral ── */
  async function generatePipeline(prompt, attemptLabel) {
    try {
      const raw = await callMistralRaw(
        [
          { role: "system", content: "You are a MongoDB aggregation pipeline generator. Return ONLY valid JSON. No markdown, no explanation." },
          { role: "user",   content: prompt },
        ],
        { maxTokens: 1800, temp: 0, jsonMode: true, timeout: 20000 }
      );

      // Strip any accidental markdown code-block wrapping
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const spec = JSON.parse(cleaned);
      console.log(`[DynamicQuery] ${attemptLabel} pipeline generated for collection: "${spec.collection}" | ${spec.description || ""}`);
      return { spec, error: null };
    } catch (err) {
      console.error(`[DynamicQuery] ${attemptLabel} generation failed:`, err.message);
      return { spec: null, error: err.message };
    }
  }

  /* ── Helper: validate + hydrate + execute pipeline ── */
  async function executePipeline(spec) {
    const { collection, pipeline } = spec || {};
    if (!collection || !Array.isArray(pipeline)) return { rows: null, error: "invalid_spec" };

    const validationErr = validatePipeline(collection, pipeline);
    if (validationErr) {
      console.error(`[DynamicQuery] Validation failed: ${validationErr}`);
      return { rows: null, error: `validation: ${validationErr}` };
    }

    let execPipeline;
    try {
      execPipeline = hydrate(pipeline);
    } catch (e) {
      console.error(`[DynamicQuery] Hydration failed:`, e.message);
      return { rows: null, error: `hydration: ${e.message}` };
    }

    try {
      const hasLimit = execPipeline.some(s => s.$limit !== undefined);
      if (!hasLimit) execPipeline.push({ $limit: 50 });
      let rows = await db.collection(collection.toLowerCase()).aggregate(execPipeline, { allowDiskUse: true }).toArray();
      if (spec.description === "school_info_query") rows = [];
      rows = sanitizeRows(rows);
      console.log(`[DynamicQuery] ${collection} → ${rows.length} rows returned`);
      return { rows, error: null, collection, description: spec.description };
    } catch (e) {
      console.error(`[DynamicQuery] Execution failed on "${collection}":`, e.message, `| Pipeline stages: ${execPipeline.map(s => Object.keys(s)[0]).join(",")}`);
      return { rows: null, error: `execution: ${e.message}` };
    }
  }

  /* ════ PASS 1: Generate pipeline ════ */
  const prompt1 = buildGeneratorPrompt(question, sessionId, todayStart, todayEnd, yesterdayStart, yesterdayEnd);
  const { spec: spec1, error: genErr1 } = await generatePipeline(prompt1, "Attempt-1");

  if (!spec1) return { success: false, reason: "generation_failed", error: genErr1 };

  let execResult = await executePipeline(spec1);

  /* ════ RETRY: If execution failed, ask Mistral to fix the pipeline ════ */
  if (execResult.error) {
    console.warn(`[DynamicQuery] Attempt-1 failed (${execResult.error}) — retrying with error context`);

    const retryPrompt = `${prompt1}

---
IMPORTANT: Your previous pipeline attempt had this error: "${execResult.error}"

Common fixes:
- If "session" field mismatch: studentenrolments uses "session", attendances/payments/homeworks use "sessionId"
- If ObjectId error: use { "$oid": "..." } syntax
- If field not found: check the schema above carefully
- If stage not allowed: only use allowed stages listed above
- For "kal" (yesterday): use YESTERDAY_START and YESTERDAY_END values provided above

Generate a CORRECTED pipeline that avoids the same error.`;

    const { spec: spec2, error: genErr2 } = await generatePipeline(retryPrompt, "Attempt-2");

    if (spec2) {
      const retryResult = await executePipeline(spec2);
      if (!retryResult.error) {
        execResult = retryResult;
      } else {
        console.warn(`[DynamicQuery] Retry-2 also failed: ${retryResult.error}`);
        return { success: false, reason: "execution_failed_after_retry", error: retryResult.error };
      }
    } else {
      return { success: false, reason: "generation_failed_retry", error: genErr2 };
    }
  }

  /* ════ PASS 2: Format answer with follow-up suggestions ════ */
  let reply;
  let followUpSuggestions = [];

  try {
    const formatterPrompt = buildFormatterPrompt(
      question,
      execResult.rows,
      execResult.description,
      lang,
      schoolContext,
      chatHistory
    );

    // Use slightly higher temperature for natural-sounding responses
    const rawReply = await callMistralRaw(
      [
        {
          role: "system",
          content: "You are SchoolCloudX AI — a school management assistant. Answer based ONLY on the data provided. Be concise, natural, and direct. Never fabricate numbers. Never show raw IDs, ObjectIds, or ISO date strings.",
        },
        { role: "user", content: formatterPrompt },
      ],
      { maxTokens: 1000, temp: 0.25, timeout: 18000 }
    );

    const parsed = parseFollowUpFromReply(rawReply);
    reply              = cleanISODates(parsed.cleanReply);
    followUpSuggestions = parsed.followUpSuggestions;

  } catch (e) {
    console.warn("[DynamicQuery] Pass-2 formatter failed:", e.message);
    reply = fallbackFormat(execResult.rows, execResult.description, lang);
  }

  return {
    success:            true,
    reply:              reply.trim(),
    followUpSuggestions,
    rawData:            execResult.rows,
    collection:         execResult.collection,
    description:        execResult.description,
    rowCount:           execResult.rows.length,
    mode:               "dynamic_db_query",
  };
}
