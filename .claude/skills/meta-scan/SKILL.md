---
name: meta-scan
description: Full-repo meta scan of Frequency web — sweep every dimension (orphans, unplugged routes/pages, undeveloped wiring, SEO/AIO, performance, security, correctness bugs, naming/voice/page-framework canons, DB⇄code hygiene, a11y, docs drift), adversarially verify findings, fix the safe subset, and report a master to-do. Use when the user says "meta scan", "full audit", "find everything left", or wants a systematic health+cleanup pass beyond /maintenance.
---

# /meta-scan — full-repo audit + systematic cleanup

`/maintenance` checks operational health (advisors, drift, deps, CI). `/meta-scan` goes
wider: it hunts orphaned/undeveloped/unplugged code and brings every quality dimension
toward 10/10. Read the canons first (`docs/NAMING.md`, `docs/CONTENT-VOICE.md`,
`docs/PAGE-FRAMEWORK.md`, `SEO-AEO-PLAN.md`) — they are the spec you audit against.

## 0. Sandbox reality (READ FIRST — hard-won)

This environment (4 cores) **hangs when 2+ subagents run concurrently**, especially on
grep/`tsc`/`build`. Do NOT fan out parallel agents here. Instead:
- Run agents **sequentially** — one `await agent(...)` at a time (a Workflow with sequential
  `await`s is ideal), or synchronous `Agent` calls one after another.
- Forbid agents from running `pnpm build` / `pnpm test` / `pnpm exec tsc` — they hang the box.
  Agents run `pnpm lint <changed files>` only; the **orchestrator** runs the full
  tsc/lint/test once per integrated batch.
- Never run a heavy build in the foreground while an agent is working.

## 1. Dimensions (one focused pass each)

orphaned components/exports · orphaned lib/deps · unplugged pages + route handlers ·
undeveloped/half-wired features · SEO/AIO (metadata, sitemap, robots, JSON-LD, llms.txt,
headings, OG) · performance (Suspense, serial awaits, `cookies()`/ISR, `next/image`, N+1) ·
security (auth on every route + server action, admin-client sites, webhook signatures,
input validation, secrets) · correctness bugs (member app / core lib / admin) · naming
canon · voice canon · page-framework · DB⇄code hygiene · UI consistency · a11y + error UX ·
docs drift.

Each finder is READ-ONLY, cites real file:line, and proves "dead/orphaned" with the searches
it ran (imports, dynamic refs, registries, DB-driven refs) before claiming it.

## 2. Verify before fixing

Adversarially re-verify every high/medium finding (a second pass that tries to REFUTE it and
reads the actual code + this Next version's docs in `node_modules/next/dist/docs/`). Many
"findings" are already fixed or false. Only fix what survives.

## 3. Fix policy (draft-and-approve for anything irreversible)

- **Safe** (behavior-preserving or clearly-correct, covered by the suite): fix, verify, commit
  in small per-domain batches. Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`,
  `pnpm check:authz`, `pnpm check:canon` before each commit.
- **Migrations**: apply only what's verified safe. Before dropping ANY table/function, confirm
  in the DB it has 0 rows-that-matter, 0 incoming FKs, 0 triggers, 0 RLS-policy deps, and 0
  other-function-body callers (`pg_policies` + `pg_proc.prosrc` word-boundary checks). After
  applying via MCP, reconcile `supabase_migrations.schema_migrations.version` to match the repo
  filename (zero drift) and commit the migration file.
- **Destructive / high-blast-radius** (dropping a table with data, revoking EXECUTE on
  SECURITY DEFINER functions the app calls, major dep bumps): DRAFT it and put it under
  "Needs your call" — do not apply blind. A SECURITY DEFINER lockdown must be a *tested*
  per-function pass (public feed/discover RPCs are legitimately anon-callable).
- **Column drops with a code write**: remove + deploy the code write first, THEN drop.

## 4. Deliverables

- Per-domain commits, each tsc/lint/test-green, on the session branch → **draft PR**.
- `docs/META-SCAN-STATUS.md` — the durable master to-do: what shipped + what's left, each
  remaining item with severity + the exact fix. Update it as items close.
- Chat report: a 10/10 scorecard per dimension (security, wiring, SEO/AIO, speed, a11y, …)
  with the honest gap-to-10, then the master to-do.

## 5. Keep-it-clean processes (wire these so the cleanup doesn't regress)

- `pnpm check:canon` (scripts/check-canon.mjs) — no em dashes / lowercase Zaps·Gems / "cohort"
  in `content/**` member copy. Add to the CI `checks` job once content is clean.
- `pnpm check:authz` — every admin-client mutation self-guards or is consciously delegated.
- Migration-drift + advisor sweep live in `/maintenance`; run it on a schedule.
