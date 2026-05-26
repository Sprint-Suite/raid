# HANDOVER.md - RAID App Task Brief

This is the kickoff brief for Claude Code. Read `CLAUDE.md` first for project
context and the decisions already locked. This file is the **task list**.

The backend code (`extract-server.mjs`) and test harness (`raid-test.mjs`) already
exist and the pure logic has been verified (schema, scoring bands, the reconcile
safeguard, and the prompt rules all checked out in isolation). What has NOT been
done is a live end-to-end run against the real Anthropic API. That is task 1.

---

## Prerequisites (verify before starting)

- Node.js 18+ (`node --version`). The code uses built-in `fetch`.
- An Anthropic API key in the environment as `ANTHROPIC_API_KEY`. Never commit it.
- `npm install express` has been run in the project folder.

---

## Task 1: Get the backend running and passing all 3 tests

**Goal**: server starts, `/health` is ok, harness goes all-green.

Steps:
1. `npm install express` if not already done.
2. Ensure `ANTHROPIC_API_KEY` is set in the environment.
3. Start the server: `node extract-server.mjs`. Confirm `/health` returns
   `{"ok":true,...}` before spending API calls.
4. Run the harness against it: `node raid-test.mjs`
   (it defaults to `http://localhost:3000/extract`).
5. **Expect case 3 (adversarial) to fail first.** That is normal and expected.

**Tuning loop** (this is the real work):
- Read which checks failed.
- Edit the `SYSTEM_PROMPT` constant in `extract-server.mjs` to sharpen the rubric.
- Restart the server so it picks up the change.
- Re-run the harness.
- Repeat until all 3 cases pass. Keep the 3 cases as regression tests; re-run
  them after every prompt change so a fix for one case does not break another.

The 3 make-or-break checks to watch:
- Case 2: the dependency **conflict flag** must fire (same UX team blocks two
  workstreams).
- Case 3: the slow database must be classified as an **Issue**, not a Risk,
  despite the text calling it a "risk".
- Case 3: the "failed once, might fail again" item must be a **Risk** (count of
  risks = 2), not an Issue.

**If a call fails with a 400** about the model or the `anthropic-beta` header:
the model name or beta date has moved. Check docs.claude.com for current values
and update the constants at the top of `extract-server.mjs`. Do not guess.

---

## Task 2: Build the Lean MVP front end

Only start this once Task 1 is all-green.

**Goal**: the thinnest possible UI that delivers the hero demo: paste messy text,
click one button, see a clean 4-section scored RAID log.

Requirements:
- A single page: a large textarea, one "Generate RAID" button, and a results area.
- Results render as 4 sections: Risks, Assumptions, Issues, Dependencies.
- Risks show probability, impact, severity, and a RAG colour (Red/Amber/Green).
- Dependencies with `conflict_flag: true` are visually highlighted, with the
  `conflict_note` shown. This is the showcase feature; make it noticeable.
- A visible one-line notice near the textarea: tell users not to paste sensitive
  or classified material, since the text is sent to a cloud LLM and not stored.
- Calls the existing `POST /extract` endpoint. Do not change the endpoint
  contract: it takes `{ "text": "..." }` and returns the RAID JSON.
- Match the visual style of the existing suite (sprintpoker.uk / sprintretro.uk).
  ASK the user for the stack/CSS approach if it is not already in the repo.
- Lean scope only: no save, no export, no accounts, no database. In-memory only.

**Hero demo to design backwards from**: a cluttered paragraph of project waffle
goes in, one click, and a clean scored RAID log appears with the dependency
conflict highlighted. The before/after contrast is the whole pitch. Make that
moment land.

---

## Task 3 (optional, only if asked): first enhancements

Do NOT do these unprompted. They are the backlog after the Lean MVP ships:
- Edit RAID items inline before exporting.
- Export to Markdown and CSV (client-side).
- File / transcript upload as an input option (in addition to paste).
- Persistence and accounts (this breaks Lean scope; confirm with the user first).

---

## Boundaries (from the user, important)

- Never hardcode, print, or commit the API key.
- Never create accounts or change access permissions on the user's behalf.
- Keep the Lean scope. Adding DB/auth/accounts requires explicit user sign-off.
- When unsure about a product/API detail, check docs.claude.com rather than
  relying on memory.

