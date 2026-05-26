# RAID App - Backend Starter

Two files, the heart of the RAID extraction app.

## Files
- `extract-server.mjs` - Express `/extract` endpoint. Takes raw project notes,
  returns a scored RAID log as schema-valid JSON. Uses Anthropic native
  structured outputs, plus server-side severity/RAG re-validation and one retry.
- `raid-test.mjs` - Test harness. Posts 3 fixed inputs (easy / realistic /
  adversarial) and checks classification counts, RAG bands, issue severities,
  and the dependency conflict flag.

## Run
```bash
npm install express
export ANTHROPIC_API_KEY=sk-ant-...      # your key
node extract-server.mjs                  # starts on :3000

# in a second terminal:
ENDPOINT=http://localhost:3000/extract node raid-test.mjs
```

## Tuning loop
1. Run the harness. Expect case 3 (adversarial) to fail first.
2. Adjust the SYSTEM_PROMPT rubric in extract-server.mjs.
3. Re-run. Repeat until all 3 cases pass. Keep them as regression tests.

## Config (env vars)
- `ANTHROPIC_API_KEY` (required)
- `RAID_MODEL` (default `claude-sonnet-4-5`)
- `PORT` (default 3000)

## Notes
- Structured outputs need the beta header (already set in the code).
- The `/extract` endpoint does NOT persist input. Add a UI note telling
  users not to paste sensitive or classified material (cloud LLM call).
- Next build step: the 4-section UI (reuse sprintpoker styling).

