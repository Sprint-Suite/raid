// schemas/extract.js — JSON API body schema for POST /extract.
// This route keeps its bespoke 400 body (asserted by existing tests);
// validation is done via inline safeParse in extractHandler.js.
const { z } = require("zod");

// text must be at least 10 chars after trim, counted in UTF-16 units to match
// the browser's text.length. zod >= 4.5 .min() counts code points instead.
const extractSchema = z.object({
  text: z
    .string()
    .trim()
    .refine((t) => t.length >= 10),
});

module.exports = { extractSchema };
