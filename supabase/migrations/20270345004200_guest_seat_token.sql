-- The guest door, phase 2: a one-seat token in the receipt lets a guest change or release the
-- seat they hold (PROG-GD2).
--
-- THE GAP. Phase 1 (20270303000100) seats a signed-out guest and mails them a receipt. From that
-- moment the seat is a row nobody can move: the guest has no account, no "my events" page and no
-- action of any kind, so a guest who cannot come holds capacity until the event ends and the
-- waitlist behind them never moves. The receipt's only offer was "sign up with this address", which
-- is a different ask from "I can't make it". Plus-ones and the host's questions were out of a
-- guest's reach for the same reason: nothing a guest holds proves they hold the seat.
--
-- THE MECHANISM: a per-seat capability, hashed at rest, the way signup_leads.claim_token_hash
-- proves a lead (20270345000610) and the way every guest door in this family is built.
--
--   event_rsvps.seat_token_hash    SHA-256 hex of a random uuid. NULL matches nothing, so a row
--                                  with no token (every guest row before this file, every member
--                                  row, every released row) is reachable by nobody through the
--                                  doors below. The plaintext exists once, in the return value of
--                                  the mint call, and goes into an email addressed to the seat's
--                                  own address. A screenshot of the table proves a token without
--                                  being one.
--   mint_guest_seat_token          service_role ONLY. Rotates the hash on a GUEST row (guest_email
--                                  set, not yet claimed) and returns the plaintext. Called by the
--                                  receipt senders (lib/events/guest-rsvp-email.ts and the
--                                  promotion notice), so the newest email about a seat carries the
--                                  live link and an older link dies on its own.
--   read_guest_seat                anon. Resolves the token to the seat's state as jsonb, or null.
--                                  Declared STABLE, which Postgres enforces: a STABLE function
--                                  cannot run INSERT, UPDATE or DELETE. Mail scanners pre-click
--                                  links, so the page that renders on GET must be a read and
--                                  nothing else (the row's own required test), and the database is
--                                  where that promise is cheapest to keep.
--   update_guest_seat              anon. Plus-ones and answers to the host's questions.
--   release_guest_seat             anon. The seat becomes 'not_going' with plus_ones 0, exactly
--                                  the row a member's "Can't go" writes (setRsvpStatus,
--                                  app/(main)/events/actions.ts), and the token is cleared in the
--                                  same statement. Capacity is freed by the same rule a member's
--                                  release frees it (the trigger counts 'going' rows) and the
--                                  caller runs the same promoteFromWaitlist + notifyPromotedSeat
--                                  pair the member path runs. No copy of the waitlist here.
--
-- WHAT THE TOKEN UNLOCKS, AND WHAT IT DOES NOT (ADR-854). It addresses ONE event_rsvps row and
-- expires with the event: the resolver refuses a draft, removed, cancelled or finished event, a
-- member row, a claimed row and a row whose token was cleared. It never unlocks a hidden venue:
-- read_guest_seat carries no location, street, venue or host field at all, so there is nothing
-- for a page to leak. It never unlocks a session, a profile, or any other seat, and it does not
-- move a seat INTO 'going': a released guest who wants back in signs in with the same address
-- (claim_guest_rsvps converts the row) and takes a seat as a member. A resubmit through the RSVP
-- form does NOT resurrect a released seat, by the standing rule of capture_guest_rsvp.
--
-- HOST QUESTIONS FOR A GUEST. event_question_answers keyed every answer on a profile
-- (profile_id NOT NULL, 20260625030000), so a guest could not answer at all. The table now carries
-- rsvp_id beside profile_id, at least one of the two set, one answer per (question, rsvp) for a
-- guest seat; the browser policies keep comparing profile_id and so keep refusing guest rows to
-- every browser role, and the host reads them through the existing event branch. When the seat is
-- claimed, claim_guest_rsvps stamps profile_id onto those answers so the member sees what they
-- answered as a guest, and skips any question the member already answered themselves.
--
-- TICKETS ARE NOT COVERED, on purpose. A paid guest ticket (20270345003400) is a money record
-- whose release is a refund, which belongs to Stripe and the ticket door, not to a link in a
-- receipt. A free tier claimed as a guest is an event_rsvps row (20270345004000) and gets this
-- token like any other guest seat.
--
-- House style: additive + idempotent (add column if not exists, create or replace, drop policy
-- if exists); SECURITY DEFINER with a pinned search_path; revoke by role NAME then grant back
-- (ADR-959). pgcrypto is in the `extensions` schema (20260613120000) and is referenced qualified.
-- No em or en dashes. pgTAP: supabase/tests/guest_seat_token.test.sql.

begin;

-- ── 1. The columns ───────────────────────────────────────────────────────────────────────────────

alter table public.event_rsvps
  add column if not exists seat_token_hash text;

