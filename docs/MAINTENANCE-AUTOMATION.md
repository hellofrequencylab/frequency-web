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

**The core gap:** the powerful pieces (advisor sweeps, meta-scan, RLS tests, cron-freshness)
run only when a human asks. Automating "the entire experience" = a scheduler + a stateful diff
(surface only *new* findings) + a codified autonomy policy (what auto-fixes vs escalates).

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
| **4** | `scripts/maintenance/sweep.mts` — the AI triage step (help-autodoc pattern): reads the diff + guard results, opens a **draft PR/issue** with the report | 🟡 (uses existing `ANTHROPIC_API_KEY`) | ⏳ |
| **5** | Gate `db-tests` on PRs | 🔴 (precondition: a fresh full apply is green — the migration-ledger reconciliation, OPEN-THREADS A2) | 📋 owner/verification |
| **6** | Storage orphaned-object GC cron (reference-based, dry-run first) + bucket-policy audit | 🟢 (build) / 🟡 (arming touches prod storage) | 📋 |
| **7** | Schedule `check:cron-freshness` + wire one alert channel (Slack/email webhook) | 🟡 (alert webhook secret) | 📋 |
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

## 5. Owner actions (arm the 🟡/🔴 pieces)

- **`SUPABASE_ACCESS_TOKEN`** repo secret → lets the scheduled sweep fetch advisors in CI (Phase 2/4 full arming).
- **Alert webhook** secret (Slack/email) → Phase 7 paging.
- **db-tests green** → run `db-tests` from the Actions tab; once a fresh full apply passes, flip the `pull_request` trigger in `db-tests.yml` (Phase 5).
- **Confirm PITR/backups** on the Supabase plan + note the restore runbook.

## 6. Non-goals (deliberate)

- No auto-apply of migrations or major dep bumps from the scheduled sweep — those always draft-and-escalate (Tier 2).
- No moving `public`-schema extensions (ADR-507).
- No pruning `unused_index` before real traffic informs which stay cold.
