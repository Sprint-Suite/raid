# RAID

AI-powered RAID-log extraction. Paste messy project notes → get a scored, classified RAID log with dependency-conflict detection.

Part of the 4-app suite: [sprintpoker](https://sprintpoker.uk), [sprintretro](https://sprintretro.uk), [signal](https://signal.uk), raid.

## Run

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
node manageKeys.js generate <your-name>   # one-time: prints the access key once
npm start
# open http://localhost:3003 → redirected to /login.html → enter the key
```

## Access keys

RAID is gated behind a salted-SHA-256 access key (one or more). Manage them with:

```bash
node manageKeys.js generate <name>   # creates a 16-char key; printed once
node manageKeys.js list              # names, status, created-at
node manageKeys.js remove <name>     # revokes
```

Keys are stored hashed in `keys.json` (gitignored). The plaintext value is shown once at generation time and never recoverable from the file. Sessions are in-memory only; restarting the server signs everyone out.

## Test

```bash
npm test               # unit tests, no network, ~30ms
npm run test:e2e       # Playwright, stubs API, ~5s
npm run test:harness   # live API, ~$0.05/run, manual gate
```

## Configuration

| Env var | Default | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | yes |
| `RAID_MODEL` | `claude-sonnet-4-5` | no |
| `PORT` | `3003` | no |
| `RAID_KEYS_FILE` | `./keys.json` | no |
| `RAID_SESSION_TTL_MS` | `604_800_000` (7d) | no |
| `NODE_ENV` | unset | set to `production` in prod so cookies are `Secure` |

## Docs

- `docs/superpowers/specs/2026-05-26-raid-ux-design.md` — design spec (628 lines)
- `docs/superpowers/plans/2026-05-26-raid-mvp.md` — implementation plan (38 tasks, 3,427 lines)
- `claude.md` — project context for Claude Code
