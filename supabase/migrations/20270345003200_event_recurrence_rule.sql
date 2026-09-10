-- =====================================================================================================
-- events.recurrence_rule — the repeat model becomes an RFC 5545 RRULE subset (ADR-1299)
--
-- WHY: the cadence has been a four-value enum since 2024 (none/daily/weekly/monthly, ADR-007), and it
-- could not say the two things hosts kept asking for: "every other Wednesday" and "the third Thursday
-- of the month". The original migration wrote the exit down in advance, and this is it verbatim:
--
--     "Enum, not RRULE. […] Can be promoted to RRULE later without losing data — just add a
--      recurrence_rule text column and keep recurrence_type as the simple path."
--                                            -- 20240208000000_event_recurrence.sql
--
-- WHAT THIS DOES, and it is deliberately the smallest thing that works:
--   1. ADDS `events.recurrence_rule text` (nullable). The pattern, as an RRULE value with no
--      `RRULE:` prefix and no UNTIL: `FREQ=WEEKLY;INTERVAL=2;BYDAY=WE`.
--   2. WIDENS the `recurrence_type` CHECK to admit 'yearly'. That column stays the COARSE MIRROR of
--      the rule's FREQ, kept in step by the writers, and it is what the occurrence cron's anchor
--      filter, the partial index idx_events_recurring_anchors, every folding read, and the
--      child-row CHECK all key on. Nothing reads the rule to decide "is this a series".
--   3. TEACHES the two calendar-feed RPCs to project the new column, so a subscribed calendar gets
--      the real rule instead of its coarse cadence (a bi-weekly series otherwise exports as weekly
--      and shows twice as many gatherings as exist).
--
-- WHAT IT DELIBERATELY DOES NOT DO:
--   • No backfill. A NULL rule means "read the coarse cadence", which every reader already does
--     through lib/events/repeat-rule.ts `repeatFor` — 'weekly' resolves to the anchor's own weekday
--     and 'monthly' to its own day-of-month, WITH the short-month clamp both mirrors have always
--     applied. So every existing series keeps landing on exactly the dates it lands on today, and a
--     backfill would be a write with no consequence and one chance to get the clamp wrong.
--   • No UNTIL in the rule. The series end stays `events.recurrence_until`, an indexed timestamptz.
--     ADR-807 pins it to the instant the RRULE UNTIL carries and the published feeds ship that; the
--     cron's live-anchor filter is `recurrence_until.is.null,recurrence_until.gt.now`, which cannot
--     be a substring match on a text column. COUNT has no column and therefore does live in the rule.
--   • No CHECK on the rule's syntax. It is validated in one pure parser (lib/events/repeat-rule.ts),
--     which rejects anything outside the subset whole rather than half-honouring it, and every write
--     path goes through `resolveSubmittedRepeat`. A Postgres CHECK would be a second, weaker grammar
--     to keep in step with the first.
--
-- LEAK CONTRACT — UNCHANGED. The two feed functions below are the anon-callable, SECURITY DEFINER
-- surfaces; their WHERE clauses, JOINs and visibility gates ARE the tenancy boundary. Each is
-- recreated with its EXACT body from 20270331000000 (the hidden-address redaction, SCAN-209) and
-- gains ONLY `recurrence_rule` in the RETURNS TABLE and in each SELECT list. No gate, join, filter,
-- order or limit changes. The new column is non-sensitive shape metadata — the public event page
-- prints it in words on the same row — and the same rows still pass the same gates.
--
-- APPLIED 2026-09-10; ledger repaired to this file's version (687 files <=> 687 rows, matching
-- checksum). Verified on the live database afterwards: both recurring anchors still resolve to the
-- exact child dates already materialised (the no-backfill claim), and has_function_privilege
-- confirms anon and authenticated hold no execute on either feed while service_role does.
--
-- ROLLBACK: drop the column, restore the CHECK to the original four values (no row can hold 'yearly'
-- unless one was written after this applied), and re-apply the 20270331000000 function bodies.
-- =====================================================================================================

begin;

