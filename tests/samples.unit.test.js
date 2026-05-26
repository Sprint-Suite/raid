// tests/samples.unit.test.js
//
// Sanity checks on the three pre-loaded sample texts: they exist,
// they meet the server's input length rules (>= 10 chars, <= 1MB),
// and they are tagged with the expected names.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const SAMPLES_PATH = path.join(__dirname, '..', 'public', 'js', 'samples.js');

test('samples.js file exists', () => {
  assert.ok(fs.existsSync(SAMPLES_PATH), 'public/js/samples.js must exist');
});

test('samples.js exports 3 named samples meeting length rules', () => {
  // Load samples.js by evaluating it in a sandboxed scope that mimics the
  // browser global. samples.js is plain script (no module wrapper) and
  // attaches its array to window.RAID_SAMPLES.
  const src = fs.readFileSync(SAMPLES_PATH, 'utf8');
  const sandbox = { window: {} };
  const fn = new Function('window', src);
  fn(sandbox.window);

  const samples = sandbox.window.RAID_SAMPLES;
  assert.ok(Array.isArray(samples), 'window.RAID_SAMPLES must be an array');
  assert.equal(samples.length, 3, 'expected exactly 3 samples');

  for (const s of samples) {
    assert.equal(typeof s.name, 'string', 'sample.name must be a string');
    assert.equal(typeof s.text, 'string', 'sample.text must be a string');
    assert.ok(s.text.length >= 10, `sample "${s.name}" must be >= 10 chars`);
    assert.ok(s.text.length <= 1_000_000, `sample "${s.name}" must be <= 1MB`);
  }
});
