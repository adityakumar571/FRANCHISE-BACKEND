/* ================================================================
   AI MISTRAL SERVICE  v2
   File    : controllers/tenant/ai/aiMistralService.js
   Purpose : Handle Mistral AI API calls with retry, fallback,
             token-usage logging, and improved error reporting
================================================================ */

import axios from "axios";

/* ────────────────────────────────────────────────────────────────
   CONSTANTS
──────────────────────────────────────────────────────────────── */
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

// Model priority: small is faster/cheaper, falls back to 7b on rate-limit
const MISTRAL_MODELS  = ["mistral-small-latest", "open-mistral-7b"];

// Exponential back-off config (ms)
const RETRY_DELAYS = [500, 1500];

/* ────────────────────────────────────────────────────────────────
   TOKEN USAGE TRACKER — lightweight in-process counter
──────────────────────────────────────────────────────────────── */
let _tokenStats = { promptTokens: 0, completionTokens: 0, calls: 0, errors: 0 };

export function getTokenStats() {
  return { ..._tokenStats };
}

export function resetTokenStats() {
  _tokenStats = { promptTokens: 0, completionTokens: 0, calls: 0, errors: 0 };
}

/* ────────────────────────────────────────────────────────────────
   CALL MISTRAL AI WITH RETRY + FALLBACK
──────────────────────────────────────────────────────────────── */
export async function callMistral(messages, options = {}) {
  if (!MISTRAL_API_KEY) {
    return {
      reply: null,
      model: null,
      error: new Error("MISTRAL_API_KEY not configured in environment"),
    };
  }

  const {
    max_tokens  = 700,
    temperature = 0.2,
    timeout     = 30000,
  } = options;

  let lastError = null;

  for (let modelIdx = 0; modelIdx < MISTRAL_MODELS.length; modelIdx++) {
    const model = MISTRAL_MODELS[modelIdx];

    for (let attempt = 0; attempt <= 1; attempt++) {
      // Back-off before retry
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1] ?? 1000));
      }

      try {
        const response = await axios.post(
          MISTRAL_API_URL,
          { model, messages, temperature, max_tokens },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${MISTRAL_API_KEY}`,
            },
            timeout,
          }
        );

        const reply =
          response.data.choices?.[0]?.message?.content ||
          "Kuch problem ho gayi. Please dobara try karein.";

        // Track token usage
        const usage = response.data.usage || {};
        _tokenStats.promptTokens     += usage.prompt_tokens     || 0;
        _tokenStats.completionTokens += usage.completion_tokens || 0;
        _tokenStats.calls++;

        // Log usage at debug level for monitoring
        if (usage.total_tokens) {
          console.debug(`[Mistral] ${model} | tokens: ${usage.total_tokens} (P:${usage.prompt_tokens} C:${usage.completion_tokens})`);
        }

        return { reply, model, error: null };

      } catch (err) {
        lastError = err;

        const status = err.response?.status;

        // 429 rate-limit: back off and try next model
        if (status === 429) {
          console.warn(`⚠️  [Mistral] Rate limit on ${model} (attempt ${attempt + 1}) — ${attempt === 0 ? "retrying" : "trying next model"}`);
          if (attempt === 0) continue;   // retry same model once
          break;                          // move to next model
        }

        // 5xx server errors: retry once
        if (status >= 500 && attempt === 0) {
          console.warn(`⚠️  [Mistral] Server error ${status} on ${model} — retrying once`);
          continue;
        }

        // Network timeout: retry once
        if (err.code === "ECONNABORTED" && attempt === 0) {
          console.warn(`⚠️  [Mistral] Timeout on ${model} — retrying once`);
          continue;
        }

        // All other errors: stop immediately
        console.error(`🔴 [Mistral] Error (${model}):`, {
          status,
          message: err.response?.data?.message || err.message,
          code:    err.code,
        });
        _tokenStats.errors++;
        break;
      }
    }
  }

  _tokenStats.errors++;
  return { reply: null, model: null, error: lastError };
}

/* ────────────────────────────────────────────────────────────────
   CHECK IF ERROR IS RATE LIMIT
──────────────────────────────────────────────────────────────── */
export function isRateLimitError(error) {
  return error?.response?.status === 429;
}
