-- cron_run_markers had no purge, so it only ever grew (LIVE-174; the table arrived in
-- 20270345000700, scan two L2-02).
--
-- THE DEFECT. The marker is a once-per-period CLAIM, not a record with a life of its own:
-- app/api/cron/weekly-digest/route.ts inserts `weekly-digest:<profile_id>:<ISO week>` before it
-- sends, and deletes it only when the send THROWS. Every successful send therefore left a row
-- behind permanently, at one row per active member per week (~52 x members a year), and no
-- other writer, trigger, cron, or pg_cron job ever removed one. Nothing was going to stop it:
-- the key embeds the ISO week, so a row can never be consulted again once its week has passed.
--
-- THE FIX is app-side, in the nightly retention cron that already bounds member_tags,
-- interaction_events and studio_draft (lib/consent/retention.ts, CRON_MARKER_RETENTION_DAYS =
-- 60). This migration is the SCHEMA half of that sweep, and it is two additive pieces:
--
--   1. An index on created_at. The purge is `delete ... where created_at < $cutoff` and the
--      table's only index is the primary key on `key`, so the sweep would seq-scan the whole
--      table every night — the cost growing with exactly the thing the sweep exists to bound.
--      Plain `create index` inside the transaction, not CONCURRENTLY: the table holds 0 rows
--      today (measured on production 2026-09-06, pg_stat_user_tables n_tup_ins = 0), so the
--      lock is instantaneous, and CONCURRENTLY cannot run in a transaction block.
--
--   2. The retention window written into the table comment, so `\d+ cron_run_markers` answers
--      "how long do these live?" without reading TypeScript. The comment is the only place the
--      schema can say it; the number itself stays in code, where the sweep reads it.
--
-- WHY 60 DAYS. A marker is only consulted for the key of the week being sent, so the
-- correctness floor is one ISO week plus a nightly run; everything above that is kept for
-- operators, who need "was this member covered, and when?" answerable for a while after a
-- digest complaint. 60 days is ~8 weeks of that, and bounds the table at (members x ~8) rows
-- forever. Full reasoning: CRON_MARKER_RETENTION_DAYS in lib/consent/retention.ts.
--
-- No new table, no policy, no function: RLS, grants and function-grants are all unchanged.
--
-- Rollback: drop index public.cron_run_markers_created_at_idx; (the comment may stay, or be
-- reset to the text in 20270345000700). Revert the app side first only if you want the sweep
-- gone as well — the delete is correct with or without the index, just slower.

begin;

create index if not exists cron_run_markers_created_at_idx
  on public.cron_run_markers (created_at);

comment on table public.cron_run_markers is
  'Per-period claim rows for crons whose send path has no idempotency seam (weekly-digest: weekly-digest:<profile_id>:<ISO week>). A row means the send for that key was claimed; the cron releases it if the send throws. Service-role only. Swept by the nightly enforce-retention cron at CRON_MARKER_RETENTION_DAYS (60 days, lib/consent/retention.ts) — a row older than its own week is evidence, not state.';

commit;
