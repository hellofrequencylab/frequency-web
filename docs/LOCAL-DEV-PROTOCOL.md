# Live to local: the working protocol

How a fix travels from something seen on frequencylocal.com to a merged PR when the work happens on
Daniel's Mac, and how that work shares the repo with the cloud build threads.

## The machine

| Piece | Where | Notes |
| --- | --- | --- |
| Checkout | `~/Developer/frequency-web` | The one working copy. `~/frequency-web` is an old clone on a dead branch; do not work there. |
| Node | `.nvmrc` pins 22 | The Mac runs 24; it works, but CI and Vercel build on 22. `nvm use` before chasing a version-only failure. |
| pnpm | 10.33.0 | Matches `packageManager`. |
| GitHub | `gh` signed in as hellofrequencylab | Pushes go over https with the gh token. |
| Supabase CLI | linked to the production project | Only Daniel applies SQL (see Migrations). |
| Vercel CLI | not installed | Not needed: every push to a PR branch builds a preview. |
| `.env.local` | production keys + `NEXT_PUBLIC_SITE_DESIGN` | `pnpm design:use frequency` to see the live design locally. |
| VS Code + Claude Code | extension installed, opens `~/Developer/frequency-web` | Start Claude sessions from this folder so they see the repo. |

## Intake

Daniel types every request in the project chat. The project's coordinator forwards each one, with his
message attached word for word, to the local thread on this Mac. The local thread builds it here and ships it
in phases: each phase is one PR under 40 authored files, with one ledger row, and it goes through the
loop below. A request too large for one PR is split into phases before any code is written.

## The loop

1. **See it live.** Reproduce on frequencylocal.com signed out (a private window), then signed in. Note the
   URL and what is wrong.
2. **Branch from fresh main.** `git fetch origin main && git checkout -b <topic> origin/main`.
3. **Run it locally.** `pnpm design:use frequency`, then `pnpm dev`, and load the same URL on
   `localhost:3000`. Fix the cause, not the symptom.
4. **Record it.** One ledger row per PR in `docs/ledger/rows/<ID>.json` with a `verify` probe that fails on
   main and passes on the branch. Run the probe both ways before committing.
5. **Switch back and check.** `pnpm design:use dawn` (the committed theme stubs are DAWN's), then:
   - `pnpm exec tsc --noEmit`
   - `pnpm exec eslint <changed files>`
   - `pnpm check:tokens`, `check:phantom`, `check:a11y-names`, `check:backlog`, `check:adoption`,
     `check:admin-client`
6. **Push once.** All commits for the PR go up in one push, then open the PR. Every push is a paid Vercel
   build, so there are no speculative pushes and no "fix CI" pushes that a local check would have caught.
   PRs stay under 40 authored files.

## One PR open at a time

Development happens on this Mac (Daniel, 2026-10-14). Cloud threads may still scan and prepare
branches, but they push them without a PR and hand them to local, which opens and merges every PR in
order. Only one PR is open at any moment.

- Before pushing, run `gh pr list --state open`. If anything is open, wait for it to merge.
- A handed-over cloud branch is pulled in its listed order, given fresh main, re-checked here, then pushed.
- After a PR merges, bring main into the next waiting branch (`git fetch origin main && git merge
  origin/main`) and re-run the checks before its push.
- Check a new ledger ID against every open lane before writing the row, so no two rows share a number.

## Migrations

- A migration is additive and idempotent, and its timestamp is later than every migration on main and in
  production.
- The repo's gate fails a migration PR until its SQL is live, so the PR waits until it is next in the
  queue. Then Daniel runs the SQL in the Supabase dashboard, the ledger row is recorded, and the PR merges.
- No one applies SQL ahead of its PR's turn.
