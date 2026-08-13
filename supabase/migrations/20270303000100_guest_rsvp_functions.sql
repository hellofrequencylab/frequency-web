-- GUEST RSVP, PART 2: the two doors.
--
-- Shape taken from capture_signup_lead / mark_signup_lead_converted (20270215000000), which solved
-- this exact problem: an anon-callable write that must not become an oracle, plus an authenticated
-- claim that must prove ownership before attaching pre-account state to a member.
--
-- ── WHY THE CAPTURE DOOR RETURNS A RANDOM UUID AND NOT THE ROW ID ────────────────────────────────
-- capture_signup_lead returns the row id, and for a LEAD that is defensible: the id is one known
-- email away regardless, and the file says so honestly. A SEAT is different, because the question an
-- attacker asks is not "does this address exist somewhere" but "is THIS PERSON going to THIS EVENT",
-- and the event is public and named.
--
-- Returning the row id would answer it. Submit a guessed address twice: a real, already-present RSVP
-- returns the SAME id both times (on conflict … returning id), while an address with no seat returns
-- a NEW id the first time. Two calls and you know whether a named person is attending a named event.
--
-- So this returns `gen_random_uuid()` on EVERY path that is not a malformed address: fresh each call,
-- carrying nothing, identical for a real seat, a duplicate submit, a cancelled event, a past event, a
-- ticketed event and an event id that does not exist. The caller learns exactly one bit, "your input
-- parsed", which it already knew. THIS FUNCTION IS GRANTED TO anon, so its return value is reachable
-- over PostgREST directly and not only through the server action; the action's discretion is not a
-- security boundary and nothing here may rely on it.
--
-- The cost is that the caller cannot learn whether the seat landed as `going` or `waitlist`. The
-- server action composes its confirmation email from an admin-client read instead (server-side, into
-- the email body, never into the HTTP response), which keeps the browser's answer identical too.
--
-- ── THE ONE LEAK THAT REMAINS, NAMED ─────────────────────────────────────────────────────────────
-- `spotsLeft` renders publicly on the event page, so an attacker who submits and then reloads can see
-- the counter move and learn that A submission landed. That is one bit about the EVENT, not about any
-- person, it is equally true of member RSVPs today, and closing it would mean hiding capacity from the
-- page. Accepted deliberately rather than overlooked.

begin;

-- ── capture_guest_rsvp: the anon door ────────────────────────────────────────────────────────────

