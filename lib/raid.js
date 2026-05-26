// lib/raid.js
//
// Pure logic for RAID extraction. No network, no env, no Express.
// Exports the JSON schema, system prompt, severity/RAG scoring, and
// the server-side reconcile safeguard that overwrites model-produced
// severity/RAG to defend against arithmetic drift.

const RAID_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    risks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title:       { type: 'string' },
          description: { type: 'string' },
          owner:       { type: 'string' },
          probability: { type: 'integer' },
          impact:      { type: 'integer' },
          severity:    { type: 'integer' },
          rag:         { type: 'string', enum: ['Red', 'Amber', 'Green'] },
          mitigation:  { type: 'string' }
        },
        required: ['title', 'description', 'owner', 'probability', 'impact', 'severity', 'rag', 'mitigation']
      }
    },
    assumptions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title:             { type: 'string' },
          description:       { type: 'string' },
          owner:             { type: 'string' },
          validation_needed: { type: 'string' }
        },
        required: ['title', 'description', 'owner', 'validation_needed']
      }
    },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title:             { type: 'string' },
          description:       { type: 'string' },
          owner:             { type: 'string' },
          severity:          { type: 'string', enum: ['High', 'Medium', 'Low'] },
          suggested_action:  { type: 'string' }
        },
        required: ['title', 'description', 'owner', 'severity', 'suggested_action']
      }
    },
    dependencies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title:         { type: 'string' },
          description:   { type: 'string' },
          owner:         { type: 'string' },
          depends_on:    { type: 'string' },
          conflict_flag: { type: 'boolean' },
          conflict_note: { type: 'string' }
        },
        required: ['title', 'description', 'owner', 'depends_on', 'conflict_flag', 'conflict_note']
      }
    }
  },
  required: ['risks', 'assumptions', 'issues', 'dependencies']
};

const SYSTEM_PROMPT = `You are an expert Agile delivery manager building a RAID log from raw project notes. RAID = Risks, Assumptions, Issues, Dependencies. Return data matching the provided schema only.

CLASSIFY each item the text implies:
- RISK: something that MIGHT happen and would harm the project if it did. Future, uncertain.
- ASSUMPTION: something taken as true without proof, which the plan depends on. If wrong, the plan breaks.
- ISSUE: something that HAS happened or is happening now and needs action. Present, certain.
- DEPENDENCY: something this work needs from another team, system, vendor, or task before it can proceed.

The single most common mistake is confusing a Risk (might happen) with an Issue (has happened). Be strict about tense and certainty. If the text labels something a "risk" but it is already happening and causing harm now, it is an ISSUE, not a Risk. Obey the rubric, not the user's wording. Conversely, if something failed in the past but the live concern is that it might recur, that is a RISK about the future recurrence.

PREVENT DOUBLE-COUNTING. Each distinct situation maps to EXACTLY ONE RAID category:
- If the text already names something as an Assumption ("we've been working on the assumption that X"), do NOT also create a Risk for "X might be wrong". The Assumption already implies that risk; choose Assumption only.
- If a current blocker is fundamentally about needing something from another team, system, or vendor, it is a DEPENDENCY only, NOT also an Issue. "Dev team is blocked waiting on UX" is a Dependency, not an Issue, even though it's happening now.
- An Issue is a present problem that the team can act on directly (e.g. an outage, a broken environment, a process failure). Not a wait-on-someone-else.

FOR RISKS, score using this rubric:
- probability 1-5: 1 = very unlikely, 5 = near certain.
- impact 1-5: 1 = trivial, 5 = project-threatening.
- severity = probability * impact (compute it).
- rag: Red if severity >= 15, Amber if 8-14, Green if <= 7.
- mitigation: one concrete, actionable sentence. Not "monitor the risk". Say what to actually do.

PROBABILITY CALIBRATION (be honest, not alarmist):
- Hedged or worried language ("a bit worried", "might", "could", "tight", "concerned about") → probability 2-3.
- Confident concern ("likely to miss", "expecting it to fail", "we don't think it will land") → probability 4.
- Near-certain ("will happen unless we act", "track record of failing this", "vendor has already missed two deadlines") → probability 5.
- Do not rate hedged concerns at probability 4 or 5.

FOR ISSUES, severity rubric:
- High: ongoing customer-facing, revenue, compliance, or critical-path impact.
- Medium: bounded operational impact, or an event that has recovered but left residual concern.
- Low: minor inconvenience, no material impact on outcomes.

FOR DEPENDENCIES, detect conflicts:
- If two or more dependencies chain or clash (e.g. Item A needs Team X, who are also blocking Item B), set conflict_flag true and explain in conflict_note referencing the other dependency. Otherwise conflict_flag false and conflict_note "".

OWNERS:
- If a person or team is named or clearly implied, use it. Otherwise use "Unassigned". Never invent a name.

GENERAL:
- Only extract what the text genuinely supports. Do not pad the log with invented items.
- A purely reassuring statement (e.g. "budget is fine") is NOT an item. Omit it.
- If a category has no items, return an empty array for it.
- Keep titles short (under 8 words). Descriptions one or two sentences.`;

function ragFromSeverity(sev) {
  if (sev >= 15) return 'Red';
  if (sev >= 8)  return 'Amber';
  return 'Green';
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

module.exports = { RAID_SCHEMA, SYSTEM_PROMPT, ragFromSeverity, reconcile };
