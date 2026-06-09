// tests/validate.unit.test.js — unit tests for lib/validate.js middleware.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");
const { validate } = require("../lib/validate.js");

function mockNext() {
  let called = false;
  let calledWith = undefined;
  function next(err) { called = true; calledWith = err; }
  next.called = () => called;
  next.err = () => calledWith;
  return next;
}

test("validate: passes and replaces req.body with parsed data on success", () => {
  const schema = z.object({ name: z.string().trim().min(1) });
  const mw = validate(schema);
  const req = { body: { name: "  Alice  ", extra: "ignored" } };
  const next = mockNext();
  mw(req, {}, next);
  assert.ok(next.called(), "next() should be called");
  assert.equal(next.err(), undefined, "next() should not receive an error");
  assert.equal(req.body.name, "Alice", "body should be coerced (trimmed)");
  assert.equal(req.body.extra, undefined, "unknown keys should be stripped");
});

test("validate: calls next(err) with status=400 and err.fields on failure (no onInvalid)", () => {
  const schema = z.object({ name: z.string().min(1) });
  const mw = validate(schema);
  const req = { body: { name: "" } };
  const next = mockNext();
  mw(req, {}, next);
  const err = next.err();
  assert.ok(err instanceof Error, "next() should receive an Error");
  assert.equal(err.status, 400);
  assert.ok(err.fields, "err.fields should be set");
  assert.ok(Array.isArray(err.fields.name), "err.fields.name should be an array");
});

test("validate: calls onInvalid instead of next when provided and validation fails", () => {
  const schema = z.object({ name: z.string().min(1) });
  let invalidCalled = false;
  let invalidArgs = null;
  function onInvalid(req, res, zodError) {
    invalidCalled = true;
    invalidArgs = { req, res, zodError };
  }
  const mw = validate(schema, { onInvalid });
  const req = { body: { name: "" } };
  const res = {};
  const next = mockNext();
  mw(req, res, next);
  assert.ok(invalidCalled, "onInvalid should be called");
  assert.ok(!next.called(), "next() should NOT be called when onInvalid is provided");
  assert.equal(invalidArgs.req, req);
  assert.equal(invalidArgs.res, res);
  assert.ok(invalidArgs.zodError, "zodError should be passed to onInvalid");
});

test("validate: source option reads from req.query instead of req.body", () => {
  const schema = z.object({ q: z.string().min(1) });
  const mw = validate(schema, { source: "query" });
  const req = { query: { q: "search" }, body: {} };
  const next = mockNext();
  mw(req, {}, next);
  assert.ok(next.called());
  assert.equal(next.err(), undefined);
  assert.equal(req.query.q, "search");
});

test("validate: handles missing body gracefully (treats as empty object)", () => {
  const schema = z.object({ name: z.string().min(1) });
  const mw = validate(schema);
  // body is undefined
  const req = {};
  const next = mockNext();
  mw(req, {}, next);
  const err = next.err();
  assert.ok(err, "should error when body is missing");
  assert.equal(err.status, 400);
});
