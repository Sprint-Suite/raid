// tests/extractUi.unit.test.js
//
// Unit tests for the pure extract-response → UI-text helpers. Loaded the same
// way as tests/exports.unit.test.js: read the browser IIFE source and run it
// with a fake `window`.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'extractUi.js'), 'utf8');
const sandbox = { window: {} };
new Function('window', SRC)(sandbox.window);
const { messageFor, renderNote } = sandbox.window.RaidExtractUi;

test('402 maps to a limit-reached message', () => {
  assert.match(messageFor(402).error, /limit/i);
  assert.equal(messageFor(402).reload, undefined);
});

test('403 maps to a no-access message mentioning the dashboard', () => {
  assert.match(messageFor(403).error, /dashboard/i);
});

test('503 maps to a temporarily-unavailable message', () => {
  assert.match(messageFor(503).error, /unavailable/i);
});

test('401 still signals reload (preserved behaviour)', () => {
  assert.equal(messageFor(401).reload, true);
  assert.match(messageFor(401).error, /redirect/i);
});

test('preserved status mappings still resolve', () => {
  assert.match(messageFor(502).error, /Extraction failed/);
  assert.match(messageFor(429).error, /Too many requests/);
  assert.match(messageFor(400).error, /rejected/);
});

test('unmapped/success status returns null', () => {
  assert.equal(messageFor(200), null);
  assert.equal(messageFor(418), null);
});

test('renderNote shows a count with correct pluralisation', () => {
  assert.equal(renderNote(3), '<p class="quota-note">3 extracts left this month.</p>');
  assert.equal(renderNote(1), '<p class="quota-note">1 extract left this month.</p>');
});

test('renderNote returns empty string for unlimited (null) or non-number', () => {
  assert.equal(renderNote(null), '');
  assert.equal(renderNote(undefined), '');
});
