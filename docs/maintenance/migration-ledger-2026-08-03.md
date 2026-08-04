# Migration Ledger Reconciliation — repo vs. production

**Project:** Frequency Community production (`azsqfeonabsbmemvddqd`)
**Repo:** `/home/user/frequency-web/supabase/migrations/`
**Date:** 2026-08-03 · Read-only analysis; nothing was applied or modified.

## Answer first

The ledger is in very good shape: **581 repo files vs. 583 ledger rows, with only 7 discrepancy items total**, all explained.

| Check | Count | Status |
| --- | --- | --- |
| Repo migration files (14-digit version prefix) | 581 | — |
| Prod ledger rows (`list_migrations`) | 583 (583 distinct versions, no duplicate versions) | — |
| Version present in both, name matches | 578 | ✅ |
| (a) In repo, NOT in ledger | **2** | ⏳ pending apply (merged today) |
| (b) In ledger, NO matching repo file | **4** | ⚠️ duplicate rows, content IS in repo under later versions |
| (c) Same version, different name | **1** | ⚠️ cosmetic name-field error, content verified applied |

No migration is *missing* from production: every schema change in the repo is either in the ledger or is one of the two files merged today (2026-08-03) and verified absent from the live schema (columns do not exist yet).

## (a) In repo, not in the prod ledger — 2 files

Both landed in PR #2002 (commit `251dbfe`, merged 2026-08-03, ADR-920 "Practices become commitments"). **Neither header carries a NOT APPLIED marker**, so by the strict marker test they are "unmarked / possibly forgotten" — but their age (same-day) makes "not yet applied" the far more likely story than "forgotten."

| Version | File | Marker? | Verified against live schema |
| --- | --- | --- | --- |
| `20270204000000` | `member_practice_terms.sql` | none | ✅ Applied — all four of `member_practices.source/term_weeks/cue/retired_at` present in prod (re-verified 2026-08-04) |
| `20270205000000` | `practice_reminder_prefs.sql` | none | ✅ Applied — the `notification_preferences` practice columns are present in prod (re-verified 2026-08-04) |

**RESOLVED 2026-08-04.** Both were applied shortly after this ledger was written; a live `information_schema.columns` check confirms all four columns on `member_practices` and the practice columns on `notification_preferences`. This file's single 🔴 drift finding no longer holds, and the sentence that once read "production is running code whose migrations have not been applied" is retained here only so the correction is legible rather than silent.

The residual, and it is a real one: these two rows still do not appear in the prod ledger under their repo version numbers, because migrations applied through the MCP are stamped with their own timestamps. `check:migrations` only enforces filename uniqueness inside the repo, so it cannot see that divergence. A fresh `db push` would re-run them — harmless, since both are `add column if not exists`, but the ledger is not a reliable record of what ran.

### Cross-reference: the "NOT APPLIED" / "SQL editor" marker files

- 31 files contain a `NOT APPLIED` / `NOT yet applied` marker; 54 contain an "applied via the Supabase SQL Editor" house-style note (overlapping sets; full list in `not_applied_files.txt` alongside this report).
- **Every single one of those marked files IS now in the prod ledger.** The markers are stale point-in-time PR notes ("ships as a file, integrator applies via SQL Editor"), not live drift. This matches `docs/WORKFLOW.md`: schema changes go via dashboard/MCP and are mirrored as files; `db push` is deliberately deferred until the team-scale baseline.
- Consequence: header markers are **not a reliable signal** of applied-status. Only the ledger (or the live schema) is.

## (b) In ledger, no matching repo file — 4 rows

All four are **real-clock-timestamp versions** (stamped 2026-07-29/30, the actual apply time via MCP/CLI) of migrations that the repo then committed under **sequential house-style versions — and those sequential versions were ALSO inserted into the ledger.** Each migration therefore has two ledger rows; the timestamp row is the orphan.

| Orphan ledger row (version → name) | Same migration in repo + ledger as |
| --- | --- |
| `20260729233348` event_host_transfers | `20270131000000_event_host_transfers.sql` |
| `20260730220819` pricing_gate_overrides_reset | `20270201000000_pricing_gate_overrides_reset.sql` |
| `20260730220834` event_ticket_fee_receipt | `20270202000000_event_ticket_fee_receipt.sql` |
| `20260730221236` seed_take_rate_vector | `20270203000000_seed_take_rate_vector.sql` |

