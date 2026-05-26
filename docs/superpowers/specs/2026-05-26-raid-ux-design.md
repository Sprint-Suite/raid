# RAID — UX & Architecture Design Spec

**Date:** 2026-05-26
**Status:** Brainstorming complete, awaiting implementation plan
**Project:** `/var/www/raid` — the 4th app in the Agile-tools suite
**Sibling apps:** sprintpoker (`/var/www/scrumpoker`), sprintretro (`/var/www/retrospective`), signal (`/var/www/signal`)

---

## 1. Purpose & framing

A lightweight AI-powered RAID-log tool. The user pastes raw project communications (status notes, meeting transcripts, email threads) and receives a structured, classified, scored RAID log (Risks, Assumptions, Issues, Dependencies) with dependency-conflict detection.

**Primary purpose:** showcase build. Demonstrates real AI engineering (structured outputs, classification, server-side recompute safeguard, conflict detection) and completes the four-app suite under a shared design system.

**Secondary purpose:** practical utility for consultants, junior PMs, solo founders, and small-business delivery roles. Enterprise users are blocked by data-policy constraints; this is acknowledged and not a design problem to solve.

**Out of scope (locked by CLAUDE.md and confirmed in brainstorming):**

- No accounts, no authentication, no user state.
- No database, no server-side persistence of any kind.
- No multi-session memory, no living/append-mode RAID log.
- No inline editing of generated items (read-only output).
- No file upload (paste only).

---

## 2. Workflow model

**Model:** cleaning tool. Each click of Generate produces a fresh log from the current textarea contents. There is no concept of combining inputs or carrying items across runs. To leave with the result, the user copies to clipboard or downloads a file — the in-memory result is discarded on refresh.

**User journey:**

```
1. Lands on /          → sees hero + textarea pre-loaded with sample 1 + Generate button
2. Clicks Generate     → spinner + "Analysing your notes…" in result zone for 5–15s
3. Result lands        → 2×2 grid renders; if conflict detected, Dependencies card highlighted
4. Reviews result      → reads in place; no drill-down, all items visible at once
5. Acts on result      → Copy as Markdown / Download CSV / Download for Jira / Try another sample
                         OR clears textarea, pastes own content, clicks Generate again
6. Leaves              → no persistence. Next visit starts from sample 1 again.
```

**Sample cycle:**

Three samples pre-defined in `public/js/samples.js` as an array:

| Index | Name | Character |
|---|---|---|
| 0 | Weekly status | Clean, well-separated R/A/I/D — the "first impression" sample |
| 1 | Meeting transcript | Realistic, waffly, the UX-team dependency conflict — the hero showcase moment |
| 2 | Email thread | Adversarial — contains the "slow database" misclassification trap and the "failed once might recur" risk trap |

"Try another sample" advances `currentSample = (currentSample + 1) % 3`, replaces textarea content, smooth-scrolls to top, and auto-triggers Generate. The button label never changes to reveal what's next; the cycle is the experience.

---

## 3. Page anatomy

Single page at `/`, no routing, no client-side navigation. Top-to-bottom:

| Zone | Contents | Style notes |
|---|---|---|
| **Hero** | Brand glyph (SVG) + kicker text *"RAID extraction"* + H1 *"RAID"* + tagline *"From scattered notes to a scored RAID log, in seconds."* | Matches `entry-shell` / `entry-heading` pattern from `scrumpoker/public/index.html`. H1 in Fraunces 600, tagline in Inter 400 `--muted`. |
| **Privacy chip** | Small inline pill above the textarea: 🔒 *"Notes are sent to a cloud LLM and not stored."* | `--accent-soft` background, `--accent-deep` text, `--r-pill` shape. Visible but not noisy. |
| **Input card** | White surface card containing textarea (pre-loaded with samples[0]) + char counter + Generate button | `--r-lg` radius, `--shadow-md`, padding `var(--s-6)`. Textarea ~10 rows visible by default, resizable vertically. |
| **Char counter** | Bottom-right of textarea | `{n} chars`. Colour shifts: `--muted` → `--warn` at >80% of 1MB → `--err` at limit. |
| **Generate button** | Below textarea, primary button per forestbuild-spec §2.1 | Solid forest, white label, pill radius. Disabled when text < 10 chars or > 1MB. Label changes to *"Generating…"* during the call. |
| **Result zone** | Initially hidden. Renders spinner during Loading state, 2×2 grid + action bar on success, error card on failure. | Same `app-page` container width as sibling apps. |
| **Action bar** | After successful result: Copy as Markdown · Download CSV · Download for Jira · Try another sample | Primary button for the first action, secondary buttons for the rest, ghost button for *Try another sample* (per forestbuild-spec §2.2 and §2.3). |
| **Footer** | Suite footer with links to sprintpoker / sprintretro / signal and a small "Built with Claude" credit | Reuses retrospective's footer markup. |

