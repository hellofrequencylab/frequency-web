-- capture_guest_rsvp takes a FREE tier on a tickets-mode event (LIVE-318).
--
-- THE GAP. A signed-out visitor can buy a priced ticket as a guest (20270345003400) and can hold a
-- seat on an RSVP-mode event as a guest (20270303000100), but the one rate they could not take was
-- the free tier of a ticketed event, which is usually the entry-level one. createTicketCheckout
-- answered `{ free, requiresAccount }` for a guest and the action turned that into "Sign in to
-- claim it", because there was nowhere to record the claim: this function refused every event
-- whose join_mode is 'tickets', and a ticket row cannot carry it either. LIVE-318 measured that
-- second half before this file was written: event_tickets.amount_cents carries CHECK (> 0) since
-- 20260609020000, live on production, and reserve_ticket_atomic inserts the amount verbatim, so a
-- "zero-amount ticket row" raises inside the RPC. A placeholder amount would be a fabricated money
-- record, and a service-role insert would hand-roll the capacity trigger, approval and receipt the
-- RPCs own.
--
-- THE MECHANISM: the member free path's twin. A MEMBER who takes a free tier gets no ticket row at
-- all. app/(main)/events/[slug]/ticket-actions.ts `startTicket` records the claim as an ordinary
-- 'going' RSVP through setRsvpStatus, so it rides event capacity, the host's approval setting and
-- the RSVP confirmation, and deliberately does not bump the tier's `sold`. A guest free claim is
-- therefore an event_rsvps row under the typed address, which is exactly what this function
-- already writes for a free RSVP. The ONLY change is the refusal list: a tickets-mode event is
-- still refused unless the caller names one of ITS tiers that is
--
--   · active,
--   · pricing_mode = 'free',
--   · not member_only, not space_members_only, and naming no space_tier_id (a guest holds neither
--     membership; createTicketCheckout refuses these before it ever reaches the free branch, and
--     the SQL refuses them again because anon reaches this function directly over PostgREST), and
--   · not sold out (quantity null, or sold < quantity: the same inventory gate the app runs; `sold`
--     counts succeeded purchases only, so free claims never exhaust a tier, same as for a member).
--
-- Everything else is byte for byte the 20270345000600 body: the address shape, the draft / removed /
-- cancelled / past / private / window checks, the capacity trigger (enforce_event_rsvp_capacity
-- demotes to 'waitlist' when the room is full), the approval setting, the opaque receipt on every
-- refusal, and the resubmit rule that fills a missing name and never replaces one.
--
-- p_ticket_type_id is consulted ONLY on a tickets-mode event. On an RSVP-mode event it is ignored,
-- because a free RSVP is a free RSVP and setRsvpStatus (the member twin) reads no tier either.
--
-- ADR-854 holds unchanged: the row carries an UNPROVEN address, and it addresses a receipt email
-- and a later sign-in claim (claim_guest_rsvps proves the address through auth.users). It unlocks
-- nothing a free RSVP does not unlock, and it never becomes a ticket.
--
-- WHY DROP + CREATE rather than a bare `create or replace`. Postgres keys a function on its argument
-- types, so replacing the (uuid, text, text) body with a (uuid, text, text, uuid) signature would
-- leave BOTH functions live, and a named-argument call over PostgREST that omits the fourth
-- parameter would then be ambiguous between them. The three-argument form is dropped first, and the
-- four-argument form defaults the new parameter to null so every existing caller
-- (app/(main)/events/guest-rsvp-actions.ts passes p_event_id, p_email, p_name) resolves unchanged.
--
-- ACL. A drop resets the ACL to Postgres' default plus Supabase's per-role default grants
-- (scripts/check-function-grants.mjs models exactly this), so the verdict is restated below,
-- role-explicit: revoked from public, anon and authenticated by name, then granted back to the two
-- browser roles the form runs as. scripts/function-grants.txt keeps `public` for this function.
--
-- House style: idempotent (drop if exists + create or replace); SECURITY DEFINER with a pinned
-- search_path. No em or en dashes. pgTAP: supabase/tests/guest_free_tier_claim.test.sql.