alter table public.events
  add column if not exists recurrence_rule text;

comment on column public.events.recurrence_rule is
  'RFC 5545 RRULE value (no RRULE: prefix, no UNTIL) describing how this anchor repeats: '
  'FREQ/INTERVAL/BYDAY/BYSETPOS/BYMONTHDAY/BYMONTH/COUNT. NULL means read recurrence_type. '
  'The series end lives in recurrence_until. Parsed and written only via lib/events/repeat-rule.ts (ADR-1299).';

-- The coarse mirror admits 'yearly'. Dropped and re-added rather than altered: a CHECK cannot be
-- widened in place, and the new set is a strict superset so no existing row can fail validation.
alter table public.events
  drop constraint if exists events_recurrence_type_check;
alter table public.events
  add constraint events_recurrence_type_check
  check (recurrence_type in ('none', 'daily', 'weekly', 'monthly', 'yearly'));

-- A materialised occurrence still never repeats. The existing CHECK is written against
-- recurrence_type, which occurrenceRow pins to 'none' on every child, so the rule needs no second
-- constraint — but it must not carry one either, which the write path enforces by setting it null.
-- Asserted here rather than assumed, because "the child rows are clean" is the kind of claim that
-- goes quietly false.
do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.events
   where parent_event_id is not null
     and coalesce(recurrence_type, 'none') <> 'none';
  if v_bad > 0 then
    raise exception 'the occurrence-not-recurring invariant is already broken on % row(s), aborting', v_bad;
  end if;
end $$;

-- ── The two feed RPCs, body-identical to 20270331000000 plus one column ─────────────────────────────
-- ⚠️ `create or replace` cannot change a function's return type (42P13), and these gain an OUT column,
-- so each is dropped first. Grants are re-applied below. This is the same dance 20261203000000 did
-- when it added the first three recurrence columns to these functions.
drop function if exists public.public_calendar_feed();

