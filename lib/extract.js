// lib/extract.js
//
// The only place network code lives. Calls the Anthropic Messages API
// with native structured outputs (now GA — no beta header) and returns
// the parsed RAID JSON. One retry on any failure, then surfaces to caller.

const { RAID_SCHEMA, reconcile, SYSTEM_PROMPT } = require('./raid.js');
const { logger } = require('./logger.js');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

async function extractOnce(text, { apiKey, model }) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
      output_config: {
        format: { type: 'json_schema', schema: RAID_SCHEMA }
      }
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 300)}`);
  }

  const body = await res.json();
  const textBlock = (body.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text block in response');
  return JSON.parse(textBlock.text);
}

async function extract(text, options) {
  try {
    return reconcile(await extractOnce(text, options));
  } catch (err) {
    logger.warn({ err: err.message }, 'extract attempt 1 failed - retrying once');
    return reconcile(await extractOnce(text, options));
  }
}

module.exports = { extract };
