# CLAUDE.md - RAID App Project Context

This file gives Claude Code the standing context for this project. Read it before acting.

## What this project is

A lightweight AI-powered **RAID log** tool. A user pastes messy project notes
(status updates, meeting transcripts, email threads) and gets back a structured,
scored RAID log: **R**isks, **A**ssumptions, **I**ssues, **D**ependencies.

It is part of an existing suite of solo-built Agile tools (sprintpoker.uk,
sprintretro.uk). This is the third tool. The goal is a **showcase build** that
demonstrates real AI engineering (structured extraction, classification,
human-in-the-loop), with a secondary goal of modest freemium revenue.

## What RAID means (the domain rules that matter)

The single hardest part is correct classification. Be strict about tense and certainty:

- **Risk**: MIGHT happen, future, uncertain. Would harm the project if it did.
- **Assumption**: taken as true without proof; the plan depends on it.
- **Issue**: HAS happened or is happening NOW, certain, needs action.
- **Dependency**: something this work needs from another team/system/vendor first.

Two classification traps the prompt must handle, and the harness tests:
1. Something **labelled** "a risk" but already happening and causing harm now is an
   **Issue**, not a Risk. Obey the rubric, not the user's wording.
2. Something that **failed in the past** but whose live concern is recurrence is a
   **Risk** about the future, not an Issue about the past.

## Risk scoring rubric (encoded in the system prompt)

- probability 1-5, impact 1-5
- severity = probability * impact
- RAG: Red if severity >= 15, Amber if 8-14, Green if <= 7
- The server **recomputes** severity and RAG after the model responds, so model
  arithmetic drift can never reach the UI. Do not remove this safeguard.

## Tech decisions already made (do not re-litigate)

- **Surface**: web app, to match the existing suite.
- **AI**: cloud LLM via the Anthropic API, using **native structured outputs**
  (`output_format: json_schema`), not the older forced-tool-call pattern.
- **Scope**: Lean MVP first. Paste text in, scored RAID log out. No accounts,
  no database, no persistence, no file upload yet.
- **Backend**: Node + Express, single `/extract` endpoint.
- **Model default**: `claude-sonnet-4-5` (overridable via `RAID_MODEL`).

## Files in this repo

- `extract-server.mjs` - the Express `/extract` endpoint. Contains the RAID JSON
  schema, the system prompt (the domain expertise), the Anthropic call with
  structured outputs, the severity/RAG reconcile safeguard, and a retry-once wrapper.
- `raid-test.mjs` - test harness. POSTs 3 fixed inputs and checks classification
  counts, risk RAG bands, issue severities, and the dependency conflict flag.
- `README.md` - quick run instructions.
- `HANDOVER.md` - the task brief. Start there.

## Hard constraints

- **Never** hardcode or commit the API key. It lives in the `ANTHROPIC_API_KEY`
  environment variable only.
- Keep the Lean scope. Do not add accounts, DB, or auth unless explicitly asked.
- The `/extract` endpoint must not persist user input (privacy: it is sent to a
  cloud LLM). The future UI needs a visible note telling users not to paste
  sensitive or classified material.
- Model names and the structured-outputs beta header date can change. If a call
  fails with a 400 about the model or the `anthropic-beta` header, check current
  values at docs.claude.com and update the constants at the top of
  `extract-server.mjs`. Do not guess.

## Definition of done for the Lean MVP

1. `node extract-server.mjs` starts cleanly and `/health` returns ok.
2. The harness passes all 3 cases (easy, realistic, adversarial).
3. A minimal 4-section UI renders a RAID log from pasted text, reusing the
   visual style of the existing suite.

