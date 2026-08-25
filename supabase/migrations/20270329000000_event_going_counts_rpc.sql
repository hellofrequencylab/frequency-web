-- /events listing: per-event confirmed-'going' RSVP counts, aggregated in the database.
--
-- WHY. app/(main)/events/index-data.ts read every 'going' RSVP row for the whole listing —
-- `event_rsvps.select('event_id').in('event_id', eventIds).eq('status','going')`, no limit — purely
-- to tally one small integer per event in JS. The listing carries up to 3 x SERIES_WIDE_READ (1,500)
-- events, so that read scales with TOTAL ATTENDANCE across the catalog while the answer it produces
-- stays one integer per event.
--
-- Worse, it was silently WRONG past a point and would have stayed quiet about it: PostgREST caps a
-- response at `max_rows` (1,000 — supabase/config.toml), applied SERVER-SIDE, and neither
-- service_role nor a `.limit()` escapes it. The 1,001st 'going' row was dropped with no error, so
-- `rsvpCounts` under-counted, which flips the "Has open spots" facet ON for an event that is full
-- and mis-orders the Popularity sort. Same class as the QR capture count (ADR-969) and the CRM
-- import dedupe truncation (ADR-962).
--
-- This mirrors node_capture_counts (20270219000000) exactly: one bounded, server-side group-by,
-- SECURITY DEFINER so it can read past RLS, service_role only, with the viewer gate staying on the
-- calling loader (which reads the counts as social proof, never as access).
--
-- BOUNDED BY ITS INPUT, deliberately. node_capture_counts takes no argument because `nodes` is a
-- small operator-managed table; `events` is not, and an RPC response goes through the SAME
-- `max_rows` cap a table read does. So this takes the id array the caller already has, returns at
-- most one row per requested id, and the caller chunks its input to 500 ids per call — comfortably
-- under 1,000, so a full response can never be a truncated one.
--
-- ROLLBACK: drop function if exists public.event_going_counts(uuid[]);

create or replace function public.event_going_counts(p_event_ids uuid[])
returns table (event_id uuid, going integer)
language sql
security definer
set search_path = ''
stable
as $$
  select r.event_id, count(*)::int as going
  from public.event_rsvps r
  where r.event_id = any(p_event_ids)
    and r.status = 'going'
  group by r.event_id;
$$;

comment on function public.event_going_counts(uuid[]) is
  'Events listing: confirmed going-RSVP count per event, aggregated server-side for a bounded set of event ids. Replaces a whole-listing read of public.event_rsvps that both scaled with total attendance and truncated at PostgREST max_rows. SECURITY DEFINER, service_role only; the viewer gate stays on the calling loader. See app/(main)/events/index-data.ts and lib/events/going-counts.ts.';

-- Same grant posture as node_capture_counts / qr_stats_summary: nothing but service_role may
-- execute it. `revoke ... from public` on a FUNCTION does remove the default EXECUTE (functions,
-- unlike tables, are granted to PUBLIC by default rather than per-role), and anon/authenticated are
-- named explicitly anyway so the intent survives a future default-privilege change (ADR-959/964).
revoke execute on function public.event_going_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.event_going_counts(uuid[]) to service_role;
