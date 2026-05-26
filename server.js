// server.js
//
// Express entry. Mounts /extract, /health, /build, and static public/.

const express = require('express');
const path = require('node:path');
const { extract } = require('./lib/extract.js');
const { getBuildInfo } = require('./lib/buildInfo.js');

const PORT = process.env.PORT || 3003;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.RAID_MODEL || 'claude-sonnet-4-5';
const BUILD = getBuildInfo(__dirname);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/extract', async (req, res) => {
  const text = req.body?.text;
  if (typeof text !== 'string' || text.trim().length < 10) {
    return res.status(400).json({ error: "Provide 'text' (at least 10 chars) of project notes." });
  }
  if (!API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on the server.' });
  }
  try {
    const raid = await extract(text, { apiKey: API_KEY, model: MODEL });
    res.json(raid);
  } catch (err) {
    console.error('extract failed twice:', err.message);
    res.status(502).json({ error: 'Extraction failed. Try rephrasing the notes and resubmit.' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, model: MODEL }));
app.get('/build', (_req, res) => res.json(BUILD));

app.listen(PORT, () => console.log(`RAID listening on :${PORT} (model ${MODEL})`));
