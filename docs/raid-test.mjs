#!/usr/bin/env node
/**
 * RAID extraction test harness
 * ------------------------------------------------------------
 * Calls your /extract endpoint with 3 fixed inputs and checks the
 * returned RAID log against expected classification, scoring, and
 * the dependency conflict flag.
 *
 * USAGE:
 *   ENDPOINT=http://localhost:3000/extract node raid-test.mjs
 *
 * Your endpoint must accept:  POST { "text": "<raw notes>" }
 * and return JSON matching the RAID schema:
 *   { risks:[], assumptions:[], issues:[], dependencies:[] }
 *
 * The harness is intentionally LENIENT on wording (titles/descriptions
 * are free text and will vary run to run) and STRICT on the things that
 * actually matter for a RAID log: how many items land in each category,
 * the risk RAG ratings, and whether the UX dependency conflict fires.
 * ------------------------------------------------------------
 */

const ENDPOINT = process.env.ENDPOINT || "http://localhost:3000/extract";

// ---- The three test cases -------------------------------------------------
// Each expectation captures only the things worth asserting on. Free-text
// fields (titles, mitigations) are NOT asserted because they vary; we assert
// counts, RAG bands, issue severities, and the conflict flag.

const CASES = [
  {
    name: "1. Easy (clean, well-separated)",
    text:
      "Project status: The vendor API integration is at risk because the " +
      "supplier has not confirmed their delivery date and we think it is " +
      "unlikely to land on time. We are assuming the finance team will sign " +
      "off the budget by Friday. The staging environment is currently down, " +
      "which is blocking all testing. We also need the data migration script " +
      "from the platform team before we can go live.",
    expect: {
      counts: { risks: 1, assumptions: 1, issues: 1, dependencies: 1 },
      // risk RAG bands expected, order-independent (sorted before compare)
      riskRag: ["Red"],
      issueSeverity: ["High"],
      anyConflict: false,
    },
  },
  {
    name: "2. Realistic (waffle, buried items, dual dependency)",
    text:
      "Quick update from the sync. Things are mostly fine but a few bits to " +
      "flag. Sarah mentioned the new auth provider migration is going ok " +
      "though honestly I'm a bit worried we run out of runway before the " +
      "contract renewal in March, it's tight. We've been working on the " +
      "assumption that the existing user data is clean but nobody's actually " +
      "checked. Oh and the third-party payment gateway had an outage " +
      "yesterday that knocked out checkout for two hours, that's sorted now " +
      "but it spooked the client. Dev team are blocked waiting on the design " +
      "system update from the UX folks, and separately the same UX team owe " +
      "us the accessibility audit which is also holding up the compliance " +
      "workstream. Budget's fine for now.",
    expect: {
      counts: { risks: 1, assumptions: 1, issues: 1, dependencies: 2 },
      riskRag: ["Amber"],
      issueSeverity: ["Medium"],
      anyConflict: true, // the UX team shared-bottleneck must be flagged
    },
  },
  {
    name: "3. Adversarial (misclassification bait, thin signal)",
    text:
      "The server migration already failed once last week so there's a chance " +
      "it could fail again on the next attempt. We're taking it as given that " +
      "the rollback procedure works, we've never had to use it in anger. The " +
      "client keeps saying they \"might\" pull funding if the next demo goes " +
      "badly, which would obviously end the project. Legal still haven't come " +
      "back on the data processing agreement and we can't onboard the EU " +
      "users until they do. Everyone keeps calling the slow database a " +
      "\"risk\" but it's been slow for three weeks now and it's actively " +
      "degrading the user experience today.",
    expect: {
      counts: { risks: 2, assumptions: 1, issues: 1, dependencies: 1 },
      riskRag: ["Amber", "Amber"],
      issueSeverity: ["High"], // the "slow database" must be an Issue, not a Risk
      anyConflict: false,
    },
  },
];

// ---- Helpers --------------------------------------------------------------

const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const TYPES = ["risks", "assumptions", "issues", "dependencies"];

function ragFromSeverity(sev) {
  if (sev >= 15) return "Red";
  if (sev >= 8) return "Amber";
  return "Green";
}

