#!/usr/bin/env node
/**
 * RAID /extract endpoint
 * ------------------------------------------------------------
 * POST /extract  { "text": "<raw project notes>" }
 *   -> 200 { risks:[], assumptions:[], issues:[], dependencies:[] }
 *
 * Uses Anthropic's native Structured Outputs (output_format: json_schema)
 * for grammar-constrained, schema-valid JSON. Adds two cheap safeguards:
 *   1. server-side recompute of risk severity + RAG (catches model drift)
 *   2. one retry if the call/parse fails, then a clean 502
 *
 * RUN:
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   node extract-server.mjs
 *   # then in another terminal:
 *   ENDPOINT=http://localhost:3000/extract node raid-test.mjs
 * ------------------------------------------------------------
 */

import express from "express";

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.RAID_MODEL || "claude-sonnet-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ---- RAID JSON schema (additionalProperties:false everywhere for strictness) ----
const RAID_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    risks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          owner: { type: "string" },
          probability: { type: "integer", minimum: 1, maximum: 5 },
          impact: { type: "integer", minimum: 1, maximum: 5 },
          severity: { type: "integer", minimum: 1, maximum: 25 },
          rag: { type: "string", enum: ["Red", "Amber", "Green"] },
          mitigation: { type: "string" },
        },
        required: ["title", "description", "owner", "probability", "impact", "severity", "rag", "mitigation"],
      },
    },
    assumptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          owner: { type: "string" },
          validation_needed: { type: "string" },
        },
        required: ["title", "description", "owner", "validation_needed"],
      },
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          owner: { type: "string" },
          severity: { type: "string", enum: ["High", "Medium", "Low"] },
          suggested_action: { type: "string" },
        },
        required: ["title", "description", "owner", "severity", "suggested_action"],
      },
    },
    dependencies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          owner: { type: "string" },
          depends_on: { type: "string" },
          conflict_flag: { type: "boolean" },
          conflict_note: { type: "string" },
        },
        required: ["title", "description", "owner", "depends_on", "conflict_flag", "conflict_note"],
      },
    },
  },
  required: ["risks", "assumptions", "issues", "dependencies"],
};

// ---- The system prompt: your delivery expertise, encoded ----
const SYSTEM_PROMPT = `You are an expert Agile delivery manager building a RAID log from raw project notes. RAID = Risks, Assumptions, Issues, Dependencies. Return data matching the provided schema only.

CLASSIFY each item the text implies:
- RISK: something that MIGHT happen and would harm the project if it did. Future, uncertain.
- ASSUMPTION: something taken as true without proof, which the plan depends on. If wrong, the plan breaks.
- ISSUE: something that HAS happened or is happening now and needs action. Present, certain.
- DEPENDENCY: something this work needs from another team, system, vendor, or task before it can proceed.

The single most common mistake is confusing a Risk (might happen) with an Issue (has happened). Be strict about tense and certainty. If the text labels something a "risk" but it is already happening and causing harm now, it is an ISSUE, not a Risk. Obey the rubric, not the user's wording. Conversely, if something failed in the past but the live concern is that it might recur, that is a RISK about the future recurrence.

FOR RISKS, score using this rubric:
- probability 1-5: 1 = very unlikely, 5 = near certain.
- impact 1-5: 1 = trivial, 5 = project-threatening.
- severity = probability * impact (compute it).
- rag: Red if severity >= 15, Amber if 8-14, Green if <= 7.
- mitigation: one concrete, actionable sentence. Not "monitor the risk". Say what to actually do.

FOR DEPENDENCIES, detect conflicts:
- If two or more dependencies chain or clash (e.g. Item A needs Team X, who are also blocking Item B), set conflict_flag true and explain in conflict_note referencing the other dependency. Otherwise conflict_flag false and conflict_note "".

OWNERS:
- If a person or team is named or clearly implied, use it. Otherwise use "Unassigned". Never invent a name.

GENERAL:
- Only extract what the text genuinely supports. Do not pad the log with invented items.
- A purely reassuring statement (e.g. "budget is fine") is NOT an item. Omit it.
- If a category has no items, return an empty array for it.
- Keep titles short (under 8 words). Descriptions one or two sentences.`;

// ---- Safeguard: recompute severity + RAG so model arithmetic can't embarrass you ----
function ragFromSeverity(sev) {
  if (sev >= 15) return "Red";
  if (sev >= 8) return "Amber";
  return "Green";
}
function reconcile(data) {
  for (const r of data.risks || []) {
    if (Number.isInteger(r.probability) && Number.isInteger(r.impact)) {
      r.severity = r.probability * r.impact;
      r.rag = ragFromSeverity(r.severity);
    }
  }
  return data;
}

// ---- Anthropic call using native structured outputs ----
async function extractOnce(text) {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "structured-outputs-2025-11-13",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
      output_format: { type: "json_schema", schema: RAID_SCHEMA },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 300)}`);
  }

  const body = await res.json();
  // With structured outputs the JSON lands in the first text block.
  const textBlock = (body.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text block in response");
  return JSON.parse(textBlock.text);
}

// retry-once wrapper
async function extract(text) {
  try {
    return reconcile(await extractOnce(text));
  } catch (err) {
    console.warn("extract attempt 1 failed:", err.message, "- retrying once");
    return reconcile(await extractOnce(text)); // throws to caller if this also fails
  }
}

// ---- Server ----
const app = express();
app.use(express.json({ limit: "1mb" }));

app.post("/extract", async (req, res) => {
  const text = req.body?.text;
  if (typeof text !== "string" || text.trim().length < 10) {
    return res.status(400).json({ error: "Provide 'text' (at least 10 chars) of project notes." });
  }
  if (!API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not set on the server." });
  }
  try {
    const raid = await extract(text);
    res.json(raid);
  } catch (err) {
    console.error("extract failed twice:", err.message);
    res.status(502).json({ error: "Extraction failed. Try rephrasing the notes and resubmit." });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true, model: MODEL }));

app.listen(PORT, () => console.log(`RAID /extract listening on :${PORT} (model ${MODEL})`));

export { reconcile, ragFromSeverity, RAID_SCHEMA, SYSTEM_PROMPT };