**Mobile (≤640px):**

- Hero copy stays as desktop.
- Textarea full-width.
- Char counter wraps to its own line if needed.
- 2×2 grid collapses to single column: Risks → Assumptions → Issues → Dependencies, stacked.
- Action bar stacks vertically, each button full-width per forestbuild-spec §1.8.

---

## 4. State machine

Four states, in-page only, no URL changes.

| State | Visible | Interactive |
|---|---|---|
| **Idle** | Hero + textarea pre-loaded + Generate enabled. Result zone hidden. | Textarea editable. Generate clickable when text 10..1_000_000 chars. |
| **Loading** | Hero + textarea (read-only) + Generate disabled (label *"Generating…"*). Result zone shows spinner + *"Analysing your notes…"* | Nothing — call in flight. |
| **Result** | Everything from Idle + result zone shows 2×2 grid + action bar. | Textarea fully editable. Action bar buttons live. Editing the textarea does not change the displayed result until Generate is clicked again. |
| **Error** | Hero + textarea + Generate (re-enabled). Result zone shows error card + *"Try again"* button. | Everything; Try-again re-runs the same input. |

**Transitions:**

```
Idle    ──[Generate]───────────────▶ Loading
Loading ──[200]───────────────────▶ Result
Loading ──[502 / network / 4xx]───▶ Error
Result  ──[Try another sample]────▶ Loading (with samples[(n+1)%3] in textarea)
Result  ──[edit + Generate]───────▶ Loading
Result  ──[Copy/Download]─────────▶ Result (no state change; inline toast)
Error   ──[Try again]─────────────▶ Loading
Error   ──[edit + Generate]───────▶ Loading
```

**Input validation:**

| Condition | Behaviour |
|---|---|
| `< 10 chars` | Generate disabled. Helper text below textarea: *"Add a bit more content — at least 10 characters."* |
| `> 1 MB` | Generate disabled. Helper text: *"Too long — please shorten or submit in parts."* Counter shows red. |
| Otherwise | Generate enabled. Counter forest. |

**Error-state messaging** (matched to server responses from `lib/extract.js`):

| Trigger | Message |
|---|---|
| Network failure (no response) | *"Couldn't reach the server. Check your connection and try again."* |
| HTTP 502 (extraction failed twice) | *"Extraction failed. Try rephrasing or shortening your notes."* |
| HTTP 400 (model/beta header issue) | *"The AI service rejected the request. This is likely a temporary configuration issue. Please try again."* |
| HTTP 429 (rate limit) | *"Too many requests. Please wait a moment and try again."* |
| Client-side timeout (>30s without response) | Same text as 502. |

**Loading-state heartbeat:** after 20s with no response, add a subtle line under the spinner: *"This is taking a bit longer than usual…"*. Do not abort early — the model occasionally takes longer; aborting throws away a successful response.

**Copy-as-Markdown confirmation:** inline button label change — *"Copied ✓"* for 1.5s then revert. No global toast component.

**Persistence across reload:** none. Sample 1 is always the entry point.

---

## 5. Result anatomy

