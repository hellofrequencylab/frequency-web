-- QR Studio: per-node verified-capture counts, aggregated in the database.
--
-- WHY. app/(main)/admin/qr/page.tsx read `captures` WHOLE on every load —
-- `db.from('captures').select('node_id').eq('verified', true)` with no limit — purely to build a
-- count per node in JS. `captures` grows with every verified check-in the community ever makes, so
-- that read gets slower forever while the answer it produces stays one small integer per node.
--
-- Worse, it was silently WRONG at scale and would have stayed wrong quietly: PostgREST caps a
-- response at `max_rows` (1,000 on this project), so past that point the page under-counted
-- captures with no error to notice. Same class as the CRM import dedupe truncation (ADR-962).
--
-- This mirrors qr_stats_summary (20260819000100) exactly: one bounded, server-side group-by,
-- SECURITY DEFINER so it can read past RLS, service_role only, with the staff gate staying on the
-- calling page. The row count it returns is bounded by `nodes`, a small operator-managed table.
--
-- ROLLBACK: drop function if exists public.node_capture_counts();

create or replace function public.node_capture_counts()
returns table (node_id uuid, captures integer)
language sql
security definer
set search_path = ''
stable
as $$
  select node_id, count(*)::int as captures
  from public.captures
  where verified is true
    and node_id is not null
  group by node_id;
$$;

comment on function public.node_capture_counts() is
  'QR Studio: verified capture count per node, aggregated server-side. Replaces a whole-table read of public.captures that both scaled badly and truncated at PostgREST max_rows. SECURITY DEFINER, service_role only; staff gate at the calling page. See app/(main)/admin/qr/page.tsx.';

-- Same grant posture as qr_stats_summary: nothing but service_role may execute it. `revoke ... from
-- public` on a FUNCTION does remove the default EXECUTE (functions, unlike tables, are granted to
-- PUBLIC by default rather than per-role), and anon/authenticated are named explicitly anyway so
-- the intent survives a future default-privilege change (ADR-959/964).
revoke execute on function public.node_capture_counts() from public, anon, authenticated;
grant execute on function public.node_capture_counts() to service_role;
