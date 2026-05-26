# RAID

AI-powered RAID-log extraction. Paste messy project notes → get a scored, classified RAID log with dependency-conflict detection.

Part of the 4-app suite: [sprintpoker](https://sprintpoker.uk), [sprintretro](https://sprintretro.uk), [signal](https://signal.uk), raid.

## Run

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm start
# open http://localhost:3003
```

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

## Docs

- `docs/superpowers/specs/2026-05-26-raid-ux-design.md` — design spec (628 lines)
- `docs/superpowers/plans/2026-05-26-raid-mvp.md` — implementation plan (38 tasks, 3,427 lines)
- `claude.md` — project context for Claude Code
