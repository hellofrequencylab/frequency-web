-- SIGNUP LEADS — the lead-capture spine under the induction funnel (ADR-959).
--
-- THE GAP THIS CLOSES. The beta induction collects a whole profile from a signed-out visitor and
-- parks it in `fq_pending_induction`, a ONE-HOUR httpOnly cookie (app/onboarding/beta/actions.ts,
-- stashPendingInduction). Nothing else is written. A visitor who answers four beats and then walks
-- away leaves NO server-side trace at all: an hour later the cookie expires and the whole session
-- is gone. There is no address to follow up on and no way to count where the funnel leaks.
--
-- This table is the trace. The email is taken at beat 2, the row is updated as later beats answer,
-- and it is stamped converted when the profile is finally written.
--
-- TRANSACTIONAL, NOT MARKETING. The follow-up this enables is "finish setting up your account" —
-- the same category as a password reset. There is deliberately NO consent column, no opt-in flag,
-- and no subscribed state here, because none is claimed and none may be inferred later. Marketing
-- consent lives where it already lives: `contacts.consent_state`, set by the double-opt-in flow in
-- app/(marketing)/subscribe. A row here is a half-finished signup, nothing more.
--
-- WRITE PATH: FUNCTIONS ONLY. RLS is on with ZERO policies (the fail-closed posture of the 77 other
-- service-role-only tables; recorded in scripts/rls-deny-all.txt). anon and authenticated get no
-- select, no insert, no update. Every write goes through the three SECURITY DEFINER functions at the
-- bottom of this file, because a table anon can insert into directly is an open spam target: it can
-- be filled with arbitrary columns at arbitrary width, and its unique index turns into an address
-- oracle. A function normalises its input, bounds every field, and — the point — returns nothing but
-- an id, identically for a brand-new address and one that is already here.

