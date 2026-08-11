# Maintenance automation — the self-maintaining web platform

> The plan to turn Frequency web's maintenance from **human-invoked skills** into a
> **scheduled, stateful, tiered-autonomy loop**. Every quality dimension already has a
> guard or a scan; the work here is stitching them into a system that runs itself, surfaces
> only *new* problems, fixes the safe ones, and escalates the rest. This is the durable
> spec + status ledger — update the phase table as items ship.

Related: [`docs/DECISIONS.md`](DECISIONS.md) (ADRs), [`docs/META-SCAN-STATUS.md`](META-SCAN-STATUS.md)
(the audit ledger), the `/maintenance` + `/meta-scan` skills, [`docs/DOCS-PROTOCOL.md`](DOCS-PROTOCOL.md).

## 1. Where we already are

Maturity is real — the gap is *cadence*, not tooling.

| Layer | Mechanism | Status |
|---|---|---|
| Per-PR floor | `ci.yml`: tsc · lint · test · `check:authz` · `check:canon` · `check:seo` · a11y axe; `docs-drift`; `help-autodoc` | ✅ |
| SAST | `codeql.yml` (weekly + PR) | ✅ |
| Dependency updates | Dependabot (weekly grouped minor/patch, individual majors, GitHub Actions) | ✅ |
| Data-flow crons | 19 Vercel crons (embeds, nurture, retention, queue, reminders…), `CRON_SECRET`-guarded | ✅ |
| Deep audits | `/maintenance` (advisors+drift+deps→draft), `/meta-scan` (17-dimension sweep) | ⚠️ **human-triggered** |
| RLS/RPC tests | `db-tests.yml` pgTAP (`supabase test db`) | ⚠️ **manual — not a PR gate** |
| AI-in-CI pattern | `help-autodoc` = Node `.mts` + Anthropic API (`ANTHROPIC_API_KEY` secret) | ✅ (reused below) |

**The core gap:** the powerful pieces (advisor sweeps, meta-scan, RLS tests) run only when a human
asks. (`cron-freshness` did too until 2026-08-11; it is now weekly in `maintenance.yml`, see §7a.)
Automating "the entire experience" = a scheduler + a stateful diff (surface only *new* findings) +
a codified autonomy policy (what auto-fixes vs escalates).

## 2. The architecture — four tiers by blast radius

| Tier | Cadence | Scope | Autonomy |
|---|---|---|---|
| **0 — Floor** | per-PR | guard family + (goal) gated `db-tests` | block merge |
| **1 — Auto-fix** | daily/weekly | Dependabot merges, lint-autofix, migration-ledger reconcile, doc-drift, sitemap coherence | CI-gated → **auto-merge** |
| **2 — Draft + escalate** | weekly | *new* advisor deltas, majors, migrations, data-integrity | AI drafts PR + report → **human approves** |
| **3 — Alert** | continuous | cron-freshness + SLO breach + storage growth | **page + AI investigates** |

**The three glue pieces** that turn skills into a system:
1. **A scheduler** — `schedule:`-triggered GitHub Actions (reusing the `help-autodoc` Node+Anthropic pattern) that invokes the sweep on a cadence.
2. **A stateful diff** — the sweep reads `META-SCAN-STATUS.md` + a machine-readable **accepted-risk allowlist** and surfaces only *new* deltas, so it's quiet-by-default and trustworthy (never re-reports the 196 by-design advisories or ADR-507's extensions).
3. **A codified autonomy policy** — which finding-classes auto-fix+merge vs draft vs alert, so behavior is deterministic and safe.

## 3. Phases + status

Autonomy legend: **🟢 buildable + verifiable in-repo** · **🟡 needs an owner secret/config to fully arm** · **🔴 verification-gated (a precondition must be green first)**.

