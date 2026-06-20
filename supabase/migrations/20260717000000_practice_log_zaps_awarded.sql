-- =============================================================================
-- Un-log support: record the Zaps a practice log awarded (WEBSITE-CHANGES-PLAN
-- §3 B.1 / D4 = today-only un-log).
--
-- The un-log path (lib/practices.unlogPractice) reverses a practice log within a
-- short, today-only window. To reverse the Zap grant EXACTLY (the live amount can
-- drift as zap_config is tuned, or a practice's weight_class / reward_zaps can
-- change between log and un-log), we store the amount actually awarded on the log
-- row at log time and debit precisely that on un-log via a compensating
-- zap_transactions row (the after_zap_transaction trigger handles the negative).
--
-- One additive, backfill-safe column. Existing rows keep NULL (they predate the
-- un-log feature and are out of the today-only window anyway); logPractice writes
-- the live amount going forward; unlogPractice debits exactly it (treating NULL as
-- 0, so an old row can never over-debit).
--
-- NOTE: regenerate lib/database.types.ts after apply (the integrator's step). Until
-- then lib/practices.ts reaches the column through its untyped admin handle.
-- =============================================================================

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS zaps_awarded integer;

COMMENT ON COLUMN public.practice_logs.zaps_awarded IS
  'The base Zaps this log awarded at log time (lib/practices.logPractice). Read by the today-only un-log path (unlogPractice) to debit the grant EXACTLY via a compensating zap_transactions row. NULL on pre-feature rows (treated as 0, never over-debits).';
