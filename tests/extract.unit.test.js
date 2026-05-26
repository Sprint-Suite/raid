// tests/extract.unit.test.js
//
// Pure unit tests for lib/raid.js. No network. Pins the scoring
// boundaries and the reconcile safeguard that overwrites bogus
// model-produced severity/RAG values.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ragFromSeverity, reconcile } = require('../lib/raid.js');

test('ragFromSeverity: green band (<= 7)', () => {
  assert.equal(ragFromSeverity(1), 'Green');
  assert.equal(ragFromSeverity(7), 'Green');
});

test('ragFromSeverity: amber band (8-14)', () => {
  assert.equal(ragFromSeverity(8), 'Amber');
  assert.equal(ragFromSeverity(14), 'Amber');
});

test('ragFromSeverity: red band (>= 15)', () => {
  assert.equal(ragFromSeverity(15), 'Red');
  assert.equal(ragFromSeverity(25), 'Red');
});

test('reconcile: overwrites bogus severity with probability * impact', () => {
  const data = {
    risks: [{ probability: 3, impact: 4, severity: 99, rag: 'Green' }],
    assumptions: [], issues: [], dependencies: []
  };
  const out = reconcile(data);
  assert.equal(out.risks[0].severity, 12);
  assert.equal(out.risks[0].rag, 'Amber');
});

test('reconcile: leaves item alone if probability/impact missing', () => {
  const data = {
    risks: [{ severity: 5, rag: 'Green' }],
    assumptions: [], issues: [], dependencies: []
  };
  const out = reconcile(data);
  assert.equal(out.risks[0].severity, 5);
  assert.equal(out.risks[0].rag, 'Green');
});

test('reconcile: empty risks array', () => {
  const data = { risks: [], assumptions: [], issues: [], dependencies: [] };
  assert.doesNotThrow(() => reconcile(data));
});
