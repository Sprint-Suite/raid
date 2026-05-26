#!/usr/bin/env node
// tests/harness.test.js
//
// Live-API regression suite. Three fixed inputs (easy/realistic/adversarial)
// posted to /extract. Asserts the things that matter for a RAID log:
// per-category counts, RAG bands, issue severities, and the conflict flag.
// Free-text fields are intentionally NOT asserted (model wording varies).
//
// USAGE:
//   ENDPOINT=http://localhost:3003/extract node tests/harness.test.js

const ENDPOINT = process.env.ENDPOINT || 'http://localhost:3003/extract';

const CASES = [
  {
    name: '1. Easy (clean, well-separated)',
    text:
      'Project status: The vendor API integration is at risk because the ' +
      'supplier has not confirmed their delivery date and we think it is ' +
      'unlikely to land on time. We are assuming the finance team will sign ' +
      'off the budget by Friday. The staging environment is currently down, ' +
      'which is blocking all testing. We also need the data migration script ' +
      'from the platform team before we can go live.',
    expect: {
      counts: { risks: 1, assumptions: 1, issues: 1, dependencies: 1 },
      riskRag: ['Red'],
      issueSeverity: ['High'],
      anyConflict: false
    }
  },
  {
    name: '2. Realistic (waffle, buried items, dual dependency)',
    text:
      'Quick update from the sync. Things are mostly fine but a few bits to ' +
      'flag. Sarah mentioned the new auth provider migration is going ok ' +
      'though honestly I\'m a bit worried we run out of runway before the ' +
      'contract renewal in March, it\'s tight. We\'ve been working on the ' +
      'assumption that the existing user data is clean but nobody\'s actually ' +
      'checked. Oh and the third-party payment gateway had an outage ' +
      'yesterday that knocked out checkout for two hours, that\'s sorted now ' +
      'but it spooked the client. Dev team are blocked waiting on the design ' +
      'system update from the UX folks, and separately the same UX team owe ' +
      'us the accessibility audit which is also holding up the compliance ' +
      'workstream. Budget\'s fine for now.',
    expect: {
      counts: { risks: 1, assumptions: 1, issues: 1, dependencies: 2 },
      riskRag: ['Amber'],
      issueSeverity: ['Medium'],
      anyConflict: true
    }
  },
  {
    name: '3. Adversarial (misclassification bait, thin signal)',
    text:
      'The server migration already failed once last week so there\'s a chance ' +
      'it could fail again on the next attempt. We\'re taking it as given that ' +
      'the rollback procedure works, we\'ve never had to use it in anger. The ' +
      'client keeps saying they "might" pull funding if the next demo goes ' +
      'badly, which would obviously end the project. Legal still haven\'t come ' +
      'back on the data processing agreement and we can\'t onboard the EU ' +
      'users until they do. Everyone keeps calling the slow database a ' +
      '"risk" but it\'s been slow for three weeks now and it\'s actively ' +
      'degrading the user experience today.',
    expect: {
      counts: { risks: 2, assumptions: 1, issues: 1, dependencies: 1 },
      riskRag: ['Amber', 'Amber'],
      issueSeverity: ['High'],
      anyConflict: false
    }
  }
];

const C = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`
};

const TYPES = ['risks', 'assumptions', 'issues', 'dependencies'];

function ragFromSeverity(sev) {
  if (sev >= 15) return 'Red';
  if (sev >= 8) return 'Amber';
  return 'Green';
}

function validateShape(data) {
  const problems = [];
  for (const t of TYPES) {
    if (!Array.isArray(data?.[t])) problems.push(`"${t}" missing or not an array`);
  }
  if (problems.length) return problems;

  (data.risks || []).forEach((r, i) => {
    for (const f of ['title','description','owner','probability','impact','severity','rag','mitigation']) {
      if (r[f] === undefined || r[f] === null) problems.push(`risks[${i}] missing "${f}"`);
    }
    if (Number.isInteger(r.probability) && Number.isInteger(r.impact)) {
      const expectedSev = r.probability * r.impact;
      if (r.severity !== expectedSev) problems.push(`risks[${i}] severity ${r.severity} != ${expectedSev}`);
      const expectedRag = ragFromSeverity(expectedSev);
      if (r.rag !== expectedRag) problems.push(`risks[${i}] rag "${r.rag}" != "${expectedRag}"`);
    }
  });

  (data.dependencies || []).forEach((d, i) => {
    if (d.conflict_flag === undefined) problems.push(`dependencies[${i}] missing "conflict_flag"`);
    if (d.conflict_flag === true && !d.conflict_note) problems.push(`dependencies[${i}] conflict_flag true but empty conflict_note`);
  });

  return problems;
}

function sortedField(arr, field) {
  return (arr || []).map((x) => x[field]).sort();
}

function evaluate(data, expect) {
  const checks = [];
  for (const t of TYPES) {
    const actual = (data?.[t] || []).length;
    checks.push({ label: `count ${t}`, ok: actual === expect.counts[t], detail: `got ${actual}, want ${expect.counts[t]}` });
  }
  const actualRag = sortedField(data.risks, 'rag');
  const wantRag = [...expect.riskRag].sort();
  checks.push({ label: 'risk RAG bands', ok: JSON.stringify(actualRag) === JSON.stringify(wantRag), detail: `got [${actualRag}], want [${wantRag}]` });

  const actualIss = sortedField(data.issues, 'severity');
  const wantIss = [...expect.issueSeverity].sort();
  checks.push({ label: 'issue severities', ok: JSON.stringify(actualIss) === JSON.stringify(wantIss), detail: `got [${actualIss}], want [${wantIss}]` });

  const anyConflict = (data.dependencies || []).some((d) => d.conflict_flag === true);
  checks.push({ label: 'conflict flag', ok: anyConflict === expect.anyConflict, detail: `got ${anyConflict}, want ${expect.anyConflict}` });

  return { checks, passed: checks.every((c) => c.ok) };
}

async function callEndpoint(text) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

async function run() {
  console.log(C.bold(`\nRAID harness  ->  ${ENDPOINT}\n`));
  let totalChecks = 0, passedChecks = 0, casesPassed = 0;

  for (const c of CASES) {
    console.log(C.bold(c.name));
    let data;
    try { data = await callEndpoint(c.text); }
    catch (err) {
      console.log('  ' + C.red(`REQUEST FAILED: ${err.message}`));
      console.log(C.dim('  (is the endpoint running and reachable?)\n'));
      continue;
    }

    const shapeProblems = validateShape(data);
    if (shapeProblems.length) {
      console.log('  ' + C.red('SCHEMA / SCORING PROBLEMS:'));
      shapeProblems.forEach((p) => console.log('    ' + C.red('x ') + p));
    }

    const { checks, passed } = evaluate(data, c.expect);
    for (const ch of checks) {
      totalChecks++;
      if (ch.ok) passedChecks++;
      const mark = ch.ok ? C.green('PASS') : C.red('FAIL');
      const detail = ch.ok ? C.dim(ch.detail) : C.yellow(ch.detail);
      console.log(`  [${mark}] ${ch.label.padEnd(22)} ${detail}`);
    }

    const caseOk = passed && shapeProblems.length === 0;
    if (caseOk) casesPassed++;
    console.log('  ' + (caseOk ? C.green('CASE PASSED') : C.red('CASE FAILED')) + '\n');
  }

  console.log(C.bold('Summary'));
  console.log(`  Cases:  ${casesPassed}/${CASES.length}`);
  console.log(`  Checks: ${passedChecks}/${totalChecks}\n`);
  process.exit(casesPassed === CASES.length ? 0 : 1);
}

run();
