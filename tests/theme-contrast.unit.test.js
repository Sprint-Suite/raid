// tests/theme-contrast.unit.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { contrastRatio, meetsAA } = require("../lib/contrast");

// sRGB hex equivalents of the Instrument + raid.css oklch tokens.
// Derived via CSS Color 4 oklch→oklab→linear-sRGB→gamma pipeline.
const C = {
  bone:      "#f1f3f5", // --bone      oklch(0.964 0.004 240)
  panel:     "#fdfeff", // --panel     oklch(0.996 0.002 240)
  ink:       "#1a1f24", // --ink       oklch(0.235 0.013 250)
  soft:      "#52575d", // --soft      oklch(0.455 0.012 250)
  faint:     "#7c8186", // --faint     oklch(0.6   0.01  250)
  accentBtn: "#dbab5e", // --accent-btn oklch(0.77 0.11  78)  — amber primary button
  ragRed:    "#cc272e", // --rag-red    oklch(0.55 0.20  25)
  ragAmber:  "#f5ae39", // --rag-amber  oklch(0.80 0.15  75)
  ragAmberOn:"#3e2104", // --rag-amber-on oklch(0.28 0.06 60)
  ragGreen:  "#007938", // --rag-green  oklch(0.50 0.14 152)
  white:     "#ffffff",
};

// All RAG/severity pills are 10.5px bold — NOT "large text" (≥18px or ≥14px bold).
// Standard AA threshold 4.5:1 applies to every pair below.
const BODY = [
  ["ink",       "bone"],        // body copy on background
  ["ink",       "panel"],       // body copy on card surface
  ["soft",      "panel"],       // muted copy on card surface
  ["soft",      "bone"],        // muted copy on background
  ["ink",       "accentBtn"],   // INK label on the amber primary button (white ~3:1 would FAIL)
  ["white",     "ragRed"],      // vivid red pill label
  ["ragAmberOn","ragAmber"],    // dark label on vivid amber pill
  ["white",     "ragGreen"],    // vivid green pill label
];

for (const [fg, bg] of BODY) {
  test(`raid contrast: ${fg} on ${bg} meets AA (4.5:1)`, () => {
    const r = contrastRatio(C[fg], C[bg]);
    assert.ok(meetsAA(C[fg], C[bg]), `${fg} (${C[fg]}) on ${bg} (${C[bg]}) = ${r.toFixed(2)}:1, need 4.5:1`);
  });
}