2×2 CSS grid on desktop, single column on mobile. The Dependencies card sits bottom-right by default. Asymmetric heights are fine — cards grow vertically to fit their items; the grid reads as a document, not a dashboard.

### 5.1 Common card structure

Every card:

- Header row: category pill (R/A/I/D in category-specific colour) + item count.
- Body: stacked items separated by 1px `--border-st` rules.
- Empty state: header still rendered with `0` count; body shows muted line *"No items detected."* — never hide a card.

### 5.2 Per-category item content

**Risks** (most data-rich):

| Field | Source | Render |
|---|---|---|
| Title | `risks[i].title` | Inter 600, 14.5px |
| Owner | `risks[i].owner` | Small pill, `--bg-warm` background. *"Unassigned"* allowed; never invent a name. |
| Score row | `probability`, `impact`, `severity`, `rag` | Single line: `P3 · I3 · Sev 9` + RAG pill (Red/Amber/Green using `--err-bg`/`--warn-bg`/`--ok-bg` families). |
| Mitigation | `risks[i].mitigation` | Inter 400, prefixed with *"Mitigation:"* in `--accent-deep` 600. |

Sort: severity descending (Red 25 → Green 1).

**Assumptions:**

| Field | Render |
|---|---|
| Title | Inter 600 |
| Owner | Small pill |
| Description | 1–2 sentences |
| `validation_needed` | Prefixed with *"Validate by:"* in `--accent-deep` 600 |

Sort: input order. No scoring.

**Issues:**

| Field | Render |
|---|---|
| Title | Inter 600 |
| Owner | Small pill |
| Severity | Pill, `High` (err family) / `Medium` (warn family) / `Low` (info family) |
| Description | 1–2 sentences |
| `suggested_action` | Prefixed with *"Action:"* in `--accent-deep` 600 |

Sort: severity High → Low.

**Dependencies** (hero feature):

| Field | Render |
|---|---|
| Title | Inter 600 |
| Owner | Small pill |
| `depends_on` | Prefixed with *"Depends on:"* in `--accent-deep` 600 |
| If `conflict_flag: true` | Inline `CONFLICT` pill next to owner + a left-bordered `--warn-bg` callout below the item containing the `conflict_note` |

Sort: items with `conflict_flag: true` first, then input order.

### 5.3 Conflict treatment

When any dependency has `conflict_flag: true`:

1. The entire Dependencies card gets a `--warn` (orange `#B8780A`) 2px border (replacing the default 1px `--border`).
2. A `⚠ CONFLICT` chip appears in the top-right corner of the card, sitting half on top of the border.
3. Every dependency with `conflict_flag: true` gets an inline `CONFLICT` pill next to its owner pill.
4. Each conflict item shows a left-bar `--warn-bg` callout containing the `conflict_note`.

This is the harness's case-2 hero moment. It must be visually impossible to miss.

### 5.4 Overflow & mobile

- Cards grow vertically as needed. No internal scroll. Page gets taller.
- Typical input (email thread) produces 1–5 items per category. Long transcripts may produce 10+ — supported, just longer.
- Mobile (≤640px): single column, R → A → I → D order.

---

## 6. Visual style

Adheres to `forestbuild-spec.md` and reuses `scrumpoker/public/css/theme-core.css` verbatim. Forest accent `#2E6F4E` throughout.

### 6.1 Token files

