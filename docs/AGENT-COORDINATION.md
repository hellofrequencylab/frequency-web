# Agent coordination (Claude and ChatGPT)

Two agents build and land work in this repo. They check in on one GitHub issue so neither merges blind: [Agent coordination: Claude and ChatGPT](https://github.com/hellofrequencylab/frequency-web/issues/4306). What is done lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json), never here.

**Status: approved by Daniel on 2026-11-09** (all ten recommended decisions). The merge freeze is lifted for the slot queue only: nothing merges, arms auto-merge or applies SQL except under a slot Claude grants.

## Roles

- **Claude is project manager.** It owns the plan and priorities, claims and assignments, the ledger fragments and who holds the merge slot.
- **ChatGPT works for Claude.** It builds in its own lanes (below), runs release evidence and production acceptance, and executes merges when Claude grants it the slot.
- Daniel keeps production SQL, provider and account decisions, real payment evidence, and the phrase required to change any probe, pin, baseline or threshold.

## Lanes (file areas)

A PR edits only its own lane's files plus its own ledger fragment. Anything else needs a claim on the issue and a cross-review.

- **Claude:** themes and kits, `components/templates`, Spotlight, the website and page builder, editor, Create a Space, the member shell and rail, tokens, billing and checkout, launch, journeys, Vera.
- **ChatGPT:** feed, notification and other settings, custom-domain and site hosting, maps, calendar, navigation retirement, mechanical sweeps by directory (admin, journeys, events, on-air), CI, workflows, guards, `vercel-ignore-build`, visual baselines, audits, live verification.
- **Single owner:** `docs/BUILD-BACKLOG.json`, `docs/DECISIONS.md` and ledger tooling (Claude; compaction stays with its one thread). `.github/workflows/arm-auto-merge.yml` (Daniel only). Workflows, guards and budget gates (ChatGPT; Claude reviews; never raise a budget to pass).
- **Migrations:** one serial line. One migration PR in flight; its timestamp is later than everything on main and in production; Claude grants its slot.

## Branches, labels, drafts

- Branches: `claude/<ROW-ID>-<slug>` and `codex/<ROW-ID>-<slug>`. Do not use `cursor/*` (the `arm-auto-merge` workflow arms ready `cursor/*` PRs).
- Open PRs as drafts. Mark ready only when the Ready definition below holds.
- Labels: `ready-to-merge`, `merge-queue-hold`, `needs-claude`, `needs-daniel`, `migration`.

## Ready definition

One ledger row as a fragment with a probe that fails on main and passes on the branch; under 40 authored files; main merged in; local checks on the changed surface pass; all six required checks green on this head; for UI, a real render at 390, 1280, 1440, 1920 and 2000 signed in and out; for SQL, an additive idempotent migration with the `migration` label; an acceptance line saying what "live" means, including any database row or setting that could override the code. The author posts one handoff comment with the head SHA and sets `ready-to-merge`.

## The merge slot

One pinned comment on the issue: `SLOT: <free | ChatGPT | Claude> | PR #n | head <sha> | granted by Claude <time>`.

1. Only the holder merges or arms auto-merge. An already-armed auto-merge occupies the slot.
2. Claude grants the slot to one ready PR at a time; migration PRs only when next in the migration line.
3. Before the squash the holder rechecks current main, that the head equals the handoff SHA, conflicts, the six required checks on that head and the preview. Any mismatch returns the PR with `needs-claude` and the slot to `free`.
4. After the merge, in order: record the merge SHA; confirm the serving production deploy and the affected behavior on the live host; recheck every other open PR for conflicts and `migration-readiness`; post one receipt; set the slot `free`.
5. A production deploy that shows CANCELED is read before the next merge. A docs-only skip counts as equivalent only if the skipped files cannot change the build. `content/help/**` is bundled into the build, so a help-only merge is not equivalent.
6. The merger may merge main into a branch (never rebase or force-push). A conflict goes back to the author with `needs-claude`.

## Migrations

Migrations follow [ADR-1111](DECISIONS.md): additive, idempotent, applied to production before the PR merges, one at a time, then main merged into the next branch. Apply to the Frequency Community Supabase project, never "hook". Never reapply `20270346026000`. Only the person Daniel names applies SQL; where a tool refuses, Daniel pastes it.

## Check-ins on the issue

- One comment before starting work that touches shared files, and one claim per row (row id, owner, branch, paths).
- One receipt per merge: who, PR, merge SHA, production deploy and state, open PRs checked and any conflicts, acceptance run, blockers (exact failing check and log line), phrases needed from Daniel.
- Frequency Control is ChatGPT's release identity. Its comments on the issue are receipts, not noise.

## Hard rules

- No force-push. Squash on green. Never merge red. Never skip, quarantine or edit a test, probe, pin, baseline or threshold to get green.
- Cost beats speed: no empty commits, no speculative pushes, one push per iteration, never cancel a running build (only Daniel does).
- Never push to or arm auto-merge on the other agent's branch unless holding the slot for it.