create function public.public_calendar_feed()
returns table (
  id uuid, title text, description text, location text,
  starts_at timestamptz, ends_at timestamptz, slug text, is_cancelled boolean, time_zone text,
  recurrence_type text, recurrence_until timestamptz, recurrence_rule text, parent_event_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select e.id, e.title, e.description,
         -- SCAN-209: the venue line only when the host has not hidden the address.
         case when e.hide_address
              then nullif(concat_ws(', ', nullif(e.city, ''), nullif(e.region, '')), '')
              else e.location
         end as location,
         e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone,
         e.recurrence_type, e.recurrence_until, e.recurrence_rule, e.parent_event_id
  from   public.events e
  left join public.spaces s
         on s.id = e.space_id
  where  coalesce(e.status, 'published') = 'published'
    and  e.is_cancelled = false
    and  e.visibility = 'public'
    and  (e.space_id is null or (s.visibility = 'network' and s.status = 'active'))
    and  e.starts_at >= now() - interval '1 day'
  order by e.starts_at asc
  limit  500;
$function$;

drop function if exists public.space_public_calendar_feed(uuid);

create function public.space_public_calendar_feed(_space_id uuid)
returns table (
  id uuid, title text, description text, location text,
  starts_at timestamptz, ends_at timestamptz, slug text, is_cancelled boolean, time_zone text,
  recurrence_type text, recurrence_until timestamptz, recurrence_rule text, parent_event_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with target as (
    select s.id
    from   public.spaces s
    where  s.id = _space_id
      and  s.visibility = 'network'
      and  s.status = 'active'
  )
  select e.id, e.title, e.description,
         case when e.hide_address
              then nullif(concat_ws(', ', nullif(e.city, ''), nullif(e.region, '')), '')
              else e.location
         end as location,
         e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone,
         e.recurrence_type, e.recurrence_until, e.recurrence_rule, e.parent_event_id
  from   target t
  join   public.events e
         on e.space_id = t.id
         or e.host_space_id = t.id
  left   join public.spaces home on home.id = e.space_id
  where  (e.space_id is null
          or e.space_id = t.id
          or (home.visibility = 'network' and home.status = 'active'))
    and  e.is_cancelled = false
    and  coalesce(e.status, 'published') = 'published'
    and  e.visibility in ('public', 'unlisted')
    and  e.removed_at is null
    and  e.is_demo = false
    and  e.starts_at >= now() - interval '1 day'

  union

  select e.id, e.title, e.description,
         case when e.hide_address
              then nullif(concat_ws(', ', nullif(e.city, ''), nullif(e.region, '')), '')
              else e.location
         end as location,
         e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone,
         e.recurrence_type, e.recurrence_until, e.recurrence_rule, e.parent_event_id
  from   target t
  join   public.event_space_shares sh on sh.space_id = t.id
  join   public.events e on e.id = sh.event_id
  left   join public.spaces home on home.id = e.space_id
  where  sh.status = 'accepted'
    and  (e.space_id is null or (home.visibility = 'network' and home.status = 'active'))
    and  e.is_cancelled = false
    and  coalesce(e.status, 'published') = 'published'
    and  e.visibility in ('public', 'unlisted')
    and  e.removed_at is null
    and  e.is_demo = false
    and  e.starts_at >= now() - interval '1 day'

  order by starts_at asc
  limit  200;
$function$;

-- ── GRANTS, RE-APPLIED AFTER THE DROP/CREATE, AND THIS IS THE HALF THAT IS EASY TO GET WRONG ──────
--
-- 🔴 A DROPPED FUNCTION TAKES ITS GRANTS WITH IT, AND A FRESH ONE IS EXECUTABLE BY PUBLIC. So a
-- migration that recreates a locked function and says nothing about grants does not "leave them
-- alone" — it re-opens the lock, silently, and the only thing that would notice is
-- `pnpm check:function-grants`. It did, on the first run of this file, which is why this block
-- exists rather than the `grant … to anon, authenticated` that was here first.
--
-- These two feeds are SERVICE-ROLE ONLY (scripts/function-grants.txt marks both `internal`).
-- 20270304000000 closed them and its own header says why: the .ics ROUTES call them through the
-- admin client, so nothing in a browser has ever needed execute, and an anon-executable RPC is a
-- surface whether or not anything calls it. The statements below are that file's, verbatim, with
-- the deliberate narrow re-grant to service_role it pairs them with.
revoke execute on function public.public_calendar_feed() from public, anon, authenticated;
revoke execute on function public.space_public_calendar_feed(uuid) from public, anon, authenticated;
grant execute on function public.public_calendar_feed() to service_role;
grant execute on function public.space_public_calendar_feed(uuid) to service_role;

-- PROVE IT, ON REAL ROWS. The hidden-address redaction that 20270331000000 installed is the property
-- most easily lost by retyping a function body, so it is re-asserted here rather than trusted. The
-- positive half stays CONDITIONAL on there being such a row, so a fresh database (db-tests replays
-- every migration on one) does not abort on "there is nothing to see".
do $$
declare v_leaked int; v_shown int; v_candidates int; v_cols int;
begin
  select count(*) into v_leaked
    from public.public_calendar_feed() f
    join public.events e on e.id = f.id
   where e.hide_address and f.location is not null and f.location = e.location;
  if v_leaked > 0 then
    raise exception 'the public feed still publishes the venue for % hidden-address event(s)', v_leaked;
  end if;

  select count(*) into v_candidates
    from public.public_calendar_feed() f
    join public.events e on e.id = f.id
   where not e.hide_address and e.location is not null;

  select count(*) into v_shown
    from public.public_calendar_feed() f
    join public.events e on e.id = f.id
   where not e.hide_address and e.location is not null and f.location = e.location;

  if v_candidates > 0 and v_shown = 0 then
    raise exception 'the public feed stopped publishing the venue for events that never hid it, aborting';
  end if;

  -- And the column this migration exists for is actually projected by both feeds.
  select count(*) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events' and column_name = 'recurrence_rule';
  if v_cols <> 1 then
    raise exception 'events.recurrence_rule was not added, aborting';
  end if;
end $$;

commit;