begin;

drop function if exists public.capture_guest_rsvp(uuid, text, text);

create or replace function public.capture_guest_rsvp(
  p_event_id       uuid,
  p_email          text,
  p_name           text default null,
  p_ticket_type_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email     text := lower(btrim(coalesce(p_email, '')));
  v_name      text := left(nullif(btrim(coalesce(p_name, '')), ''), 120);
  v_receipt   uuid := gen_random_uuid();
  v_event     record;
  v_zone      text;
  v_tz        text;
  v_starts    timestamptz;
  v_win       jsonb;
  v_opens     timestamptz;
  v_closes    timestamptz;
  v_free_tier boolean := false;
begin
  -- The ONLY branch that returns anything other than an opaque receipt. Same shape the app layer
  -- validates with, re-checked here because anon reaches this function directly over PostgREST.
  if v_email = '' or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return null;
  end if;

  select e.id, e.capacity, e.is_cancelled, e.starts_at, e.visibility, e.join_mode,
         e.rsvp_requires_approval, e.time_zone, e.details, e.status, e.removed_at
    into v_event
    from public.events e
   where e.id = p_event_id;

  -- Resolve the event's wall clock to a true instant, falling back to the community zone when the
  -- stored name is not one Postgres knows (`at time zone` would otherwise raise on the anon door).
  if v_event.id is not null then
    select t.name into v_zone
      from pg_timezone_names t
     where t.name = v_event.time_zone;
    v_tz := coalesce(v_zone, 'America/Los_Angeles');
    v_starts := (v_event.starts_at at time zone 'UTC') at time zone v_tz;

    -- The booking window, read defensively: a non-object bag, a non-text side, or a value that is
    -- not a timestamp all leave the corresponding bound NULL, which means "unbounded".
    v_win := case
               when jsonb_typeof(coalesce(v_event.details, '{}'::jsonb) -> 'rsvpWindow') = 'object'
                 then v_event.details -> 'rsvpWindow'
               else '{}'::jsonb
             end;
    begin
      v_opens := case
                   when jsonb_typeof(v_win -> 'opensAt') = 'string' and (v_win ->> 'opensAt') <> ''
                     then ((v_win ->> 'opensAt')::timestamp) at time zone v_tz
                 end;
    exception when others then
      v_opens := null;
    end;
    begin
      v_closes := case
                    when jsonb_typeof(v_win -> 'closesAt') = 'string' and (v_win ->> 'closesAt') <> ''
                      then ((v_win ->> 'closesAt')::timestamp) at time zone v_tz
                  end;
    exception when others then
      v_closes := null;
    end;
    -- Backwards window = no window (see 20270343000000).
    if v_opens is not null and v_closes is not null and v_closes <= v_opens then
      v_opens := null;
      v_closes := null;
    end if;

    -- LIVE-318: the free tier, read ONLY on a tickets-mode event and ONLY when one is named. The
    -- tier must belong to THIS event (a tier id from another event is not an offer here). A tier
    -- that is gated to paying members or to the hosting Space's members is refused for a guest
    -- outright, with no membership read: a guest holds neither, by definition. `sold` counts
    -- succeeded purchases only, so this gate is the app's inventory gate and nothing more.
    if v_event.join_mode = 'tickets' and p_ticket_type_id is not null then
      select (t.active
              and t.pricing_mode = 'free'
              and not t.member_only
              and not t.space_members_only
              and t.space_tier_id is null
              and (t.quantity is null or t.sold < t.quantity))
        into v_free_tier
        from public.event_ticket_types t
       where t.id = p_ticket_type_id
         and t.event_id = v_event.id;
      v_free_tier := coalesce(v_free_tier, false);
    end if;
  end if;

  -- Every rejection below returns the receipt, NOT an error and NOT null: a caller must not be able
  -- to distinguish a real open event from a cancelled one, a past one, a private one, a ticketed
  -- one whose named tier is not a free tier, a draft, a removed one, one whose booking window has
  -- not opened or has closed, or an id that was never an event.
  --
  -- 2026-09-05 (scan2 L7-5): `status` and `removed_at` join the list. A draft is readable only by
  -- its poster, host and guide+ (20260613130000), and a removed event is on no page at all; neither
  -- may take a seat from a signed-out caller who happens to hold its uuid.
  --
  -- 2026-09-14 (LIVE-318): a tickets-mode event is refused UNLESS the caller named one of its free
  -- tiers (v_free_tier above). A sold-out, inactive, gated or foreign tier leaves it false, and the
  -- refusal is the same receipt as every other, so the tier list is not an oracle either.
  if v_event.id is null
     or v_event.is_cancelled
     or v_event.status is distinct from 'published'
     or v_event.removed_at is not null
     or v_starts <= now()
     or v_event.visibility not in ('public', 'unlisted')
     or (v_event.join_mode = 'tickets' and not v_free_tier)
     or (v_opens is not null and now() < v_opens)
     or (v_closes is not null and now() >= v_closes)
  then
    return v_receipt;
  end if;

  -- status starts at 'going' and enforce_event_rsvp_capacity() (20260610030000) demotes it to
  -- 'waitlist' when the room is full. That trigger reads only NEW.event_id and NEW.status, so the
  -- guest obeys the member rule because it is the SAME rule, not a copy of it.
  --
  -- approval_status keys on the host's setting, so a guest waits exactly as long as a member does.
  --
  -- A free-tier claim on a tickets-mode event lands here as the SAME row a free RSVP lands as. No
  -- event_tickets row is written and the tier's `sold` is untouched, which is what the member free
  -- path (setRsvpStatus) does too. The tier id is not stored: the seat is the claim.
  insert into public.event_rsvps as r (event_id, guest_email, guest_name, status, approval_status)
  values (
    p_event_id,
    v_email,
    v_name,
    'going',
    case when v_event.rsvp_requires_approval then 'pending' else 'none' end
  )
  on conflict (event_id, lower(guest_email)) where guest_email is not null do update
    -- A resubmit may fill in a name it did not have. It may NOT move the seat: re-submitting must
    -- never promote off the waitlist, never clear a pending approval, and never resurrect a seat the
    -- host removed. Anything that changed the row here would make the endpoint a lever, not a form.
    --
    -- 2026-09-05 (scan2 L7-5): the stored name WINS. The previous order, coalesce(excluded, r),
    -- let anyone who knew an attendee's address rename them on the roster. A NULL is still filled
    -- in; a name that is already there is kept, and the row is otherwise returned unchanged.
    set guest_name = coalesce(r.guest_name, excluded.guest_name);

  return v_receipt;
end;
$$;

comment on function public.capture_guest_rsvp(uuid, text, text, uuid) is
  'Anon door for a signed-out guest RSVP. Returns an opaque random uuid on every path except a malformed address (null), so it cannot answer "is this person going to this event". Refuses a draft, removed, cancelled, past, non-public or window-closed event with the same receipt, and refuses a ticketed event unless p_ticket_type_id names one of its active, ungated, unsold-out FREE tiers (LIVE-318: the member free path''s twin; the claim is a going RSVP row, never a ticket row). A resubmit fills in a missing guest_name and never replaces one. Writes into event_rsvps so the capacity trigger and the host approval setting apply unchanged.';

-- The anon front door: revoked by name (a `from public` alone leaves Supabase's per-role default
-- grants standing, ADR-959), then handed back to exactly the two browser roles the form runs as.
-- Restated here because the drop above reset the ACL.
revoke execute on function public.capture_guest_rsvp(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.capture_guest_rsvp(uuid, text, text, uuid) to anon, authenticated;

commit;

-- Rollback: `drop function if exists public.capture_guest_rsvp(uuid, text, text, uuid);` then re-run
-- the `create or replace function public.capture_guest_rsvp(...)` block AND the revoke/grant pair of
-- 20270345000600_guest_rsvp_rpc_checks_status_and_owner.sql (the three-argument form comes back, a
-- ticketed event refuses every guest again, and the app's free-tier branch must be restored with
-- it). Existing event_rsvps rows are unaffected either way: a free-tier claim is an ordinary guest
-- RSVP row and carries no tier id.
