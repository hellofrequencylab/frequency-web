-- The private calendar feed stops handing a hidden venue to someone the host has not admitted
-- (SCAN-512 rank 3, ADR-1152).
--
-- 🔴 THE DEFECT IS IN A PREMISE, NOT IN A LINE OF SQL. `20270331000000_calendar_feeds_redact_hidden_address`
-- redacted the exact address from three calendar feeds and deliberately EXEMPTED this one. Its
-- reasoning, verbatim:
--
--     "✅ event_calendar_feed(_token) IS DELIBERATELY LEFT ALONE, and this is the half worth reading.
--      That feed joins `event_rsvps r on r.status = 'going'` — every row in it is an event the
--      subscriber is ATTENDING, and the rule `guestVisibleLocation` implements hides the exact
--      address 'unless the viewer is going'."
--
-- That reasoning was correct when it was written and approval-gating falsifies it. On an event with
-- `rsvp_requires_approval`, a REQUEST is stored as `status = 'going'` with `approval_status = 'pending'`
-- — so `r.status = 'going'` now matches people the host has not admitted, and the sentence "every row
-- in it is an event the subscriber is ATTENDING" stops being true. The consequence is the exact leak
-- 20270331000000 set out to close, through the one door it held open on purpose: an unapproved
-- requester's calendar app pulls `e.location` raw, including a venue the host marked hidden.
--
-- ⚠️ THIS IS THE SAME CLASS AS ADR-1150 AND IT IS WORTH NAMING. A decision was justified by a
-- property of the data ("every row here is X"), the property later stopped holding, and nothing
-- re-checked it — because the justification lived in a comment and comments are not probes. The
-- exemption was not wrong; it EXPIRED. Every "this is safe because the data always looks like Y"
-- is a claim with a shelf life (ADR-1082).
--
-- ✅ WHAT IT BECOMES. The join requires the seat to be real, so the exemption's premise is restored
-- word for word rather than patched around: every row in this feed is again an event the subscriber
-- is attending. A pending request simply does not appear until the host approves it, which also
-- keeps the function's own stated contract true — "Never lists events the holder is not going to."
--
-- 🔴 WHY NOT REDACT INSTEAD OF EXCLUDE. Redacting would leave the entry in the subscriber's calendar,
-- which asserts they have a place at an event they have only asked to attend, and would put a
-- reminder on their phone for a room they may never be let into. Excluding says the honest thing by
-- saying nothing, and the entry appears the moment approval lands.
--
-- ⚠️ LATENT TODAY: 0 events carry `rsvp_requires_approval` and 0 rows sit at `approval_status =
-- 'pending'` in production, so nothing has leaked. This closes the door before anyone walks through it.
--
-- ROLLBACK: drop the `approval_status` predicate from the join.

begin;

create or replace function public.event_calendar_feed(_token text)
returns table (
  id           uuid,
  title        text,
  description  text,
  location     text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  slug         text,
  is_cancelled boolean,
  time_zone    text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.description, e.location, e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone
  from   public.event_calendar_follows f
  -- `status = 'going'` alone stopped meaning "attending" the day approval gating shipped: a request
  -- is stored as going + pending. Both halves are required for the seat to be real, and it is that
  -- pair — not the status alone — that entitles the holder to the venue.
  join   public.event_rsvps r on r.profile_id = f.profile_id
                             and r.status = 'going'
                             and r.approval_status is distinct from 'pending'
  join   public.events e       on e.id = r.event_id
  where  f.token = _token
    and  e.is_cancelled = false
    and  e.starts_at >= now() - interval '1 day'
  order by e.starts_at asc
  limit  200;
$$;

-- 🔴 NO GRANT HERE, AND THAT IS THE CORRECTION. The original definition (20261193000000) ended with
-- `grant execute on function public.event_calendar_feed(text) to anon, authenticated;`, and the first
-- version of THIS migration copied that line along with the body. It should not have:
-- 20270304000000_revoke_browser_execute_on_service_only_rpcs had since revoked it, and
-- scripts/function-grants.txt records the verdict as `internal`. Statements replay in order, so
-- copying the old grant re-opened browser execute on a function that returns a member's private
-- calendar including a hidden venue - re-introducing, in the very migration written to close a leak,
-- a wider version of that same leak.
--
-- `check:function-grants` caught it before it reached a PR, naming the file. The only caller,
-- app/events/calendar/[token]/route.ts, uses `admin.rpc(...)` on the service_role client, so no
-- browser role has ever needed EXECUTE here. 20270338000000 revokes what this file granted (ADR-1153).
--
-- ⚠️ THE LESSON IS ABOUT `create or replace`: carrying a function body forward means carrying its
-- GRANTS forward too, and the grants are the half most likely to have changed underneath you since
-- the body was written.

comment on function public.event_calendar_feed(text) is
  'Upcoming going-RSVP events behind one member''s calendar token (Events B-4; time_zone added EC1). Token is the credential; returns the venue because the holder RSVP''d AND was admitted. A request still awaiting the host is not listed (ADR-1152). Never lists events the holder is not going to.';

-- PROVE IT BEHAVIOURALLY. A grep for 'approval_status' in the function body would pass on a
-- definition that mentions the column and still leaks, so this drives the real feed with a real
-- token and asserts what comes back, both ways.
do $$
declare
  v_ev    uuid := gen_random_uuid();
  v_prof  uuid;
  v_tok   text := 'probe-' || replace(gen_random_uuid()::text, '-', '');
  v_rsvp  uuid;
  v_rows  int;
begin
  select id into v_prof from public.profiles limit 1;
  if v_prof is null then
    raise notice 'no profile to probe with; skipping the behavioural half';
    return;
  end if;

  insert into public.events (id, title, slug, scope_id, scope_type, starts_at, location, hide_address)
  values (v_ev, 'feed probe', 'feed-probe-' || replace(v_ev::text, '-', ''),
          gen_random_uuid(), 'public', now() + interval '30 days', '123 Secret St', true);

  insert into public.event_calendar_follows (profile_id, token)
  values (v_prof, v_tok);

  -- PENDING: the request must NOT surface the event at all.
  insert into public.event_rsvps (event_id, profile_id, status, approval_status)
  values (v_ev, v_prof, 'going', 'pending') returning id into v_rsvp;

  select count(*) into v_rows from public.event_calendar_feed(v_tok) where id = v_ev;
  if v_rows <> 0 then
    raise exception 'a PENDING request surfaced the event (and its hidden venue) in the private calendar feed';
  end if;

  -- APPROVED: the seat is real, so the entry and its venue are the holder's to have.
  update public.event_rsvps set approval_status = 'approved' where id = v_rsvp;
  select count(*) into v_rows from public.event_calendar_feed(v_tok) where id = v_ev;
  if v_rows <> 1 then
    raise exception 'an APPROVED attendee lost their own calendar entry - this took too much';
  end if;

  delete from public.event_rsvps where event_id = v_ev;
  delete from public.event_calendar_follows where token = v_tok;
  delete from public.events where id = v_ev;
end $$;

commit;