comment on column public.event_rsvps.seat_token_hash is
  'SHA-256 hex of the seat token mint_guest_seat_token handed the receipt email (20270345004200). read_guest_seat, update_guest_seat and release_guest_seat require the matching token. NULL (every member row, every guest row from before this file, every released or claimed seat) matches nothing.';

alter table public.event_question_answers
  alter column profile_id drop not null,
  add column if not exists rsvp_id uuid references public.event_rsvps(id) on delete cascade;

alter table public.event_question_answers drop constraint if exists event_question_answers_identity_check;
alter table public.event_question_answers
  add constraint event_question_answers_identity_check
  check (profile_id is not null or rsvp_id is not null);

create unique index if not exists event_question_answers_question_rsvp_uniq
  on public.event_question_answers (question_id, rsvp_id)
  where rsvp_id is not null;

create index if not exists event_question_answers_rsvp_idx
  on public.event_question_answers (rsvp_id)
  where rsvp_id is not null;

comment on column public.event_question_answers.rsvp_id is
  'The seat this answer belongs to when it was given by a signed-out guest through update_guest_seat (20270345004200). A member answer keys on profile_id and leaves this null; a claimed guest seat carries both.';

-- ── 2. The resolver: one token, one live guest seat ──────────────────────────────────────────────
-- Not exposed over PostgREST (the private schema is not in the API), and the three public doors
-- below share it so the liveness rule exists once.

create or replace function private.guest_seat_for_token(p_token uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_row   record;
  v_zone  text;
  v_tz    text;
  v_ends  timestamptz;
begin
  if p_token is null then
    return null;
  end if;

  select r.id, r.event_id, e.status, e.removed_at, e.is_cancelled, e.starts_at, e.ends_at, e.time_zone
    into v_row
    from public.event_rsvps r
    join public.events e on e.id = r.event_id
   where r.seat_token_hash is not null
     and r.seat_token_hash = encode(extensions.digest(p_token::text, 'sha256'), 'hex')
     and r.guest_email is not null
     and r.guest_claimed_by is null
   limit 1;

  if v_row.id is null then
    return null;
  end if;

  -- The seat is only addressable while the event is: published, not removed, not cancelled, and
  -- not over. "Over" resolves the stored wall clock through the event's zone exactly as
  -- capture_guest_rsvp does, and reads ends_at when there is one, as isEventPast does for a
  -- member (lib/time/zone.ts): somebody who said yes can say no right up until the gathering ends.
  if v_row.status is distinct from 'published'
     or v_row.removed_at is not null
     or v_row.is_cancelled
  then
    return null;
  end if;

  select t.name into v_zone from pg_timezone_names t where t.name = v_row.time_zone;
  v_tz := coalesce(v_zone, 'America/Los_Angeles');
  v_ends := (coalesce(v_row.ends_at, v_row.starts_at) at time zone 'UTC') at time zone v_tz;
  if v_ends <= now() then
    return null;
  end if;

  return v_row.id;
end;
$$;

comment on function private.guest_seat_for_token(uuid) is
  'The one liveness rule behind the guest seat doors (20270345004200): returns the event_rsvps id a seat token addresses, or null for a wrong token, a member or claimed row, a cleared token, or an event that is draft, removed, cancelled or over.';

-- ── 3. mint_guest_seat_token: service_role only ──────────────────────────────────────────────────

create or replace function public.mint_guest_seat_token(p_rsvp_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token uuid := gen_random_uuid();
  v_n     integer;
begin
  if p_rsvp_id is null then
    return null;
  end if;

  -- A GUEST seat only. A member row manages its seat signed in, and a claimed row is a member row.
  update public.event_rsvps r
     set seat_token_hash = encode(extensions.digest(v_token::text, 'sha256'), 'hex')
   where r.id = p_rsvp_id
     and r.guest_email is not null
     and r.guest_claimed_by is null;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    return null;
  end if;
  return v_token;
end;
$$;

comment on function public.mint_guest_seat_token(uuid) is
  'Mints (and rotates) the seat token for one guest seat and returns the plaintext once (20270345004200). Service role only: the caller is a receipt sender, and the token goes into an email addressed to the seat''s own address. Null for a member, claimed or unknown row.';

-- ── 4. read_guest_seat: the GET, a read and nothing else ─────────────────────────────────────────
-- STABLE is load-bearing. Postgres refuses INSERT, UPDATE and DELETE inside a non-volatile
-- function, so the door a mail scanner pre-clicks cannot act, whatever a later edit tries.

create or replace function public.read_guest_seat(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rsvp_id uuid := private.guest_seat_for_token(p_token);
  v_seat    record;
  v_qs      jsonb;
begin
  if v_rsvp_id is null then
    return null;
  end if;

  select r.id, r.event_id, r.status, r.approval_status, r.plus_ones, r.guest_name,
         e.slug, e.title, e.starts_at, e.ends_at, e.time_zone
    into v_seat
    from public.event_rsvps r
    join public.events e on e.id = r.event_id
   where r.id = v_rsvp_id;

  -- The host's questions, in display order, each with this seat's answer when it has one.
  -- No location, venue, street, host or attendee field is read here, on purpose: this is
  -- everything a page may show a bearer, and a hidden address (ADR-825) is not in it.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id,
           'prompt', q.prompt,
           'type', q.type,
           'options', q.options,
           'required', q.required,
           'position', q.position,
           'answer', coalesce(a.answer, '')
         ) order by q.position, q.created_at), '[]'::jsonb)
    into v_qs
    from public.event_questions q
    left join public.event_question_answers a
      on a.question_id = q.id and a.rsvp_id = v_seat.id
   where q.event_id = v_seat.event_id;

  return jsonb_build_object(
    'rsvp_id',         v_seat.id,
    'event_id',        v_seat.event_id,
    'slug',            v_seat.slug,
    'title',           v_seat.title,
    'starts_at',       v_seat.starts_at,
    'ends_at',         v_seat.ends_at,
    'time_zone',       v_seat.time_zone,
    'status',          v_seat.status,
    'approval_status', v_seat.approval_status,
    'plus_ones',       coalesce(v_seat.plus_ones, 0),
    'guest_name',      v_seat.guest_name,
    'questions',       v_qs
  );
