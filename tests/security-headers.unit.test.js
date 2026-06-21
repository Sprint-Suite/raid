// tests/security-headers.unit.test.js — unit tests for middleware/securityHeaders.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");
const request = require("supertest");
const { makeSecurityHeaders, DEFAULT_CSP } = require("../middleware/securityHeaders.js");

function makeApp() {
  const app = express();
  app.disable("x-powered-by"); // mirror server.js hardening
  app.use(makeSecurityHeaders());
  app.get("/ping", (_req, res) => res.json({ ok: true }));
  // mirror the real robots.txt route from server.js (served via sendFile)
  app.get("/robots.txt", (_req, res) =>
    res.sendFile(path.join(__dirname, "../public/robots.txt"))
  );
  return app;
}

test("X-Frame-Options is DENY", async () => {
  const res = await request(makeApp()).get("/ping");
  assert.equal(res.headers["x-frame-options"], "DENY");
});

test("X-Content-Type-Options is nosniff", async () => {
  const res = await request(makeApp()).get("/ping");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
});

test("Referrer-Policy is strict-origin-when-cross-origin", async () => {
  const res = await request(makeApp()).get("/ping");
  assert.equal(res.headers["referrer-policy"], "strict-origin-when-cross-origin");
});

test("Strict-Transport-Security contains max-age=31536000 and includeSubDomains", async () => {
  const res = await request(makeApp()).get("/ping");
  const hsts = res.headers["strict-transport-security"];
  assert.ok(hsts, "HSTS header should be present");
  assert.ok(hsts.includes("max-age=31536000"), `HSTS missing max-age=31536000, got: ${hsts}`);
  assert.ok(hsts.includes("includeSubDomains"), `HSTS missing includeSubDomains, got: ${hsts}`);
});

test("Permissions-Policy contains camera=()", async () => {
  const res = await request(makeApp()).get("/ping");
  const pp = res.headers["permissions-policy"];
  assert.ok(pp, "Permissions-Policy header should be present");
  assert.ok(pp.includes("camera=()"), `Permissions-Policy missing camera=(), got: ${pp}`);
});

test("Content-Security-Policy contains script-src 'self'", async () => {
  const res = await request(makeApp()).get("/ping");
  const csp = res.headers["content-security-policy"];
  assert.ok(csp, "CSP header should be present");
  assert.ok(csp.includes("script-src 'self'"), `CSP missing script-src 'self', got: ${csp}`);
});

test("Content-Security-Policy script-src does NOT contain unsafe-inline", async () => {
  const res = await request(makeApp()).get("/ping");
  const csp = res.headers["content-security-policy"];
  // Extract the script-src directive only so we check that directive, not others (e.g. style-src)
  const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) || "";
  assert.ok(
    !scriptSrc.includes("unsafe-inline"),
    `script-src should not contain unsafe-inline, got directive: ${scriptSrc}`
  );
});

test("all 6 headers present on the same response", async () => {
  const res = await request(makeApp()).get("/ping");
  assert.ok(res.headers["x-frame-options"], "x-frame-options missing");
  assert.ok(res.headers["x-content-type-options"], "x-content-type-options missing");
  assert.ok(res.headers["referrer-policy"], "referrer-policy missing");
  assert.ok(res.headers["strict-transport-security"], "strict-transport-security missing");
  assert.ok(res.headers["permissions-policy"], "permissions-policy missing");
  assert.ok(res.headers["content-security-policy"], "content-security-policy missing");
});

test("makeSecurityHeaders: custom CSP override is used", () => {
  const customCsp = "default-src 'none'";
  const { makeSecurityHeaders: msh } = require("../middleware/securityHeaders.js");
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  const next = () => {};
  msh({ contentSecurityPolicy: customCsp })({}, res, next);
  assert.equal(headers["Content-Security-Policy"], customCsp);
});

test("X-Powered-By header is not exposed", async () => {
  const res = await request(makeApp()).get("/ping");
  assert.equal(
    res.headers["x-powered-by"],
    undefined,
    `x-powered-by should be absent, got: ${res.headers["x-powered-by"]}`
  );
});

test("GET /robots.txt returns 200", async () => {
  const res = await request(makeApp()).get("/robots.txt");
  assert.equal(res.status, 200, `expected 200, got ${res.status}`);
  assert.match(res.text, /User-agent: \*/, "robots.txt should contain a User-agent line");
});

test("DEFAULT_CSP export contains all required directives", () => {
  assert.ok(DEFAULT_CSP.includes("default-src 'self'"), "default-src 'self' missing");
  assert.ok(DEFAULT_CSP.includes("script-src 'self'"), "script-src 'self' missing");
  assert.ok(DEFAULT_CSP.includes("frame-ancestors 'none'"), "frame-ancestors 'none' missing");
  assert.ok(DEFAULT_CSP.includes("object-src 'none'"), "object-src 'none' missing");
  assert.ok(DEFAULT_CSP.includes("form-action 'self'"), "form-action 'self' missing");
  assert.ok(DEFAULT_CSP.includes("base-uri 'self'"), "base-uri 'self' missing");
});
