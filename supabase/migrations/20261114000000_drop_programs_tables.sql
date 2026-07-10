-- ⚠️ DESTRUCTIVE + IRREVERSIBLE — apply DELIBERATELY, and only AFTER the Programs
-- surfaces are fully removed and deployed. ⚠️
--
-- This migration DROPS the `programs` and `program_adoptions` tables that backed the retired
-- Library "Programs" content type (ADR-109 outreach toolkits). It is intentionally kept as a
-- SEPARATE migration from the safe RPC rewrite (20261113000000_community_library_drop_programs.sql)
-- so it can be applied on its own schedule, once the orchestrator has confirmed:
--   1. The community_library RPC no longer references `programs` (that migration is applied), and
--   2. No application code reads or writes `programs` / `program_adoptions` anymore.
--
-- There is NO down migration: dropped rows are gone. If a future feature needs this data,
-- restore it from a backup taken before this runs. Ordered child-first (program_adoptions has an
-- FK to programs) so the drops succeed without CASCADE surprises; `if exists` keeps it idempotent.

drop table if exists public.program_adoptions;
drop table if exists public.programs;