// Validate one item has the required shape per type. Returns array of problems.
function validateShape(data) {
  const problems = [];
  for (const t of TYPES) {
    if (!Array.isArray(data?.[t])) {
      problems.push(`"${t}" is missing or not an array`);
    }
  }
  if (problems.length) return problems; // bail early, nothing else is safe

  (data.risks || []).forEach((r, i) => {
    for (const f of ["title", "description", "owner", "probability", "impact", "severity", "rag", "mitigation"]) {
      if (r[f] === undefined || r[f] === null) problems.push(`risks[${i}] missing "${f}"`);
    }
    if (Number.isInteger(r.probability) && Number.isInteger(r.impact)) {
      const expected = r.probability * r.impact;
      if (r.severity !== expected) {
        problems.push(`risks[${i}] severity ${r.severity} != probability*impact (${expected})`);
      }
      const expectedRag = ragFromSeverity(expected);
      if (r.rag !== expectedRag) {
        problems.push(`risks[${i}] rag "${r.rag}" != expected "${expectedRag}" for severity ${expected}`);
      }
    }
  });

  (data.dependencies || []).forEach((d, i) => {
    if (d.conflict_flag === undefined) problems.push(`dependencies[${i}] missing "conflict_flag"`);
    if (d.conflict_flag === true && !d.conflict_note) {
      problems.push(`dependencies[${i}] conflict_flag true but conflict_note empty`);
    }
  });

  return problems;
}

function sortedSeverities(arr, field) {
  return (arr || []).map((x) => x[field]).sort();
}

// Compare actual vs expected. Returns { checks: [{label, ok, detail}], passed }
function evaluate(data, expect) {
  const checks = [];

  // Counts per category
  for (const t of TYPES) {
    const actual = (data?.[t] || []).length;
    const want = expect.counts[t];
    checks.push({
      label: `count ${t}`,
      ok: actual === want,
      detail: `got ${actual}, want ${want}`,
    });
  }

  // Risk RAG bands (order-independent)
  const actualRag = sortedSeverities(data.risks, "rag");
  const wantRag = [...expect.riskRag].sort();
  checks.push({
    label: "risk RAG bands",
    ok: JSON.stringify(actualRag) === JSON.stringify(wantRag),
    detail: `got [${actualRag}], want [${wantRag}]`,
  });

  // Issue severities (order-independent)
  const actualIss = sortedSeverities(data.issues, "severity");
  const wantIss = [...expect.issueSeverity].sort();
  checks.push({
    label: "issue severities",
    ok: JSON.stringify(actualIss) === JSON.stringify(wantIss),
    detail: `got [${actualIss}], want [${wantIss}]`,
  });

  // Conflict flag presence (the hero feature)
  const anyConflict = (data.dependencies || []).some((d) => d.conflict_flag === true);
  checks.push({
    label: "dependency conflict flag",
    ok: anyConflict === expect.anyConflict,
    detail: `got ${anyConflict}, want ${expect.anyConflict}`,
  });

  return { checks, passed: checks.every((c) => c.ok) };
}

export { validateShape, evaluate, ragFromSeverity, CASES };

async function callEndpoint(text) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

// ---- Runner ---------------------------------------------------------------

async function run() {
  console.log(C.bold(`\nRAID harness  ->  ${ENDPOINT}\n`));
  let totalChecks = 0;
  let passedChecks = 0;
  let casesPassed = 0;

  for (const c of CASES) {
    console.log(C.bold(c.name));
    let data;
    try {
      data = await callEndpoint(c.text);
    } catch (err) {
      console.log("  " + C.red(`REQUEST FAILED: ${err.message}`));
      console.log(C.dim("  (is the endpoint running and reachable?)\n"));
      continue;
    }

    // Schema / arithmetic validation first
    const shapeProblems = validateShape(data);
    if (shapeProblems.length) {
      console.log("  " + C.red("SCHEMA / SCORING PROBLEMS:"));
      shapeProblems.forEach((p) => console.log("    " + C.red("x ") + p));
    }

    // Expectation checks
    const { checks, passed } = evaluate(data, c.expect);
    for (const ch of checks) {
      totalChecks++;
      if (ch.ok) passedChecks++;
      const mark = ch.ok ? C.green("PASS") : C.red("FAIL");
      const detail = ch.ok ? C.dim(ch.detail) : C.yellow(ch.detail);
      console.log(`  [${mark}] ${ch.label.padEnd(26)} ${detail}`);
    }

    const caseOk = passed && shapeProblems.length === 0;
    if (caseOk) casesPassed++;
    console.log(
      "  " +
        (caseOk ? C.green("CASE PASSED") : C.red("CASE FAILED")) +
        "\n"
    );
  }

  console.log(C.bold("Summary"));
  console.log(`  Cases:  ${casesPassed}/${CASES.length}`);
  console.log(`  Checks: ${passedChecks}/${totalChecks}`);
  console.log(
    "\n" +
      C.dim(
        "Make-or-break checks: case 2 conflict flag, case 3 issue severities,\n" +
          "case 3 risk count (the 'failed once' item must be a Risk not an Issue).\n"
      )
  );

  process.exit(casesPassed === CASES.length ? 0 : 1);
}

// Only hit the network when run directly (not when imported for unit tests)
import { argv } from "node:process";
if (argv[1] && argv[1].endsWith("raid-test.mjs")) {
  run();
}

