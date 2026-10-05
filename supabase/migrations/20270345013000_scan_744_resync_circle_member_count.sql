-- =============================================================================
-- SCAN-744: resync circles.member_count after the invite-link double count.
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- joinViaInviteLink (app/(main)/admin/actions.ts) added one to circles.member_count by hand on
-- top of trg_memberships_member_count (20270345000500), so every invite-link redemption since
-- that trigger shipped counted twice. The code no longer touches the column. This re-runs the
-- one-time resync from section 3 of 20270345000500 so circles that were inflated stop reporting
-- full while seats are free. No schema change; idempotent; touches only rows that drifted.
-- =============================================================================
update public.circles c
   set member_count = live.n
  from (
    select c2.id, count(m.id)::integer as n
      from public.circles c2
      left join public.memberships m on m.circle_id = c2.id and m.status = 'active'
     group by c2.id
  ) live
 where live.id = c.id
   and c.member_count is distinct from live.n;
