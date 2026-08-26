# Workflow & Operations: Frequency web

How this repo is operated through Claude Code (CLI + web). Companion to the routines in
`.claude/skills/` and the hooks in `.claude/`.

## Developer workflow (local + on-the-go)

Two ways to work, one backbone: both go branch → PR → preview → merge, so they never drift.

- **Lane 1: local, for substantial work** (your machine, VS Code + Claude Code): run
  `pnpm dev` at `localhost:3000`, iterate, then branch → push → PR. Setup: README
  "Getting started (developers)".
- **Lane 2: on the go, for quick changes** (Claude Code on the web / phone): describe the
  change to Claude; it branches, edits, pushes, and opens a PR. Open the Vercel **preview
  URL** on your phone to check it, then merge the PR.

The backbone for both lanes:

- `main` is **protected**: branch from `main`, never push to it directly.
- Every PR gets a **Vercel preview** + CI (lint, types, tests); both must be green.
- **Merging to `main` deploys to production.** Keep PRs small and up to date with `main`.
- **One shared database (today):** local, preview, and prod all use the same Supabase
  project. Fine for read/UI work; **never** run migrations or destructive scripts against it
  casually. Schema changes go via the Supabase dashboard / MCP and are mirrored as files in
  `supabase/migrations/`. **Do not `supabase db push`** until the baseline in "Scaling to a
  team" is done.

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
- **Weekly**, Monday 08:00, prompt: `Run /maintenance`
- **Daily**, 08:00, prompt: `Run /support-triage`

Fresh container each run (SessionStart installs deps), sweep, then a **draft PR** / **Gmail
drafts** to approve. Docs: https://code.claude.com/docs/en/claude-code-on-the-web

## What to remember (Frequency-specific)
- **Non-standard Next.js:** read `node_modules/next/dist/docs/` before writing Next code
  (see `AGENTS.md`). Training-data Next conventions may be wrong here.
- **`main` is protected:** no direct pushes. Every change goes through a PR (CI + a Vercel
  preview must pass); **merging the PR to `main` is what deploys to production**. See
  "Developer workflow" below.
- **Docs protocol** (`docs/DOCS-PROTOCOL.md`): technical → git (`docs/*.md`, ADR in
  `docs/DECISIONS.md`); instructional/operator → Notion "Web Platform: Training &
  Strategy" DB. The Stop hook nags on drift.
- **Container is ephemeral:** only committed + pushed work survives.

## Known setup gaps (action needed)
- **Gmail connector token expired (2026-06-02):** re-authorize before `/support-triage`
  or the `Support` label can be created/used.
- **Scheduled sessions not yet created:** do the two above to close the automation loop.

## PR size and merge rules (adopted 2026-08-18, owner-directed)

`main` is protected and **merging deploys to production**, so the PR is the unit of both review
and blast radius. Two production incidents shaped these rules: a 215-file PR passed every gate
and killed deploys for a day (2026-08-11, ADR-1002), and a 322-file PR reached production after a
size concern went unanswered. The rules are enforced by a `checks`-job step in `ci.yml`, so a
violation fails a REQUIRED check rather than relying on memory.

1. **One backlog row per PR.** The PR closes exactly one `BUILD-BACKLOG.json` row (or is a pure
   process/docs change closing none). The row's probe flips green IN the same PR: `check:backlog`
   fails a PR whose fix lands without its row, and a row whose fix did not.
2. **Guidance: 15 files or fewer.** Past 15 changed files the CI step prints a warning
   annotation. Not a failure: some honest single-row fixes touch 20 files.
3. **Hard gate: 40 files.** Above 40 changed files the `checks` job FAILS unless the PR title
   carries a `[sweep]` tag, reserved for single-purpose mechanical changes (a codemod, a rename,
   a label-association sweep) where every file gets the same one edit. A `[sweep]` PR still
   closes exactly one row.
4. **Auto-merge on green is the default** (owner directive, 2026-08-18). Every PR arms GitHub
   auto-merge (squash); the required checks are the reviewer. Anything a gate cannot see (visual
   equivalence on a page retirement, a schema change) stays a draft until a human looks.

   **The required set, re-read from the ruleset API on 2026-08-26 — six contexts, and this list is
   the only authority on it:** `checks`, `analyze`, `lint`, `test`, `Vercel`, `db-tests`. Do not
   restate it from a workflow comment; one such comment was wrong for six days and got cited as
   evidence (LIVE-049), and on 2026-08-26 *two* workflow comments were found stating contradictory
   lists, neither correct (SCAN-520's pass). `db-tests` joined the set via #2302 (ADR-1150): it is
   the only gate that applies every migration to an empty database, and it caught a fresh-apply
   defect the other four passed. The 2026-08-18 reading recorded here said five contexts and was
   correct on the day; ruleset 17640795 was last modified 2026-08-25T17:22:09Z, so re-read rather
   than trust this line's date. Two absences are deliberate and both change what "green" promises:

   - **`pr-compare` is NOT required**, so the visual suite is advisory. "Auto-merge on green" means
     the code was compiled, linted, typechecked and tested, and the preview deployed. It does not
     mean anything about pixels. A PR that moves rendering, retires a page, or recaptures baselines
     is exactly the case rule 4 sends to a human.
   - **"Require branches to be up to date before merging" is OFF**, so a PR merges on the CI it ran
     against ITS base, not against current `main`. Two PRs that pass alone can still break `main`
     together. Merge one at a time when they touch the same surface, and re-base anything that has
     sat while other PRs landed.
5. **Never merge a red or part-green PR by hand** to beat the queue: the required set exists
   because each check has caught a real production defect.
6. **Rollback is a revert PR**, never a force-push to `main`.

## Scaling to a team

The setup above is right-sized for a **single developer on the free tier**. When you add a
second developer (or budget), graduate to full environment isolation. These steps are
deliberately deferred until then: they carry production risk best done **once, right before
they're needed**, not while they'd sit unused and re-drift:

1. **Supabase Pro + Branching:** an ephemeral database per PR (Vercel previews point at it),
   so prod data is never touched in dev/preview. Removes the "one shared database" caveat and
   needs no local Docker.
2. **Migration baseline (one-time):** squash today's tangled history (parallel dashboard/MCP
   vs. file histories, see `docs/DATABASE.md`) into a single clean baseline, then adopt
   **`supabase db push`** as the only way schema changes ship. This makes the DB reproducible
   (`supabase db reset`), the prerequisite for branching and a local DB.
3. **CI/CD for the DB:** apply migrations to staging/branch automatically and regenerate
   `lib/database.types.ts` in CI so types never drift.
4. **Team guardrails:** require ≥1 PR review, populate `.github/CODEOWNERS`, add error
   monitoring.

Until then, `main` protection + the PR/preview flow give the safety that matters, and the
schema-change discipline above prevents new drift.

## Maintenance baseline
First full advisor sweep: [`docs/maintenance/2026-06-02.md`](maintenance/2026-06-02.md).