| Phase | Deliverable | Autonomy | Status |
|---|---|---|---|
| **0** | This roadmap | 🟢 | ✅ shipped |
| **1** | `check:rls` static guard + CI (every `create table` gets RLS + a policy or a documented deny-all) | 🟢 | ✅ shipped — `scripts/check-rls.mjs` + `rls-deny-all.txt` (69 tables), CI-wired, 5 self-tests |
| **2** | Accepted-risk allowlist (`scripts/maintenance/accepted-advisories.json`) + `advisor-diff.mjs` (surfaces only new findings) + test | 🟢 (diff logic) / 🟡 (advisor fetch needs `SUPABASE_ACCESS_TOKEN` in CI) | ✅ shipped — pure `diffAdvisors()` + 6 self-tests; fetch arms with the token |
| **3** | `maintenance.yml` scheduled workflow — `pnpm audit` + advisor diff, opens an **issue on delta** (default `GITHUB_TOKEN`) | 🟢 | ✅ shipped — weekly (Mon 07:17 UTC) + manual; quiet unless there's a new finding |
| **4** | `scripts/maintenance/sweep.mts` — the AI triage step (help-autodoc pattern): triages the sweep's findings into a prioritized action list folded into the tracking issue. Advises only; never edits code. | 🟡 (uses existing `ANTHROPIC_API_KEY`) | ✅ shipped — gated + non-fatal; for full draft-PR autonomy, arm a scheduled Claude Code session running `/maintenance` (below) |
| **5** | Gate `db-tests` on PRs | 🔴 (precondition: a fresh full apply is green — the migration-ledger reconciliation, OPEN-THREADS A2) | 📋 owner/verification |
| **6** | Storage orphaned-object GC cron (reference-based, dry-run first) + bucket-policy audit | 🟢 (build) / 🟡 (arming touches prod storage) | 📋 |
| **7** | Schedule `check:cron-freshness` + wire one alert channel (Slack/email webhook) | 🟢 (scheduling) / 🟡 (alert channel) | ⏳ **half shipped**: scheduled in `maintenance.yml`; alert channel still 📋. See §7a |
| **8** | Data-integrity scan (orphaned FKs, soft-delete leaks) + index hygiene (missing FK indexes, post-traffic unused-index review) | 🟡 (DB access in CI) | 📋 |

## 4. The accepted-risk allowlist (the anti-noise contract)

`scripts/maintenance/accepted-advisories.json` is the machine-readable record of advisories
we've **consciously accepted**, so the scheduled sweep stays silent about them and screams only
about *new* ones. Each entry cites the ADR/rationale. Seed set:

- `extension_in_public` × 3 (`vector`/`postgis`/`pg_trgm`) — ADR-507.
- `rls_enabled_no_policy` — deny-all is the safe default for service-role-only tables (documented per-table).
- `anon_security_definer_function_executable` / `authenticated_…` — definers scope via `auth.uid()` + pinned `search_path` (ADR-004); anon EXECUTE returns nothing without a session.
- `unused_index` — pre-traffic noise; revisit after real workload (META-SCAN-STATUS).
- `rls_disabled_in_public` = `spatial_ref_sys` — PostGIS catalog, cannot enable RLS, no user data.

**Rule:** an advisory may be added to the allowlist ONLY with a one-line rationale + an ADR
reference. The sweep treats anything not on the list as a new finding to surface.

### 3a. The full-autonomy AI layer (owner-armed)

The Phase 4 `sweep.mts` step *advises* (triages findings into the tracking issue). For the
Tier-2 loop's full **draft-and-approve** power — the AI reading advisors + drift + deps and
opening a **draft PR** with safe fixes — arm a **scheduled Claude Code session** (this platform)
that runs the `/maintenance` skill weekly. That skill already does the whole draft-and-approve
flow (never merges, never applies migrations, drafts risky items for approval). This is
strictly more capable than a bespoke SDK script because it reuses the full agent + skill, so it
is the recommended path for autonomous fixes; the in-CI `sweep.mts` is the always-on advisory floor.

### 7a. Cron heartbeat coverage: what landed, and what it can actually establish

**Shipped 2026-08-11.** `scripts/cron-freshness.mjs` was the one guard the repo defined that ran
in **no workflow at all**: 27 cron jobs watched by a human remembering to type
`pnpm check:cron-freshness`. It now runs weekly as the **Cron heartbeat coverage** step in
[`.github/workflows/maintenance.yml`](../.github/workflows/maintenance.yml), beside the ledger
parity check, and files into the same tracking issue on a delta.

