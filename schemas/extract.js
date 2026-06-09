// schemas/extract.js — JSON API body schema for POST /extract.
// This route keeps its bespoke 400 body (asserted by existing tests);
// validation is done via inline safeParse in extractHandler.js.
const { z } = require("zod");

// text must be a non-empty string of at least 10 chars (after trim).
const extractSchema = z.object({
  text: z.string().trim().min(10),
});

module.exports = { extractSchema };