So nothing was applied that the repo doesn't have — these need **ledger de-duplication (or annotation), not repo backfill**. Note the repo's `20270131000000_event_host_transfers.sql` file dates to 2026-07-29 (PR #1998), confirming the two-row story: applied once at the timestamp version, then re-recorded under the sequential version.

Risk note: if `supabase db reset` / fresh-apply is ever run against this history, the four migrations would run **twice** (once per version). They appear idempotent in house style, but the double-entry should be resolved before the "migration baseline" step in WORKFLOW.md §Scaling.

## (c) Same version, different name — 1 row

| Version | Repo file name | Ledger name | Verdict |
| --- | --- | --- | --- |
| `20240118000000` | `gamification` | `hierarchy_v3_topical_channels` | ⚠️ ledger **name field is wrong**, content applied |

Evidence: all 5 tables created by `20240118000000_gamification.sql` (`achievements`, `user_achievements`, `streaks`, `season_challenges`, `challenge_progress`) exist in prod, and the dependent `20240119000000_gamification_phase2` applied cleanly on top. The ledger name duplicates the (correct) `20240201000000` → `hierarchy_v3_topical_channels` row — almost certainly a copy-paste slip when the ledger row was hand-inserted. Cosmetic; fix is a one-row `name` update.

## Counts summary

| Metric | Value |
| --- | --- |
| Repo files | 581 |
| Ledger rows / distinct versions | 583 / 583 |
| Perfect version+name matches | 578 |
| Repo-only (not applied, verified against live schema) | 2 |
| Ledger-only (duplicate recordings of repo migrations) | 4 |
| Version match, name mismatch (content verified applied) | 1 |
| Files with stale NOT-APPLIED markers that are in fact applied | 31 (all in ledger) |

## Proposed reconciliation sequence (verify-first; nothing executed here)

1. **Close the live drift first (a).** Confirm PR #2002's deployed code paths tolerate the missing columns today. Then apply `20270204000000_member_practice_terms.sql` and `20270205000000_practice_reminder_prefs.sql` per house workflow (SQL Editor / MCP `apply_migration`, which also inserts the ledger row), and regenerate `lib/database.types.ts`. Both files are additive + idempotent; risk is low. Do NOT archive these — they are simply next in the queue.
2. **Verify the four double-entries (b) are true duplicates.** Diff each repo file against what the timestamp-version apply did (content is the same migration; spot-check one object per file, e.g. `event_host_transfers` table shape). Then choose one repair, executed as a single reviewed statement against `supabase_migrations.schema_migrations`:
   - *Preferred:* **delete the four orphan timestamp rows** (`20260729233348`, `20260730220819`, `20260730220834`, `20260730221236`), keeping the sequential rows that match repo filenames. Ledger then mirrors the repo 1:1.
   - *Alternative (audit-conservative):* keep both rows but record the mapping in `docs/DATABASE.md` so the future baseline squash knows they are one migration. Costs nothing now, but leaves a double-apply hazard for any fresh-apply path.
3. **Fix the cosmetic name (c):** update the `20240118000000` ledger row's `name` from `hierarchy_v3_topical_channels` to `gamification` (one-row UPDATE), or simply note it in `docs/DATABASE.md` if touching the ledger is deemed not worth it.
4. **Retire the stale markers' authority, not the files.** Do not move anything into a holding folder — all marked files are applied and must stay in sequence for the eventual baseline. Instead add one line to `docs/DATABASE.md` (or WORKFLOW.md): "header markers are point-in-time PR notes; applied-status truth is the prod ledger (`list_migrations`)." Optionally, a tiny CI check comparing repo filenames to the ledger (the `/maintenance` routine already covers migration drift) makes forgotten files impossible.
5. **Fold all of this into the planned baseline squash** (WORKFLOW.md "Scaling to a team" step 2): once steps 1–3 land, repo and ledger match 1:1, which is exactly the precondition for squashing to a clean baseline and switching to `db push`-only.

A holding folder for never-to-apply migrations is **not needed today**: the audit found zero abandoned files — every repo migration is either applied or freshly pending.

## Provenance

- Ledger source: `mcp__Supabase__list_migrations` on project `azsqfeonabsbmemvddqd` (2026-08-03); raw copy at `ledger.json` in this directory.
- Live-schema verifications: read-only `information_schema` SELECTs (columns for the two pending migrations; tables for the gamification name-mismatch).
- Marker inventory: `not_applied_files.txt` in this directory (31 files).
- Comparison script: `ledger.py` in this directory.

---

## Postscript — resolved same day

Applied 2026-08-03 (owner authorization "make sure all migrations are applied as we go"):
both pending migrations (`20270204000000_member_practice_terms`,
`20270205000000_practice_reminder_prefs`) executed against prod and recorded in the
ledger under their exact repo versions. Verified: 8/8 + 4/4 columns present, 2/2 ledger
rows. Repo ⇄ ledger drift for set (a) is now zero. The cosmetic repairs (4 duplicate
real-clock ledger rows, 1 wrong name field on `20240118000000`) remain open.

---

## 2026-08-04 — `pages` re-keyed to `(space_id, slug)`

| | |
|---|---|
| File | `supabase/migrations/20270209000000_pages_space_slug_unique.sql` |
| Applied | ✅ 2026-08-04, project `azsqfeonabsbmemvddqd` |
| Additive? | 🔴 **No** — it DROPS `pages_slug_key`. Applied on explicit owner instruction, not under the standing additive-only authorization. |
| ADR | [ADR-927](../DECISIONS.md) |

**Why it was needed.** The live DDL carried `pages_slug_key UNIQUE (slug)` beside a NON-unique
`pages_space_slug_idx (space_id, slug)`. The migration that space-scoped the table
(`20260710000000`) was an expand step that never took its contract step, while every reader and
writer in the app queries a page as `(space_id, slug)`. At per-Space authoring un-gate, a second
Space publishing `about` would either raise 23505 or have its `onConflict: 'slug'` upsert resolve
against another Space's row and overwrite it.

**Pre-flight, run immediately before applying:**

| Check | Result |
|---|---|
| Duplicate `(space_id, slug)` pairs | 0 |
| Rows with null `space_id` | 0 |
| Total pages | 5 |
| Unique constraints before | `pages_slug_key` |

**Verified after applying:**

```
pages_space_id_slug_key   UNIQUE NULLS NOT DISTINCT (space_id, slug)   ✅ present
pages_slug_key                                                          ✅ gone
pages_space_slug_idx                                                    ✅ dropped (redundant)
```

⚠️ **Ledger version mismatch.** The repo file is stamped `20270209000000`; the applied row is
`20260804042556`, because `apply_migration` assigns its own timestamp. The DDL is identical and
the migration is idempotent, so a later `db push` is a no-op — but the two ledgers disagree on
version, and anyone diffing by version rather than by name will see a phantom gap.

⚠️ `space_id` remains NULLABLE. `NULLS NOT DISTINCT` holds the key honest in the meantime;
a NOT NULL contract step is still owed.
