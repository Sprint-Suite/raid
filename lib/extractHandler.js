// lib/extractHandler.js
//
// The POST /extract request lifecycle, factored out of server.js so the hub
// consume gate is unit-testable without HTTP. consume() runs BEFORE the paid
// extract() call: it is the atomic check-and-increment that both authorises
// and reserves a quota unit. On a hub failure we FAIL CLOSED (503) — the paid
// Anthropic call never runs without a verified consume. No refund on a later
// extract() failure (documented in the spec).

const { logger } = require('./logger.js');
const { extractSchema } = require('../schemas/extract.js');

function createExtractHandler({ auth, extract, apiKey, model }) {
  return async function extractHandler(req, res) {
    // Validate via inline safeParse to preserve the bespoke 400 error body.
    const parsed = extractSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Provide 'text' (at least 10 chars) of project notes." });
    }
    const text = parsed.data.text;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on the server.' });
    }

    const gate = await auth.consume(req.centralSessionId);
    if (!gate.ok) {
      if (gate.reason === 'quota_exceeded') {
        return res.status(402).json({ error: 'Monthly extract limit reached.', remaining: 0 });
      }
      if (gate.reason === 'not_entitled') {
        return res.status(403).json({ error: 'No access to RAID.' });
      }
      // unreachable, error, or any other reason → fail closed
      return res.status(503).json({ error: 'Service temporarily unavailable.' });
    }

    try {
      const raid = await extract(text, { apiKey, model });
      return res.json({ ...raid, remaining: gate.remaining });
    } catch (err) {
      (req.log || logger).error({ err }, 'extract failed twice');
      return res.status(502).json({ error: 'Extraction failed. Try rephrasing the notes and resubmit.' });
    }
  };
}

module.exports = { createExtractHandler };
