// tests/extract-schema.unit.test.js — unit tests for schemas/extract.js
// and the wired validation in lib/extractHandler.js.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractSchema } = require("../schemas/extract.js");
const { createExtractHandler } = require("../lib/extractHandler.js");

// ── Schema unit tests ──────────────────────────────────────────────────────

test("extractSchema: accepts a valid text string of 10+ chars", () => {
  const result = extractSchema.safeParse({ text: "These are project notes." });
  assert.ok(result.success, "valid text should pass");
  assert.equal(result.data.text, "These are project notes.");
});

test("extractSchema: trims whitespace from text", () => {
  const result = extractSchema.safeParse({ text: "  ten chars!!  " });
  assert.ok(result.success, "trimmed text of 10+ chars should pass");
  assert.equal(result.data.text, "ten chars!!");
});

test("extractSchema: rejects text shorter than 10 chars", () => {
  const result = extractSchema.safeParse({ text: "short" });
  assert.ok(!result.success, "short text should fail");
});

// The browser counts text.length (UTF-16 units); the server must agree, or
// input the page accepts is refused. "Fix 🐛 bug" is 10 units but 9 code points.
test("extractSchema: counts the minimum in UTF-16 units, as the browser does", () => {
  assert.ok(extractSchema.safeParse({ text: "Fix 🐛 bug" }).success, "10 UTF-16 units should pass");
  assert.ok(!extractSchema.safeParse({ text: "Fix 🐛 bu" }).success, "9 UTF-16 units should fail");
});

test("extractSchema: rejects text that is only whitespace (trims to empty)", () => {
  const result = extractSchema.safeParse({ text: "         " });
  assert.ok(!result.success, "whitespace-only text should fail after trim");
});

test("extractSchema: rejects missing text field", () => {
  const result = extractSchema.safeParse({});
  assert.ok(!result.success, "missing text should fail");
});

test("extractSchema: rejects non-string text", () => {
  const result = extractSchema.safeParse({ text: 42 });
  assert.ok(!result.success, "non-string text should fail");
});

test("extractSchema: strips unknown keys", () => {
  const result = extractSchema.safeParse({ text: "These are project notes.", extra: "ignored" });
  assert.ok(result.success);
  assert.equal(result.data.extra, undefined, "unknown keys should be stripped");
});

// ── Route-level validation integration tests ──────────────────────────────
// These test that extractHandler returns 400 for invalid input and does NOT
// consume quota.

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

function deps(overrides = {}) {
  return {
    auth: { consume: async () => ({ ok: true, remaining: 24 }) },
    extract: async () => ({ risks: [], assumptions: [], issues: [], dependencies: [] }),
    apiKey: "sk-test",
    model: "claude-sonnet-4-5",
    ...overrides,
  };
}

test("extractHandler: rejects missing text with 400 and never consumes", async () => {
  let consumed = false;
  const handler = createExtractHandler(deps({
    auth: { consume: async () => { consumed = true; return { ok: true }; } },
  }));
  const res = mockRes();
  await handler({ centralSessionId: "s", body: {} }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(consumed, false);
  assert.ok(res.body.error, "should have an error message");
});

test("extractHandler: rejects text that is only whitespace with 400", async () => {
  const handler = createExtractHandler(deps());
  const res = mockRes();
  await handler({ centralSessionId: "s", body: { text: "   " } }, res);
  assert.equal(res.statusCode, 400);
});

test("extractHandler: rejects non-string text with 400", async () => {
  const handler = createExtractHandler(deps());
  const res = mockRes();
  await handler({ centralSessionId: "s", body: { text: 12345 } }, res);
  assert.equal(res.statusCode, 400);
});

test("extractHandler: accepts trimmed text of exactly 10 chars", async () => {
  const handler = createExtractHandler(deps());
  const res = mockRes();
  // "1234567890" = 10 chars; after trim still 10
  await handler({ centralSessionId: "s", body: { text: "1234567890" } }, res);
  assert.equal(res.statusCode, 200);
});

test("extractHandler: accepts 10 UTF-16 units containing an emoji", async () => {
  const handler = createExtractHandler(deps());
  const res = mockRes();
  await handler({ centralSessionId: "s", body: { text: "Fix 🐛 bug" } }, res);
  assert.equal(res.statusCode, 200);
});

test("extractHandler: passes coerced (trimmed) text to extract()", async () => {
  let receivedText = null;
  const handler = createExtractHandler(deps({
    extract: async (t) => { receivedText = t; return { risks: [] }; },
  }));
  const res = mockRes();
  await handler({ centralSessionId: "s", body: { text: "  These are project notes.  " } }, res);
  assert.equal(receivedText, "These are project notes.", "extract() receives trimmed text");
});
