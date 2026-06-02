---
name: maintenance
description: Run a maintenance sweep on Frequency web — Supabase advisors (security/perf, e.g. missing RLS), migration drift (repo vs applied), outdated dependencies, build/lint/test, and open-PR CI status — then report and open a DRAFT PR for safe fixes. Draft-and-approve: never merges, never applies migrations, never bumps majors without showing the plan. Use on a schedule or when the user says "run maintenance" / "health check".
---

# /maintenance — Frequency web health sweep (draft-and-approve)

Surface everything that needs attention in one pass, then **prepare** fixes without
applying anything irreversible. Autonomy contract: **reads are automatic; anything that
changes prod (migrations, merges, major dep bumps, env) is drafted for approval.**

Work on the session's feature branch. Run all checks, THEN write one report.

## 1. Supabase
- Resolve this repo's project: `list_projects` and pick the Frequency project (confirm by
  name; do not assume the Hook project ref). Then `get_advisors` `security` and
  `performance`. Summarize each with its remediation URL as a clickable link; flag
  missing-RLS as **high**.
- `list_migrations` vs `supabase/migrations/` in the repo — report any drift.
- **Never** `apply_migration` / DDL `execute_sql` here. If a migration should be applied,
  write the exact step into the report and stop.

## 2. Dependencies
- `pnpm outdated` (+ `pnpm audit --prod` if available). Group major/minor/patch.
- Safe set = patch+minor. List majors separately with a one-line risk note. **Next.js here
  is a non-standard build with breaking changes (see AGENTS.md) — never auto-bump Next or
  other majors.**

## 3. Build, lint, test
- `pnpm build`, `pnpm lint`, and `pnpm test` (vitest). Capture failures with the output.

## 4. GitHub (repo `hellofrequencylab/frequency-web`)
- List open PRs; check CI status per PR via the GitHub MCP tools. Note red checks or PRs
  stale > 7 days. Do not merge.

## 5. Report + draft (the only outputs)
A single dated **Maintenance Report**: Supabase security, Supabase performance, migration
drift, dependencies, build/lint/test, open PRs. Each item: severity, one-line description,
concrete fix.

Then, draft-and-approve:
- Safe mechanical fixes (patch/minor bumps, lint autofix) → apply on the feature branch,
  run `pnpm build` + `pnpm test`, commit, push, open a **draft** PR titled
  `chore: maintenance sweep <date>` with the report as the body (GitHub MCP, draft).
- Risky/ambiguous (major bump, migration, env, RLS change) → DO NOT do it; list under
  "Needs your call" with the exact command/diff.
- Docs protocol (docs/DOCS-PROTOCOL.md): technical changes → update `docs/*.md` and add an
  ADR to `docs/DECISIONS.md` if a decision was made; operator-facing → Notion training DB.
  The Stop hook will nudge on drift.

End in chat with: counts per severity, what you auto-fixed, and the top 3 items needing approval.