end;
$$;

comment on function public.read_guest_seat(uuid) is
  'The seat a token addresses, as jsonb, or null (20270345004200). STABLE: it cannot write, so the page that renders it on GET has no side effect by construction. Carries the seat''s status, plus-ones, the host''s questions with this seat''s answers, and the event''s title and time. Never a location, venue or host.';

-- ── 5. update_guest_seat: plus-ones and answers ──────────────────────────────────────────────────

create or replace function public.update_guest_seat(
  p_token     uuid,
  p_plus_ones integer default null,
  p_answers   jsonb   default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rsvp_id uuid := private.guest_seat_for_token(p_token);
  v_seat    record;
  v_zone    text;
  v_tz      text;
  v_starts  timestamptz;
  v_n       integer;
  v_key     text;
  v_val     jsonb;
  v_qid     uuid;
begin
  if v_rsvp_id is null then
    return false;
  end if;

  select r.id, r.event_id, r.status, r.approval_status, r.plus_ones, e.starts_at, e.time_zone
    into v_seat
    from public.event_rsvps r
    join public.events e on e.id = r.event_id
   where r.id = v_rsvp_id;

  -- Plus-ones: the member rule (setRsvpPlusOnes). Only a confirmed 'going' seat brings anyone,
  -- clamped to [0, 5]; reducing is always allowed; adding a head obeys the start time. Plus-ones
  -- never consume capacity (the trigger counts rows), which is why no capacity check sits here.
  if p_plus_ones is not null
     and v_seat.status = 'going'
     and v_seat.approval_status is distinct from 'pending'
  then
    v_n := least(greatest(p_plus_ones, 0), 5);
    if v_n > coalesce(v_seat.plus_ones, 0) then
      select t.name into v_zone from pg_timezone_names t where t.name = v_seat.time_zone;
      v_tz := coalesce(v_zone, 'America/Los_Angeles');
      v_starts := (v_seat.starts_at at time zone 'UTC') at time zone v_tz;
      if v_starts <= now() then
        v_n := coalesce(v_seat.plus_ones, 0);
      end if;
    end if;
    update public.event_rsvps set plus_ones = v_n where id = v_rsvp_id;
  end if;

  -- Answers: an object of question id to answer text. A key that is not a uuid, or not one of
  -- THIS event's questions, is skipped; a value that is not a string is skipped. One answer per
  -- (question, seat), 2000 characters, the same cap the member path applies (saveGuestAnswer).
  if p_answers is not null and jsonb_typeof(p_answers) = 'object' then
    for v_key, v_val in select * from jsonb_each(p_answers) loop
      begin
        v_qid := v_key::uuid;
      exception when others then
        continue;
      end;
      if jsonb_typeof(v_val) <> 'string' then
        continue;
      end if;
      if not exists (
        select 1 from public.event_questions q
         where q.id = v_qid and q.event_id = v_seat.event_id
      ) then
        continue;
      end if;
      insert into public.event_question_answers (question_id, event_id, rsvp_id, answer)
      values (v_qid, v_seat.event_id, v_rsvp_id, left(v_val #>> '{}', 2000))
      on conflict (question_id, rsvp_id) where rsvp_id is not null
      do update set answer = excluded.answer, updated_at = now();
    end loop;
  end if;

  return true;
end;
$$;

comment on function public.update_guest_seat(uuid, integer, jsonb) is
  'Changes the seat a token addresses (20270345004200): plus-ones under the member rule (going and not pending, 0 to 5, additions before the start) and answers to the host''s questions keyed on the seat. True when the token resolved, false otherwise; a wrong token changes nothing.';

-- ── 6. release_guest_seat: the host''s real win ───────────────────────────────────────────────────

create or replace function public.release_guest_seat(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rsvp_id  uuid := private.guest_seat_for_token(p_token);
  v_event_id uuid;
begin
  if v_rsvp_id is null then
    return null;
  end if;

  -- The row a member's "Can't go" writes: status not_going, plus_ones 0 (setRsvpStatus). The
  -- token is cleared in the same statement, so the link in the receipt stops working the moment
  -- the seat is given back. The capacity trigger counts 'going' rows, so the seat is free from
  -- this statement on; the caller promotes the waitlist through the shared TypeScript pair.
  update public.event_rsvps
     set status = 'not_going',
         plus_ones = 0,
         seat_token_hash = null
   where id = v_rsvp_id
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function public.release_guest_seat(uuid) is
  'Gives back the seat a token addresses (20270345004200): status not_going, plus_ones 0, token cleared, in one statement. Returns the event id so the caller can run the shared waitlist promotion, or null when the token addressed nothing.';

-- ── 7. claim_guest_rsvps: the claim clears the token and keeps the answers ───────────────────────
-- Same body as 20270303000100 with two lines added in the convert branch: the seat token is
-- cleared (the seat is a member's now and is managed signed in), and the guest's answers are
-- stamped with the profile so the member sees them. A question the member already answered
-- under their own profile is left alone. The duplicate branch is unchanged: deleting the guest
-- row cascades its answers away with it.

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
      delete from public.event_rsvps where id = v_row.id;
    else
      update public.event_rsvps
         set profile_id       = p_profile_id,
             guest_email      = null,
             guest_claimed_by = p_profile_id,
             guest_claimed_at = now(),
             seat_token_hash  = null
       where id = v_row.id;

      update public.event_question_answers a
         set profile_id = p_profile_id,
             updated_at = now()
       where a.rsvp_id = v_row.id
         and a.profile_id is null
         and not exists (
           select 1 from public.event_question_answers m
            where m.question_id = a.question_id and m.profile_id = p_profile_id
         );
    end if;
  end loop;
end;
$$;

comment on function public.claim_guest_rsvps(uuid) is
  'Attaches a new member''s guest seats to their account. Requires auth.uid() to own the profile AND auth.users.email_confirmed_at to be set: a typed address is not identity (ADR-854). Clears the seat token and stamps the guest''s answers with the profile (20270345004200). Returns void so knowing a profile id reveals nothing.';

-- ── 8. Grants, role-explicit ─────────────────────────────────────────────────────────────────────
-- Supabase's default privileges hand EXECUTE on every new function to anon and authenticated as
-- per-role grants, which `from public` alone does not touch (ADR-959). Each door is cleared by
-- name and given back exactly the roles it is for. scripts/function-grants.txt: mint is
-- `internal`, the three token doors are `public` (a guest holds no session), the claim stays
-- `authenticated`.

revoke execute on function private.guest_seat_for_token(uuid) from public, anon, authenticated;

revoke execute on function public.mint_guest_seat_token(uuid) from public, anon, authenticated;
grant  execute on function public.mint_guest_seat_token(uuid) to service_role;

revoke execute on function public.read_guest_seat(uuid) from public, anon, authenticated;
grant  execute on function public.read_guest_seat(uuid) to anon, authenticated, service_role;

revoke execute on function public.update_guest_seat(uuid, integer, jsonb) from public, anon, authenticated;
grant  execute on function public.update_guest_seat(uuid, integer, jsonb) to anon, authenticated, service_role;

revoke execute on function public.release_guest_seat(uuid) from public, anon, authenticated;
grant  execute on function public.release_guest_seat(uuid) to anon, authenticated, service_role;

revoke execute on function public.claim_guest_rsvps(uuid) from public, anon;
grant  execute on function public.claim_guest_rsvps(uuid) to authenticated;

commit;

-- Rollback: drop function public.release_guest_seat(uuid), public.update_guest_seat(uuid, integer,
-- jsonb), public.read_guest_seat(uuid), public.mint_guest_seat_token(uuid) and
-- private.guest_seat_for_token(uuid); re-run the claim_guest_rsvps block and its grants from
-- 20270303000100; `alter table public.event_rsvps drop column seat_token_hash`; on
-- event_question_answers drop the identity check, the two rsvp_id indexes and the rsvp_id column
-- (guest answers go with it) and restore `alter column profile_id set not null`. The receipt
-- senders (lib/events/guest-rsvp-email.ts, lib/events/waitlist-notify.ts) and the seat page
-- (app/(main)/events/[slug]/seat/[token]) must go in the same deploy.
