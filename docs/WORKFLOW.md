# Workflow & Operations — Frequency web

How this repo is operated through Claude Code (CLI + web). Companion to the routines in
`.claude/skills/` and the hooks in `.claude/`.

## The hub model
Claude Code is the control plane. Systems it can act on directly (MCP): **Supabase**
(SQL, migrations, logs, advisors), **GitHub** (PRs, issues, CI), **Gmail / Calendar /
Drive**, **Notion** (the Training & Strategy DB), **Figma / Miro**. Via code/CLI, not a
live agent: **Vercel** (git-push deploy), **Stripe**, **Resend**.

## The routines
| Routine | What it does | Cadence |
| --- | --- | --- |
| `/maintenance` | Supabase advisors + migration drift, outdated deps, build/lint/test, open-PR CI → report + draft PR for safe fixes | weekly |
| `/support-triage` | Gmail `Support` label → classify → **draft** replies → file issues | daily |
| `/sync-docs` | route docs: technical → git, instructional → Notion (per `docs/DOCS-PROTOCOL.md`) | per change |

All **draft-and-approve**: reads are automatic; prod-changing actions (migrations, merges,
major bumps, env, sending mail) are prepared, never applied.

## Making the routines run themselves (scheduled sessions)
In **Claude Code on the web**, create a scheduled session per routine (Settings → this
repo's environment → Schedules):
- **Weekly**, Monday 08:00 — prompt: `Run /maintenance`
- **Daily**, 08:00 — prompt: `Run /support-triage`

Fresh container each run (SessionStart installs deps), sweep, then a **draft PR** / **Gmail
drafts** to approve. Docs: https://code.claude.com/docs/en/claude-code-on-the-web

## What to remember (Frequency-specific)
- **Non-standard Next.js** — read `node_modules/next/dist/docs/` before writing Next code
  (see `AGENTS.md`). Training-data Next conventions may be wrong here.
- **`git push` to `main` = production deploy** (Vercel). Feature branches build previews.
- **Docs protocol** (`docs/DOCS-PROTOCOL.md`): technical → git (`docs/*.md`, ADR in
  `docs/DECISIONS.md`); instructional/operator → Notion "Web Platform — Training &
  Strategy" DB. The Stop hook nags on drift.
- **Container is ephemeral** — only committed + pushed work survives.

## Known setup gaps (action needed)
- **Gmail connector token expired (2026-06-02)** — re-authorize before `/support-triage`
  or the `Support` label can be created/used.
- **Scheduled sessions not yet created** — do the two above to close the automation loop.

## Maintenance baseline
First full advisor sweep: [`docs/maintenance/2026-06-02.md`](maintenance/2026-06-02.md).