- `public/css/theme-core.css` — copied verbatim from `scrumpoker`. Canonical source for foundation tokens, type, spacing, radius, shadows, status colours.
- `public/css/theme-raid.css` — per-app palette exposure. Mostly redeclares tokens already in `theme-core.css` for explicit per-app control (consistent with sibling apps' pattern).
- `public/css/app.css` — RAID-specific component styles.

### 6.2 Component inventory

**Reused from `theme-core.css`** (no work needed): `btn`, `btn-primary`, `btn-secondary`, `btn-ghost`, `field`, `status-pill`, `card`, `app-page`.

**New in `app.css`:**

| Class | Role |
|---|---|
| `.hero` | Brand glyph + kicker + H1 + tagline wrapper |
| `.privacy-chip` | Lock-icon pill above textarea |
| `.input-card` | Textarea + char counter + Generate button container |
| `.char-counter` | Live char count, colour-shifts on validity |
| `.result-grid` | 2-column CSS grid, single column on mobile |
| `.raid-card` | Per-category card |
| `.raid-card--conflict` | Modifier adding orange border + corner chip |
| `.raid-card__header` | Category pill + count row |
| `.raid-card__corner-chip` | `⚠ CONFLICT` chip positioned absolutely top-right |
| `.raid-item` | Single item; children `__title`, `__owner`, `__score`, `__rag`, `__body`, `__conflict-pill`, `__conflict-callout` |
| `.action-bar` | Horizontal button row below grid; stacks on mobile |
| `.error-card` | Renders in result zone for Error state |
| `.spinner` | CSS-only forest spinner |

### 6.3 Animation

Per forestbuild-spec §3:

- All hover/focus transitions `120ms ease`.
- Buttons lift 1px on hover, max 2px.
- Respect `prefers-reduced-motion: reduce` — disable transitions.

No new entrance animations beyond the result-zone fade-in.

### 6.4 Accessibility

Per forestbuild-spec §6:

- WCAG AA contrast minimum (4.5:1 for text).
- Visible focus rings on every interactive element (`0 0 0 3px var(--accent-soft)`).
- Status conveyed by colour + label, never colour alone.
- Min hit target 38px.
- Semantic markup: `<button>`, `<label>` tied to inputs, `<main>`, `<section>`, `<nav>`.
- `aria-live="polite"` on the result zone so screen readers announce the new content when it lands.
- The `⚠ CONFLICT` indicator has visible text — never a bare icon.

---

## 7. Architecture & file layout

Approach: **match the suite**. Express + static `public/`, vanilla JS, vanilla CSS with custom properties, no framework, no build pipeline.

### 7.1 Directory tree

```
/var/www/raid/
├── server.js                  # Express entry: mounts /extract, /health, /build, static public/
├── lib/
│   ├── raid.js                # Schema, system prompt, ragFromSeverity, reconcile
│   ├── extract.js             # Anthropic API call + retry-once wrapper
│   └── buildInfo.js           # Build hash for cache-busting (copied from suite)
├── public/
│   ├── index.html
│   ├── license.html
│   ├── robots.txt
│   ├── css/
│   │   ├── theme-core.css     # COPIED verbatim from /var/www/scrumpoker
│   │   ├── theme-raid.css     # Per-app palette exposure
│   │   └── app.css            # RAID-specific components
│   ├── js/
│   │   ├── app.js             # State machine, DOM, fetch wrapper
│   │   ├── exports.js         # toMarkdown / toCSV / toJiraCSV (pure)
│   │   ├── samples.js         # The 3 pre-loaded sample texts
│   │   └── clipboard.js       # COPIED from suite
│   ├── fonts/                 # COPIED — Fraunces.woff2, Inter.woff2, JetBrainsMono.woff2
│   ├── illos/                 # COPIED — theme-illos.svg (brand glyph)
│   └── images/                # Favicons + any RAID-specific imagery
├── tests/
│   ├── extract.unit.test.js   # Pure unit tests, no network
│   ├── exports.unit.test.js   # Markdown/CSV/Jira fixture tests
│   ├── samples.unit.test.js   # Trivial sanity checks on samples
│   ├── harness.test.js        # ADAPTED from docs/raid-test.mjs; live API
│   └── e2e/
│       └── raid.spec.js       # Playwright; stubs /extract
├── docs/                       # KEEP — original Architect docs (handover, forestbuild-spec, etc.)
│   ├── README.md
│   ├── handover.md
│   ├── forestbuild-spec.md
│   ├── extract-server.mjs      # Reference impl (not run; adapted into lib/)
│   ├── raid-test.mjs           # Reference harness (adapted into tests/harness.test.js)
│   └── superpowers/specs/      # This doc and any successors
├── package.json
├── playwright.config.js
├── claude.md                   # KEEP
├── README.md                   # Replace with short run instructions
└── .gitignore                  # node_modules, .superpowers, .env
```

### 7.2 Backend split rationale

The reference `docs/extract-server.mjs` is one file. The implementation splits it three ways so pure logic is testable without a network:

- `lib/raid.js` — schema, system prompt, `ragFromSeverity()`, `reconcile()`. No `fetch`, no env vars. Unit-testable.
- `lib/extract.js` — Anthropic fetch + retry-once. The only place network code lives. Imports `lib/raid.js`.
- `server.js` — Express wiring, route handlers, validation. Imports `lib/extract.js`.

### 7.3 Module system

The sibling apps use CommonJS (`require`/`module.exports`). The reference `docs/extract-server.mjs` is ESM. The implementation adopts **CommonJS** to match the suite.

### 7.4 Port

`PORT=3003` (suite progression: 3000 scrumpoker, 3001 retrospective, 3002 signal, 3003 raid). Overridable via env var.

### 7.5 Environment variables

| Var | Default | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | yes |
| `RAID_MODEL` | `claude-sonnet-4-5` | no |
| `PORT` | `3003` | no |

Never logged. Never returned to the client.

---

## 8. Backend API & data flow

### 8.1 Endpoint contract

| Method | Path | Request | Success | Errors |
|---|---|---|---|---|
| `POST` | `/extract` | `{ "text": "<string>" }` (10..1_048_576 chars) | `200 { risks: [], assumptions: [], issues: [], dependencies: [] }` matching schema | `400 { error }` (validation), `500 { error }` (missing API key), `502 { error }` (extraction failed after retry) |
| `GET` | `/health` | — | `200 { ok: true, model: "..." }` | — |
| `GET` | `/build` | — | `200 { hash }` | — |
| `GET` | `/` | — | `index.html` | — |
| `GET` | `/css/*`, `/js/*`, `/fonts/*`, `/illos/*`, `/images/*`, `/license.html`, `/robots.txt` | — | Static | 404 |

No other endpoints. No `/export` — all export generation is client-side.

### 8.2 Anthropic call details

- **Model:** `claude-sonnet-4-5` (default), overridable via `RAID_MODEL`.
- **Beta header:** `anthropic-beta: structured-outputs-2025-11-13` per the reference impl. **Verify against docs.claude.com before first live call** — CLAUDE.md flags this header as something that can move.
- **`output_format`:** `{ type: "json_schema", schema: RAID_SCHEMA }` from `lib/raid.js`.
- **System prompt:** the existing rubric in `docs/extract-server.mjs`, lifted verbatim. The harness's tuning loop may sharpen it.
- **Max tokens:** 2048.
- **Retry policy:** one retry on any failure (network, parse, non-200). On second failure, surface `502 { error: "Extraction failed. Try rephrasing the notes and resubmit." }`.

### 8.3 Reconcile safeguard

After every successful API response, before returning to the client, the server recomputes:

- `severity = probability × impact` for each risk
- `rag = "Red" if severity >= 15 else "Amber" if severity >= 8 else "Green"`

Catches LLM arithmetic drift. CLAUDE.md forbids removing it. Pinned by `tests/extract.unit.test.js`.

### 8.4 Privacy posture

- Zero persistence anywhere. No DB, no log of user text, no error log capturing payload.
- `ANTHROPIC_API_KEY` lives in env only. Never logged, never echoed.
- Privacy chip in UI tells the user their text goes to a cloud LLM.
- Server logs only: timestamps, status codes, model error messages. **Never** the user-supplied `text`.

---

## 9. Export pipeline (client-side)

All three export formats are pure functions in `public/js/exports.js`. No server round-trip.

### 9.1 `toMarkdown(raid): string`

GitHub-flavoured Markdown. Single string copied to clipboard via `navigator.clipboard.writeText`.

Structure:

```markdown
# RAID Log

## Risks
| Title | Owner | P | I | Sev | RAG | Mitigation |
|---|---|---|---|---|---|---|
| ... | ... | 3 | 3 | 9 | Amber | ... |

## Assumptions
| Title | Owner | Description | Validate by |
|---|---|---|---|
| ... | ... | ... | ... |

## Issues
| Title | Owner | Severity | Description | Action |
|---|---|---|---|---|
| ... | ... | Medium | ... | ... |

## Dependencies
| Title | Owner | Depends on | Conflict | Conflict note |
|---|---|---|---|---|
| ... | ... | ... | Yes | ... |
```

Empty categories render the heading + a one-line *"No items detected."*

### 9.2 `toCSV(raid): string`

Single flat CSV. One row per RAID item. Harmonised columns; empty cells where a category doesn't carry a field.

Columns (in order):

```
Type, Title, Description, Owner, Probability, Impact, SeverityScore, RAG,
SeverityLabel, Mitigation, Action, Validation, DependsOn, Conflict, ConflictNote
```

`Type` is `Risk` / `Assumption` / `Issue` / `Dependency`. Numeric and label severity are kept in separate columns so consumers (Excel filters, pivot tables, Jira importers) get cleanly typed data:

| Column | Populated for | Type |
|---|---|---|
| `Probability` | Risks | int 1–5 |
| `Impact` | Risks | int 1–5 |
| `SeverityScore` | Risks | int 1–25 |
| `RAG` | Risks | `Red` / `Amber` / `Green` |
| `SeverityLabel` | Issues | `High` / `Medium` / `Low` |
| `Mitigation` | Risks | string |
| `Action` | Issues | string |
| `Validation` | Assumptions | string |
| `DependsOn` | Dependencies | string |
| `Conflict` | Dependencies | `Yes` / `No` |
| `ConflictNote` | Dependencies (when Conflict=Yes) | string |

Cells that don't apply for a given row are empty strings.

Filename: `raid-log-YYYY-MM-DD.csv`.

### 9.3 `toJiraCSV(raid): string`

Same data, Jira-flavoured columns:

```
Summary, Issue Type, Priority, Description, Assignee, Labels
```

Mapping:

| RAID type | Issue Type | Priority |
|---|---|---|
| Risk | `Risk` | `Highest` if Red, `High` if Amber, `Medium` if Green |
| Assumption | `Task` | `Medium` |
| Issue | `Bug` | `Highest` if High, `High` if Medium, `Medium` if Low |
| Dependency | `Task` | `Highest` if conflict, else `Medium` |

`Description` concatenates the source description + mitigation/action/validation/depends-on/conflict-note fields with `\n\n` separators (Jira accepts multi-line description in CSV import).

`Labels`: `raid-extracted` + the lowercased Type. Multiple labels space-separated (Jira convention).

Filename: `raid-jira-YYYY-MM-DD.csv`.

### 9.4 CSV quoting rules

- Wrap any cell containing `,`, `"`, or newline in `"..."`.
- Escape inner `"` as `""`.
- UTF-8, no BOM.
- LF line endings (Excel handles both; some Jira importers prefer LF).

---

## 10. Testing

Three layers. Same conventions as sibling apps.

### 10.1 Unit tests (no network)

Run: `npm test` → `node --test tests/*.test.js`. Fast, deterministic, runs in CI.

| File | Pins |
|---|---|
| `tests/extract.unit.test.js` | `ragFromSeverity()` boundaries at 1, 7, 8, 14, 15, 25. `reconcile()` overwrites model-produced bad severity/RAG values. |
| `tests/exports.unit.test.js` | `toMarkdown()`, `toCSV()`, `toJiraCSV()` against a fixed RAID fixture; snapshot column order, headers, conflict rendering, Jira priority mapping. |
| `tests/samples.unit.test.js` | The three pre-loaded samples meet input rules (≥10 chars, ≤1MB) and exist. |

### 10.2 Classification harness (live API)

Run: `npm run test:harness` → `node tests/harness.test.js`. Adapted from `docs/raid-test.mjs`. Three cases: clean / realistic / adversarial. Assertions: per-category counts, RAG bands, issue severities, conflict flag. Free-text fields un-asserted.

- Requires `ANTHROPIC_API_KEY`.
- Never runs in CI by default.
- The regression suite for the system prompt. If a prompt edit breaks a case, the prompt is wrong.

### 10.3 E2E (Playwright)

Run: `npm run test:e2e` → `playwright test`. Stubs `/extract` so it runs offline.

Scenarios:

| # | Scenario | Assertion |
|---|---|---|
| 1 | Page loads | Sample 1 in textarea, Generate enabled, result hidden, privacy chip visible |
| 2 | Generate (mocked 200) | Spinner → grid renders with mocked data → action bar visible |
| 3 | Generate (mocked 502) | Error card with Try-again button |
| 4 | Try-again (mocked 200) | Loading → grid |
| 5 | Try another sample | Textarea content changes, scrolls to top, auto-Generate fires |
| 6 | Copy as Markdown | Button label "Copied ✓" for 1.5s; clipboard content matches snapshot |
| 7 | Download CSV / Jira CSV | Downloaded file content matches snapshot |
| 8 | Conflict mock | Dependencies card has `.raid-card--conflict`, corner chip visible, callouts present |
| 9 | Validation: empty textarea | Generate disabled, helper text shown |
| 10 | Validation: >1MB pasted | Generate disabled, counter red |
| 11 | Mobile viewport (375px) | Grid collapses to single column, action bar stacks |

### 10.4 CI/CD posture

- Unit + E2E run on every push.
- Harness runs manually only (cost + key).
- Optional `.github/workflows/manual-harness.yml` with `workflow_dispatch` for one-click runs from GitHub UI.

### 10.5 Not tested

- The Anthropic API itself.
- The model's free-text wording (intentionally lenient).
- Visual / pixel-level UI (no screenshot diffing).
- Cross-browser (Chromium only; Firefox/WebKit optional).

---

## 11. Definition of done

- [ ] `npm start` boots `server.js` on `:3003` (or `$PORT`).
- [ ] `GET /health` returns `{ ok: true, model: "..." }`.
- [ ] `npm test` passes all unit tests.
- [ ] `npm run test:harness` passes all 3 cases against the live API.
- [ ] `npm run test:e2e` passes all Playwright scenarios.
- [ ] Forest accent `#2E6F4E` visible throughout; no purple, navy, red, or violet remains as a primary colour.
- [ ] Privacy chip visible above textarea.
- [ ] Pre-loaded sample 1 visible in textarea on initial load.
- [ ] Generate produces a 2×2 grid for all 3 samples.
- [ ] Sample 2's UX-team conflict triggers the orange-border + corner-chip + inline-pill + warn-callout treatment on the Dependencies card.
- [ ] Sample 3's "slow database" lands in Issues (not Risks); sample 3's two risks count = 2.
- [ ] Copy as Markdown puts well-formed Markdown on the clipboard; button confirms with *"Copied ✓"* for 1.5s.
- [ ] Download CSV produces a valid harmonised-columns CSV file.
- [ ] Download for Jira produces a valid Jira-flavoured CSV with priority mapping.
- [ ] Try another sample cycles textarea content, scrolls to top, auto-generates.
- [ ] On 502, error card with Try-again button renders; Try-again re-runs the call.
- [ ] Mobile viewport (375px): 2×2 grid collapses to single column; action bar stacks.
- [ ] Keyboard navigation: every interactive element has a visible focus ring.
- [ ] `prefers-reduced-motion`: hover/transition animations disabled.

---

## 12. Open items, risks, follow-ups

### 12.1 Verify before implementation

- **Anthropic beta header `structured-outputs-2025-11-13`** — confirm current at docs.claude.com before the first live call. If moved, update the constant in `lib/extract.js`. CLAUDE.md flags this explicitly.
- **Sibling app footer markup** — confirm retrospective's footer pattern before lifting it; copy as-is if appropriate.
- **`clipboard.js` from the suite** — confirm the helper exists in scrumpoker or retrospective; if not, write inline in `app.js`.

### 12.2 Known risks

- **Enterprise data policy** is a structural limit on adoption; acknowledged, not a problem to solve in this MVP.
- **Model classification drift** is the harness's job to catch. Treat the 3 cases as immutable contract.
- **`anthropic-beta` header moves** are routine; verify before each live run after long gaps.

### 12.3 Deferred to v2+ (not implemented in this spec)

- Inline editing of items (changes severity → must trigger re-reconcile client-side).
- File / transcript upload.
- Persistence + accounts (would break Lean scope; not currently planned).
- The **coaching angle** — "the AI explains why it classified an item this way" — is the most promising direction for differentiated v2 work. Not in MVP, but worth keeping in mind when reviewing what users actually do with the v1.

---

## 13. Brainstorming decision log

| # | Decision | Source |
|---|---|---|
| 1 | Primary purpose: Showcase / portfolio piece | User answer to "primary user" question |
| 2 | Entry moment: pre-loaded sample + one big Generate button | User answer |
| 3 | Page layout: stacked (input top, results below) | User answer (option A) |
| 4 | Exports: Markdown copy + CSV download + Jira CSV download | User answer (user reframed original question) |
| 5 | Sample cycle: 3 samples via "Try another" button after first result | User answer |
| 6 | Read-only output: yes (no inline edit) | User answer |
| 7 | Result anatomy: 2×2 grid | User answer (option A) |
| 8 | Loading state: centered spinner + caption | User answer (option A) |
| 9 | Tagline: *"From scattered notes to a scored RAID log, in seconds."* | User answer (option D) |
| 10 | Sample chooser dropped (cycle only) | User confirmed recommendation |
| 11 | Workflow: cleaning tool (fresh each generation) | User answer (option B) |
| 12 | Build approach: match the suite | User answer (Approach 1) |
| 13 | Module system: CommonJS (match suite, not docs' ESM) | Discovered during file exploration |
| 14 | Conflict treatment: orange border + corner chip + per-item pill + warn callout | Approved in Section 2 mockup |

---

## 14. Implementation plan handover

Next step: invoke the `writing-plans` skill to produce a step-by-step implementation plan against this design. The plan should produce a sequence of small, independently-reviewable commits that take the project from empty (`/var/www/raid/app/` is currently empty) to all definition-of-done items passing.

Suggested implementation order (the plan will refine):

1. **Backend skeleton**: scaffold `server.js` + `lib/raid.js` + `lib/extract.js` + `package.json`. Verify beta header. `/health` returns ok.
2. **Harness green**: bring `tests/harness.test.js` over from `docs/raid-test.mjs`. Run against live API. Tune system prompt until 3/3 cases pass.
3. **Unit tests**: write `extract.unit.test.js` for `reconcile()` and `ragFromSeverity()`.
4. **Static shell**: copy `theme-core.css`, fonts, illos from scrumpoker. Write `theme-raid.css` and a basic `index.html` with the hero + textarea.
5. **State machine + Generate**: wire `app.js` to call `/extract`, render spinner, render grid skeleton.
6. **Result rendering**: implement the 2×2 grid with all four card types per Section 5.
7. **Conflict treatment**: add the conflict-card modifier, corner chip, inline pills, callouts.
8. **Exports**: implement `toMarkdown` / `toCSV` / `toJiraCSV` + their unit tests. Wire to action bar buttons.
9. **Sample cycle**: load samples, wire Try-another, auto-Generate.
10. **Error handling**: implement error card + Try-again. Cover all 5 error scenarios from Section 4.
11. **Polish**: focus rings, reduced-motion, mobile breakpoint, char counter colours, *"Copied ✓"* inline toast.
12. **E2E suite**: write Playwright scenarios per Section 10.3.
13. **Final verification**: run all three test layers; tick off Definition of Done.