create or replace function public.capture_guest_rsvp(
  p_event_id uuid,
  p_email    text,
  p_name     text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_name     text := left(nullif(btrim(coalesce(p_name, '')), ''), 120);
  v_receipt  uuid := gen_random_uuid();
  v_event    record;
begin
  -- The ONLY branch that returns anything other than an opaque receipt. Same shape the app layer
  -- validates with, re-checked here because anon reaches this function directly over PostgREST.
  if v_email = '' or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return null;
  end if;

  select e.id, e.capacity, e.is_cancelled, e.starts_at, e.visibility, e.join_mode,
         e.rsvp_requires_approval
    into v_event
    from public.events e
   where e.id = p_event_id;

  -- Every rejection below returns the receipt, NOT an error and NOT null: a caller must not be able
  -- to distinguish a real open event from a cancelled one, a past one, a private one, a ticketed one
  -- or an id that was never an event.
  if v_event.id is null
     or v_event.is_cancelled
     or v_event.starts_at <= now()
     or v_event.visibility not in ('public', 'unlisted')
     or v_event.join_mode = 'tickets'
  then
    return v_receipt;
  end if;

  -- status starts at 'going' and enforce_event_rsvp_capacity() (20260610030000) demotes it to
  -- 'waitlist' when the room is full. That trigger reads only NEW.event_id and NEW.status, so the
  -- guest obeys the member rule because it is the SAME rule, not a copy of it.
  --
  -- approval_status keys on the host's setting, so a guest waits exactly as long as a member does.
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
    set guest_name = coalesce(excluded.guest_name, r.guest_name);

  return v_receipt;
end;
$$;

comment on function public.capture_guest_rsvp(uuid, text, text) is
  'Anon door for a signed-out guest RSVP. Returns an opaque random uuid on every path except a malformed address (null), so it cannot answer "is this person going to this event". Writes into event_rsvps so the capacity trigger and the host approval setting apply unchanged.';

-- ── claim_guest_rsvps: the authenticated door ────────────────────────────────────────────────────
--
-- 🔴 THE EMAIL MUST BE PROVEN, NOT TYPED. An auth.users row is created when someone TYPES an address
-- at /sign-in, before any link is clicked, and handle_new_auth_user() mints a profile from it within
-- milliseconds. So "a profile exists with this email" proves nothing at all: anyone can cause one for
-- any address. Claiming on that basis would hand a stranger somebody else's seat.
--
-- `email_confirmed_at is not null` is what separates a proven address from a claimed one, and it is
-- the same check lib/rewards/creation.ts already makes before paying a creation reward. This is
-- ADR-854's rule applied to seats: an unverified email may address a DELIVERY, but it may never key
-- a thing that is then handed over.
--
-- The address is READ from auth.users server-side. It is never a parameter, so a caller cannot say
-- "claim these seats as this address".

create or replace function public.claim_guest_rsvps(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_row   record;
begin
  if p_profile_id is null then
    return;
  end if;

  -- Ownership AND proof, in one read. auth.uid() cannot be forged by the caller; it is the whole
  -- mechanism. limit 1 because profiles.auth_user_id carries only an index, not a unique constraint.
  select lower(btrim(u.email))
    into v_email
    from public.profiles p
    join auth.users u on u.id = p.auth_user_id
   where p.id = p_profile_id
     and p.auth_user_id = auth.uid()
     and u.email_confirmed_at is not null
   limit 1;

  if v_email is null or v_email = '' then
    return;
  end if;

  for v_row in
    select r.id, r.event_id
      from public.event_rsvps r
     where r.guest_email is not null
       and r.guest_claimed_by is null
       and lower(btrim(r.guest_email)) = v_email
  loop
    if exists (
      select 1 from public.event_rsvps m
       where m.event_id = v_row.event_id and m.profile_id = p_profile_id
    ) then
      -- They already hold a member seat for this event: the guest row is a duplicate that is also
      -- consuming a second unit of capacity. Deleting it is what gives the seat back to the room.
      delete from public.event_rsvps where id = v_row.id;
    else
      -- Convert in place. guest_email must be cleared in the SAME statement or
      -- event_rsvps_identity_check rejects the row for carrying both identities. The status is left
      -- untouched, which matters: enforce_event_rsvp_capacity only re-checks on a transition INTO
      -- 'going' (`OLD.status is distinct from 'going'`), so a seat that is already going is not
      -- re-tested against a room it is itself filling, and a waitlisted guest keeps their place in
      -- line rather than jumping it.
      update public.event_rsvps
         set profile_id       = p_profile_id,
             guest_email      = null,
             guest_claimed_by = p_profile_id,
             guest_claimed_at = now()
       where id = v_row.id;
    end if;
  end loop;
end;
$$;

comment on function public.claim_guest_rsvps(uuid) is
  'Attaches a new member''s guest seats to their account. Requires auth.uid() to own the profile AND auth.users.email_confirmed_at to be set: a typed address is not identity (ADR-854), and an auth.users row exists from the moment someone types one at /sign-in. Returns void so knowing a profile id reveals nothing.';

-- ── Grants ───────────────────────────────────────────────────────────────────────────────────────
-- Default EXECUTE on a new function goes to PUBLIC, which over PostgREST means anon. Revoke first,
-- then hand back exactly the roles each door is designed for.

-- Revoked BY NAME, not just from public. `revoke ... from public` does not touch the explicit
-- per-role grants Supabase's ALTER DEFAULT PRIVILEGES creates on every new function, so on its own
-- the statement succeeds and removes nothing (ADR-959). Both functions are cleared to zero here and
-- re-granted deliberately below, so the final ACL is something this file decided rather than
-- something it inherited. supabase/migrations/fail-open-guards.test.ts holds a census of the
-- functions that got this wrong and refuses to let it grow; capture_guest_rsvp was in it until this
-- line existed.
revoke execute on function public.capture_guest_rsvp(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.claim_guest_rsvps(uuid) from public;

-- 🔴 `revoke ... from public` IS NOT ENOUGH, and this file shipped a first draft that believed it was.
-- Supabase installs ALTER DEFAULT PRIVILEGES granting EXECUTE on every new function to `anon` and
-- `authenticated` INDIVIDUALLY. Those are per-role grants, and revoking from PUBLIC does not remove a
-- per-role grant. Verified on the live database after applying: `claim_guest_rsvps` still had EXECUTE
-- for anon despite the revoke above. The same trap is why signup_leads needed a whole follow-up
-- migration, 20270215000001_signup_leads_close_default_grants.sql (ADR-959/964).
--
-- It was not exploitable — the function's first act is to match `auth.uid()`, which is null for anon,
-- so it returns without touching a row — but "unreachable by accident" is not the posture. The claim
-- door is authenticated-only by design and the grant table must say so.
revoke execute on function public.claim_guest_rsvps(uuid) from anon;

-- The guest form runs signed out, so anon must reach the capture door.
grant execute on function public.capture_guest_rsvp(uuid, text, text) to anon, authenticated;
-- The claim reads auth.uid() to prove ownership, so it is meaningless to anon and must not be offered.
grant execute on function public.claim_guest_rsvps(uuid) to authenticated;

commit;
