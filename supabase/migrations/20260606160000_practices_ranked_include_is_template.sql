-- =====================================================================
-- Fix: practices_ranked must include is_template (ADR-116 follow-up)
-- =====================================================================
-- The ranking view was created in 20260606140000 as `select p.*, …`, which
-- FREEZES its column list at creation time. `is_template` was added later
-- (20260606150000), so the view never gained it — yet the ranked reads
-- (lib/practices.ts: listPublicPractices / getRankedPractice) select
-- `is_template` from this view. On a fresh database that left the library read
-- empty and detail pages 404'ing.
--
-- Rebuild the view so `p.*` re-expands to include is_template. DROP+CREATE
-- (not CREATE OR REPLACE) because the new column lands mid-list, which
-- CREATE OR REPLACE VIEW rejects. No other object depends on this view.
-- Idempotent + safe to re-run.
-- =====================================================================

BEGIN;

drop view if exists practices_ranked;
create view practices_ranked
  with (security_invoker = true) as
select
  p.*,
  coalesce(a.adopters, 0)   as adopters,
  coalesce(l.logs_30d, 0)   as logs_30d,
  coalesce(l.logs_total, 0) as logs_total,
  (coalesce(l.logs_30d, 0) * 3
   + coalesce(a.adopters, 0) * 2
   + coalesce(l.logs_total, 0)) as score
from practices p
left join (
  select practice_id, count(*) as adopters
  from member_practices where active = true
  group by practice_id
) a on a.practice_id = p.id
left join (
  select practice_id,
         count(*) filter (where logged_for >= current_date - 30) as logs_30d,
         count(*) as logs_total
  from practice_logs
  group by practice_id
) l on l.practice_id = p.id;

revoke all on practices_ranked from anon, authenticated;
grant select on practices_ranked to service_role;

COMMIT;
