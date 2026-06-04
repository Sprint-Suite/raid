"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("index.html has a hidden Return-to-Suite button + the snippet", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  assert.match(html, /data-suite-return/, "button marker present");
  assert.match(html, /\shidden(\s|>)/, "button ships hidden");
  assert.match(html, /\/auth-client\/suite-return\.js/, "snippet included");
});
