// tests/exports.unit.test.js
//
// Unit tests for the three export formats. Pins headers, row count,
// CSV quoting, Markdown structure, and Jira priority mapping.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const EXPORTS_PATH = path.join(__dirname, '..', 'public', 'js', 'exports.js');
const src = fs.readFileSync(EXPORTS_PATH, 'utf8');
const sandbox = { window: {} };
new Function('window', src)(sandbox.window);
const { toMarkdown, toCSV, toJiraCSV } = sandbox.window.RaidExports;

const FIXTURE = {
  risks: [
    { title: 'Vendor late', description: 'Vendor may miss date', owner: 'Sarah',
      probability: 4, impact: 4, severity: 16, rag: 'Red', mitigation: 'Confirm by Friday' }
  ],
  assumptions: [
    { title: 'Data is clean', description: 'Assumed clean', owner: 'Unassigned',
      validation_needed: 'Run a spot check' }
  ],
  issues: [
    { title: 'Staging down', description: 'Blocking testing', owner: 'Platform',
      severity: 'High', suggested_action: 'Page on-call' }
  ],
  dependencies: [
    { title: 'Need migration script', description: 'Required for go-live', owner: 'Dev team',
      depends_on: 'Platform team', conflict_flag: false, conflict_note: '' },
    { title: 'A11y audit', description: 'Compliance gate', owner: 'Compliance',
      depends_on: 'UX team', conflict_flag: true, conflict_note: 'UX team blocks design system too' }
  ]
};

test('toMarkdown: produces 4 section headings', () => {
  const md = toMarkdown(FIXTURE);
  assert.match(md, /^# RAID Log/m);
  assert.match(md, /^## Risks/m);
  assert.match(md, /^## Assumptions/m);
  assert.match(md, /^## Issues/m);
  assert.match(md, /^## Dependencies/m);
});

test('toMarkdown: includes scoring numbers for risks', () => {
  const md = toMarkdown(FIXTURE);
  assert.ok(md.includes('| 4 | 4 | 16 | Red |'), 'risk row should include P/I/Sev/RAG');
});

test('toMarkdown: empty section renders "No items detected."', () => {
  const empty = { risks: [], assumptions: [], issues: [], dependencies: [] };
  const md = toMarkdown(empty);
  const matches = md.match(/_No items detected\._/g) || [];
  assert.equal(matches.length, 4);
});

test('toCSV: header has 15 columns including SeverityScore and SeverityLabel', () => {
  const csv = toCSV(FIXTURE);
  const firstLine = csv.split('\n')[0];
  const cols = firstLine.split(',');
  assert.equal(cols.length, 15);
  assert.equal(cols[0], 'Type');
  assert.ok(firstLine.includes('SeverityScore'));
  assert.ok(firstLine.includes('SeverityLabel'));
});

test('toCSV: one row per RAID item plus header', () => {
  const csv = toCSV(FIXTURE);
  const lines = csv.split('\n');
  // 1 header + 1 risk + 1 assumption + 1 issue + 2 dependencies = 6
  assert.equal(lines.length, 6);
});

test('toCSV: severity numeric in SeverityScore for risks, label in SeverityLabel for issues', () => {
  const csv = toCSV(FIXTURE);
  const lines = csv.split('\n');
  const riskLine = lines.find((l) => l.startsWith('Risk,'));
  const issueLine = lines.find((l) => l.startsWith('Issue,'));
  assert.ok(riskLine.includes(',16,Red,,'), 'risk should have score=16, RAG=Red, empty SeverityLabel');
  assert.ok(issueLine.includes(',,,High,'), 'issue should have empty score+RAG, label=High');
});

test('toCSV: cells with commas are quoted', () => {
  const data = {
    risks: [], assumptions: [], issues: [],
    dependencies: [{ title: 'a, b', description: '', owner: '', depends_on: 'x', conflict_flag: false, conflict_note: '' }]
  };
  const csv = toCSV(data);
  assert.ok(csv.includes('"a, b"'), 'comma in cell should be quoted');
});

test('toJiraCSV: header is the Jira-default 6 columns', () => {
  const csv = toJiraCSV(FIXTURE);
  const header = csv.split('\n')[0];
  assert.equal(header, 'Summary,Issue Type,Priority,Description,Assignee,Labels');
});

test('toJiraCSV: priority mapping for Red risk is Highest', () => {
  const csv = toJiraCSV(FIXTURE);
  const lines = csv.split('\n');
  const riskLine = lines.find((l) => l.startsWith('Vendor late,'));
  assert.ok(riskLine.includes('Risk,Highest,'), 'Red risk should map to Highest');
});

test('toJiraCSV: priority mapping for conflict dependency is Highest', () => {
  const csv = toJiraCSV(FIXTURE);
  const lines = csv.split('\n');
  const confLine = lines.find((l) => l.startsWith('A11y audit,'));
  assert.ok(confLine.includes('Task,Highest,'), 'conflict dependency should map to Highest');
});

test('toJiraCSV: Unassigned owners become empty Assignee', () => {
  // The assumption row has owner 'Unassigned' which should map to an empty
  // Assignee column. The row is multi-line (description contains \n\n), so
  // we check the raw substring pattern rather than split-by-line.
  // Expected end of row: `,,raid-extracted assumption` (empty Assignee, labels).
  const csv = toJiraCSV(FIXTURE);
  assert.ok(
    csv.includes(',,raid-extracted assumption'),
    'Unassigned assumption owner should render as empty Assignee cell'
  );
});