create table if not exists public.signup_leads (
  id                    uuid primary key default gen_random_uuid(),
  -- Stored lowercased + trimmed by capture_signup_lead. This repo has no citext extension
  -- (verified: zero references across every migration), so case-insensitivity is carried by the
  -- normaliser plus the lower(email) unique index below rather than by the column type.
  email                 text not null,
  first_name            text,
  last_name             text,
  display_name          text,
  handle                text,
  -- Which funnel the visitor was in. Checked, not free text: an unrecognised value here would
  -- silently split the recovery job's cohorts.
  source                text not null check (source in ('beta_induction', 'feature_funnel')),
  -- How far they got, 1-based on the funnel's own step numbering. 0 = captured before any step
  -- was credited. Monotonic: an update never walks it backwards (see update_signup_lead).
  step_reached          smallint not null default 0,
  -- Whatever the funnel has answered so far (interests, persona, intent, location). Deliberately
  -- schemaless: the induction's beats change every few weeks and a column per answer would mean a
  -- migration per beat.
  payload               jsonb not null default '{}',
  -- First-touch acquisition, as lib/attribution/server.ts resolves it from the fq_first_touch /
  -- fq_channel / fq_ref cookies proxy.ts sets. FIRST touch wins on a repeat capture (the model in
  -- ADR-095): the channel that first brought them is the one worth crediting.
  attribution           jsonb not null default '{}',
  converted_profile_id  uuid references public.profiles(id) on delete set null,
  converted_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- One row per person, not one per beat. A returning visitor re-running the funnel UPDATES their row;
-- without this the recovery job would mail the same address once per abandoned attempt.
create unique index if not exists signup_leads_email_key on public.signup_leads (lower(email));

-- The recovery job's read: "unconverted leads that went cold N hours ago". converted_at leads so the
-- null (still-unconverted) group is contiguous, then updated_at orders the window inside it.
create index if not exists signup_leads_recovery_idx on public.signup_leads (converted_at, updated_at);

-- FK index (public.profiles): an unindexed FK makes a profile delete scan this table.
create index if not exists signup_leads_converted_profile_idx on public.signup_leads (converted_profile_id);

comment on table public.signup_leads is
  'ADR-959: half-finished signups from the onboarding funnels, so an abandoned induction can be followed up with a TRANSACTIONAL "finish setting up your account" note. NOT a marketing list and carries no consent state - marketing consent lives on contacts.consent_state. RLS-on-no-policy: fail-closed, service-role only. Every write goes through capture_signup_lead / update_signup_lead / mark_signup_lead_converted.';

drop trigger if exists signup_leads_set_updated_at on public.signup_leads;
create trigger signup_leads_set_updated_at
  before update on public.signup_leads
  for each row execute function public.set_updated_at();

alter table public.signup_leads enable row level security;

-- ── capture_signup_lead: the ONE door anon may knock on ──────────────────────────────────────────
--
-- Upsert by lower(email), return the row id and NOTHING else.
--
-- The return type is the security property, not a convenience. If this returned the row — or errored
-- differently for a known address, or returned a "created vs updated" flag — the endpoint in front of
-- it would be an address oracle: anyone could POST a list of emails and read back which ones already
-- belong to a Frequency member. It returns one opaque uuid on every success, for every address, and
-- null only when the email itself does not parse.
create or replace function public.capture_signup_lead(
  p_email        text,
  p_source       text default 'beta_induction',
  p_step         integer default 0,
  p_first_name   text default null,
  p_last_name    text default null,
  p_display_name text default null,
  p_handle       text default null,
  p_payload      jsonb default '{}',
  p_attribution  jsonb default '{}'
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_source text := case when p_source in ('beta_induction', 'feature_funnel') then p_source else 'beta_induction' end;
  v_step   smallint := least(greatest(coalesce(p_step, 0), 0), 32767)::smallint;
  v_id     uuid;
begin
  -- Same shape the app layer validates with (app/onboarding/beta/lead-actions.ts). Checked again
  -- here because this function is reachable by anon over PostgREST, not only through that action.
  if v_email = '' or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return null;
  end if;

  insert into public.signup_leads as l (
    email, source, step_reached, first_name, last_name, display_name, handle, payload, attribution
  )
  values (
    v_email,
    v_source,
    v_step,
    left(nullif(btrim(coalesce(p_first_name, '')), ''), 120),
    left(nullif(btrim(coalesce(p_last_name, '')), ''), 120),
    left(nullif(btrim(coalesce(p_display_name, '')), ''), 120),
    left(nullif(btrim(coalesce(p_handle, '')), ''), 40),
    -- 8KB is roughly ten times what the widest funnel answers weigh. A payload past it is not a
    -- funnel answer, it is someone using an anon-callable function as free storage.
    case when pg_column_size(coalesce(p_payload, '{}'::jsonb)) > 8192 then '{}'::jsonb else coalesce(p_payload, '{}'::jsonb) end,
    case when pg_column_size(coalesce(p_attribution, '{}'::jsonb)) > 8192 then '{}'::jsonb else coalesce(p_attribution, '{}'::jsonb) end
  )
  on conflict ((lower(email))) do update set
    -- Furthest progress wins: a visitor who reaches beat 4, then comes back and re-runs beat 2, has
    -- still reached beat 4.
    step_reached = greatest(l.step_reached, excluded.step_reached),
    -- A newly-given answer wins; a blank never erases what they already told us.
    first_name   = coalesce(excluded.first_name, l.first_name),
    last_name    = coalesce(excluded.last_name, l.last_name),
    display_name = coalesce(excluded.display_name, l.display_name),
    handle       = coalesce(excluded.handle, l.handle),
    payload      = l.payload || excluded.payload,
    -- First touch is immutable (ADR-095). Only an empty attribution record is filled in.
    attribution  = case when l.attribution = '{}'::jsonb then excluded.attribution else l.attribution end,
    -- `source` is NOT updated: it records where this person first entered, which is the question
    -- the funnel report asks. Their latest funnel is already in payload.
    updated_at   = now()
  returning l.id into v_id;

  return v_id;
end;
$$;

-- ── update_signup_lead: later beats, keyed on the id the capture handed back ─────────────────────
--
-- THE ID IS NOT A CAPABILITY, and an earlier version of this comment said it was. It claimed the id
-- was "neither guessable nor readable from script — the same posture the invite tokens carry
-- (20270210000000)". Half of that is true: it is a v4 uuid, so it cannot be guessed, and the app only
-- ever holds it in an httpOnly `fq_lead` cookie, so no script reads it back. But capture_signup_lead
-- above is anon-callable and ends `on conflict ((lower(email))) do update ... returning l.id`, so
-- anyone who supplies an address already in the table is HANDED that row's id. An id is one known
-- email away. Nothing here may rest on holding it, and an invite token — which is unguessable AND has
-- no second door that dispenses it — is not the posture this carries.
--
-- WHAT ACTUALLY BOUNDS THIS, and why it is still fine. This function reaches exactly the field set the
-- capture door already reaches: first/last/display name, handle, a bounded payload merge, and a
-- monotonic step. A caller who knows the email can do all of it through capture_signup_lead without
-- ever seeing an id. So the leaked id grants nothing the open door does not, and it stays void-
-- returning for the separate reason below.
--
-- If anon tampering with half-finished signups is worth closing, the change belongs in
-- capture_signup_lead's do-update branch (fill NULL columns only, never overwrite). Suppressing the
-- returned id would close nothing and break the funnel, which needs it for the later beats.
--
-- Returns void: knowing an id must not reveal whose row it is.
create or replace function public.update_signup_lead(
  p_lead_id      uuid,
  p_step         integer default null,
  p_first_name   text default null,
  p_last_name    text default null,
  p_display_name text default null,
  p_handle       text default null,
  p_payload      jsonb default '{}'
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_lead_id is null then
    return;
  end if;

  update public.signup_leads as l set
    step_reached = greatest(l.step_reached, least(greatest(coalesce(p_step, 0), 0), 32767)::smallint),
    first_name   = coalesce(left(nullif(btrim(coalesce(p_first_name, '')), ''), 120), l.first_name),
    last_name    = coalesce(left(nullif(btrim(coalesce(p_last_name, '')), ''), 120), l.last_name),
    display_name = coalesce(left(nullif(btrim(coalesce(p_display_name, '')), ''), 120), l.display_name),
    handle       = coalesce(left(nullif(btrim(coalesce(p_handle, '')), ''), 40), l.handle),
    payload      = l.payload ||
                   case when pg_column_size(coalesce(p_payload, '{}'::jsonb)) > 8192 then '{}'::jsonb else coalesce(p_payload, '{}'::jsonb) end,
    updated_at   = now()
  where l.id = p_lead_id;
  -- No row, wrong id, already converted: all the same silent no-op. The caller learns nothing.
end;
$$;

-- ── mark_signup_lead_converted: the funnel finished ──────────────────────────────────────────────
--
-- Called once the induction has written a profile. Unlike the two above this is NOT anon-callable and
-- it verifies OWNERSHIP: the caller must be signed in AS the profile they are claiming conversion
-- for. Without that check, a stolen lead id plus any profile id would let one account attach itself
-- to another person's funnel record.
create or replace function public.mark_signup_lead_converted(
  p_lead_id    uuid,
  p_profile_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_lead_id is null or p_profile_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.auth_user_id = auth.uid()
  ) then
    return;
  end if;

  update public.signup_leads as l set
    converted_profile_id = p_profile_id,
    -- Idempotent: the FIRST conversion is the one that counts, so a re-run of the finaliser cannot
    -- push the timestamp forward and make a same-day signup look like a recovered one.
    converted_at = coalesce(l.converted_at, now()),
    updated_at = now()
  where l.id = p_lead_id;
end;
$$;

-- Default EXECUTE on a new function is granted to PUBLIC, which over PostgREST means anon. Revoke
-- first, then hand back exactly the roles each function is designed for.
revoke execute on function public.capture_signup_lead(text, text, integer, text, text, text, text, jsonb, jsonb) from public;
revoke execute on function public.update_signup_lead(uuid, integer, text, text, text, text, jsonb) from public;
revoke execute on function public.mark_signup_lead_converted(uuid, uuid) from public;

-- The funnel runs signed-out, so anon must be able to capture and update.
grant execute on function public.capture_signup_lead(text, text, integer, text, text, text, text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.update_signup_lead(uuid, integer, text, text, text, text, jsonb) to anon, authenticated;
-- Conversion happens only after sign-in, and the function reads auth.uid() to prove ownership.
grant execute on function public.mark_signup_lead_converted(uuid, uuid) to authenticated;