**It needs no credential, and that is the finding**, not a workaround. The script reads
`vercel.json`, the route tree, and its own process env. It never touches a database, never makes an
HTTP call, and never reads the *value* of a heartbeat variable. So the question splits in two, and
the step treats the halves differently on purpose:

| Half | Established from | Verdict | Exit |
| :--- | :--- | :--- | :--- |
| Every cron has a route handler, wrapped in `withCronHeartbeat` under its own job name, with a schedule that parses to a real fresh-by window | the repo alone | strict, opens the tracking issue | 1 |
| Whether a monitor URL is configured, provisioned, and actually receiving pings | Vercel Production and the monitor account | advisory `ℹ️`, never a clean bill of health | 0 |

**Why the second half is advisory.** `CRON_HEARTBEAT_BASE_URL` lives in Vercel Production. A CI
runner is not that environment, so a variable absent *there* says nothing about production, and
failing a build on it would fail for a fact no pull request can change. That is ADR-970's split
(`check:help`) and the one `check:research-freshness` follows. The verdict therefore has three
states rather than two: **covered**, **blind** (only where the observation is authoritative, i.e.
`VERCEL=1`), and **NOT ESTABLISHED**. Until 2026-08-11 the script collapsed the third into the
second and printed "27 paging-blind" on every machine, including after the owner armed the base URL.

**The floor.** A gate that scans nothing reports a clean bill of health: zero crons means zero
uncovered crons, so an unreadable `vercel.json` would print a flawless coverage table. `MIN_JOBS`
= 15 (27 today, and the corpus has only grown from 19), same idiom as `MIN_PAGES` in
`check-templates.mjs`. The floor is on the **job list**, not on coverage, because coverage
legitimately reads as zero from any machine that is not the deployment.

**Two live gaps this made visible**, neither of which the step pretends to close:

- **Resolution is not provisioning.** A shared base ping key resolves a URL for all 27 jobs, and
  the Healthchecks.io free tier holds **20**. The report says so rather than counting 27 covered
  ([`FINALIZE-PLAN.md`](FINALIZE-PLAN.md) §7c has the tier decision and the suggested 20).
- **Nothing measures whether pings are ARRIVING.** That is the actual freshness question and it
  needs a read-only `HEALTHCHECKS_API_KEY`, which nobody has set. No fetch was written against a
  key that does not exist; the report names the gap instead. **This, plus the alert channel below,
  is what keeps item 7 at ⏳ rather than ✅.**

One defect fell out of reading the parser: `journey-drips` (`15,45 * * * *`) had no matching case,
fell back to "assume daily", and advertised a fresh-by window of **2 days for a job that runs every
30 minutes**. `parseSchedule` now expands lists, ranges and steps, takes the largest gap in the
cycle, and **refuses** any shape it does not understand instead of guessing a window.

## 5. Owner actions (arm the 🟡/🔴 pieces)

- **`SUPABASE_ACCESS_TOKEN`** repo secret → lets the scheduled sweep fetch advisors in CI (Phase 2/4 full arming).
- **Alert webhook** secret (Slack/email) → Phase 7 paging. The cron half of item 7 is scheduled
  (§7a); what is still missing is a channel that reaches a human faster than a weekly issue, plus a
  read-only `HEALTHCHECKS_API_KEY` if the sweep is ever to check that pings actually arrived.
- **db-tests green** → run `db-tests` from the Actions tab; once a fresh full apply passes, flip the `pull_request` trigger in `db-tests.yml` (Phase 5).
- **Confirm PITR/backups** on the Supabase plan + note the restore runbook.

## 6. Non-goals (deliberate)

- No auto-apply of migrations or major dep bumps from the scheduled sweep — those always draft-and-escalate (Tier 2).
- No moving `public`-schema extensions (ADR-507).
- No pruning `unused_index` before real traffic informs which stay cold.
