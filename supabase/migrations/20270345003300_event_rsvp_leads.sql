-- Event RSVP leads: widen signup_leads.source, and give an event guest a door proved by AUTH.
--
-- WHAT THIS ADDS. Two things, and nothing else.
--
--   1. `signup_leads.source` accepts a third value, 'event_rsvp'. A guest who RSVPs to an event with
--      an address and no account is exactly the half-finished signup this table was built for
--      (20270215000000, ADR-959), but the funnel they came through is neither of the two the
--      original CHECK enumerated, and an unrecognised value would have split the recovery job's
--      cohorts. So the CHECK is widened, drop-if-exists then re-add, the way
--      network_contacts_source_check was widened in 20261170000000.
--
--      ⚠️ THE CHECK IS NOT THE WHOLE ALLOW-LIST, and this is the part that would have shipped
--      broken. capture_signup_lead carries its OWN copy of the allowed set in its body:
--          v_source text := case when p_source in ('beta_induction', 'feature_funnel')
--                                then p_source else 'beta_induction' end;
--      That line does not reject an unknown source, it silently REWRITES it. Widening only the
--      constraint would therefore have landed every event lead in the table as a beta_induction
--      lead, with no error anywhere to say so, and the recovery note would have told an event guest
--      to finish setting up an account they never started. So capture_signup_lead is replaced here
--      with 'event_rsvp' added to that case expression, and with nothing else changed: it is the
--      definition from 20270345000610 verbatim apart from that one line. Its comment and its
--      revoke-by-name + grant footer are restated so the replace drops nothing.
--
--   2. A new function, `public.convert_signup_leads_for_me()`.
--
-- WHY THE NEW FUNCTION HAS TO EXIST. The conversion door we already have,
-- mark_signup_lead_converted(p_lead_id, p_profile_id, p_claim_token), requires the CLAIM TOKEN that
-- capture_signup_lead handed back to the browser (20270345000610, scan2 L7-6). That is the right
-- rule for the induction funnel, where capture and sign-up happen minutes apart in one tab. It
-- cannot work for an event RSVP. A guest gives an address at an event, and then signs in days
-- later, very possibly on a different device, from an email link, or never having held the token at
-- all. They have no token, they will never have one, and the token is not recoverable by design
-- (only the SHA-256 hex is stored).
--
-- So the event path needs a second door with a DIFFERENT proof: not "you hold the token we handed
-- your browser" but "you are signed in, and the provider has confirmed this address is yours".
-- That is a strictly stronger claim on the address than a token is, which is why it is safe to open
-- it without one.
--
-- HOW IT IS KEPT HONEST.
--   · It takes NO arguments. It never accepts an email as a parameter, because a typed address
--     keys nothing (ADR-854): anyone could type anyone's. The address is read server-side, out of
--     auth.users, for auth.uid() only.
--   · The address must be CONFIRMED (email_confirmed_at is not null). An unconfirmed address is a
--     claim, not a proof, and stamping on one would let a signup with someone else's address
--     absorb their lead row.
--   · No profile, or no confirmed address, returns 0 and writes nothing. Not an error: there is
--     nothing here for the caller to learn either way.
--   · It stamps only rows with converted_at is null, so a second call stamps nothing and returns 0.
--     The first conversion is the one that counts, same rule as mark_signup_lead_converted.
--   · It is granted to `authenticated` only. anon cannot reach it, because anon has no proven
--     address to match on.
--
-- ROLLBACK (all three, together):
--   drop function if exists public.convert_signup_leads_for_me();
--   alter table public.signup_leads drop constraint if exists signup_leads_source_check;
--   alter table public.signup_leads add constraint signup_leads_source_check
--     check (source in ('beta_induction', 'feature_funnel'));
--   re-run the `create function public.capture_signup_lead(...)` block of
--   20270345000610_signup_lead_updates_need_a_claim_token.sql, restoring its two-value case line.
-- Restoring the narrow CHECK fails while any row already carries source = 'event_rsvp', so those
-- rows must be repointed or deleted first. The app half (the RSVP capture path that passes
-- p_source => 'event_rsvp', and the sign-in finaliser that calls convert_signup_leads_for_me) MUST
-- roll back in the SAME deploy: the widened CHECK without the app is harmless, the app without the
-- widened CHECK writes leads that land as beta_induction or fail outright.
--
-- House style: additive and idempotent (drop constraint if exists, create or replace), SECURITY
-- DEFINER with a pinned search_path, revoke by role NAME before granting (ADR-959: a bare
-- `from public` leaves Supabase's per-role default grants standing). No em or en dashes.
-- pgTAP: supabase/tests/event_rsvp_leads.test.sql.

begin;

-- ── 1. The CHECK: 'event_rsvp' joins the enumerated sources ──────────────────────────────────────
-- The constraint was declared inline on the column in 20270215000000, so Postgres named it
-- signup_leads_source_check. Dropped if-exists and re-added, which makes this block re-runnable and
-- makes it a no-op on a database that already has the widened form.

alter table public.signup_leads drop constraint if exists signup_leads_source_check;
alter table public.signup_leads
  add constraint signup_leads_source_check
  check (source in ('beta_induction', 'feature_funnel', 'event_rsvp'));

comment on column public.signup_leads.source is
  'Which funnel this person first entered through: beta_induction | feature_funnel | event_rsvp. Checked, not free text, because an unrecognised value would silently split the recovery job''s cohorts. NOT updated on a repeat capture: it records the FIRST door. capture_signup_lead carries the same list in its body and rewrites anything else to beta_induction, so this CHECK and that case expression must be widened together.';

-- ── 2. capture_signup_lead, unchanged except for the one line that rewrites the source ───────────
-- Signature and return type are identical to 20270345000610, so `create or replace` applies and the
-- existing ACL survives it. The grants are restated in section 4 anyway, so this file carries its
-- own verdict.

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
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  -- 'event_rsvp' added 20270345003300. Anything NOT in this list is still rewritten to
  -- 'beta_induction' rather than rejected, so this list and signup_leads_source_check must be
  -- widened in the same migration, every time.
  v_source text := case when p_source in ('beta_induction', 'feature_funnel', 'event_rsvp') then p_source else 'beta_induction' end;
  v_step   smallint := least(greatest(coalesce(p_step, 0), 0), 32767)::smallint;
  v_token  uuid := gen_random_uuid();
  v_hash   text := encode(extensions.digest(v_token::text, 'sha256'), 'hex');
  v_id     uuid;
begin
  -- Same shape the app layer validates with (app/join/(induction)/lead-actions.ts). Checked again
  -- here because this function is reachable by anon over PostgREST, not only through that action.
  if v_email = '' or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return null;
  end if;

  insert into public.signup_leads as l (
    email, source, step_reached, first_name, last_name, display_name, handle, payload, attribution,
    claim_token_hash
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
    case when pg_column_size(coalesce(p_attribution, '{}'::jsonb)) > 8192 then '{}'::jsonb else coalesce(p_attribution, '{}'::jsonb) end,
    v_hash
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
    -- The token ROTATES: the browser that most recently gave the address holds the row (header).
    claim_token_hash = excluded.claim_token_hash,
    -- `source` is NOT updated: it records where this person first entered, which is the question
    -- the funnel report asks. Their latest funnel is already in payload.
    updated_at   = now()
  returning l.id into v_id;

  -- One fixed shape for every accepted address, new or already here. Nothing else leaves the row.
  return jsonb_build_object('id', v_id, 'claim_token', v_token);
end;
$$;

comment on function public.capture_signup_lead(text, text, integer, text, text, text, text, jsonb, jsonb) is
  'ADR-959 lead capture, anon-callable. Upserts by lower(email) and returns {"id", "claim_token"} in the same shape for a new and a known address (null only for a malformed one). The claim token is minted fresh on every call, stored hashed, and is what update_signup_lead / mark_signup_lead_converted require (scan2 L7-6). p_source accepts beta_induction | feature_funnel | event_rsvp and rewrites anything else to beta_induction, so that list moves with signup_leads_source_check (20270345003300).';

-- ── 3. convert_signup_leads_for_me: the conversion door proved by AUTH, not by a token ───────────

create or replace function public.convert_signup_leads_for_me()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_email      text;
  v_n          integer;
begin
  -- WHO. auth.uid() is null for anon and for any caller without a JWT, so the profile lookup
  -- returns nothing and the function is a no-op for them. There is no argument to spoof here
  -- because there is no argument at all.
  select p.id into v_profile_id
    from public.profiles p
   where p.auth_user_id = auth.uid();

  if v_profile_id is null then
    return 0;
  end if;

  -- WHICH ADDRESS. Read server-side out of auth.users, never taken from the caller (ADR-854: a
  -- typed address keys nothing). email_confirmed_at is the whole proof: an unconfirmed address is a
  -- claim, and stamping on a claim would let a signup with someone else's address absorb that
  -- person's lead row.
  select lower(u.email) into v_email
    from auth.users u
   where u.id = auth.uid()
     and u.email_confirmed_at is not null;

  if v_email is null or v_email = '' then
    return 0;
  end if;

  -- SOURCE-BLIND, ON PURPOSE. This converts a 'beta_induction' or 'feature_funnel' lead carrying
  -- the same proven address just as readily as an 'event_rsvp' one. That is correct: signup_leads
  -- holds one row per PERSON (unique on lower(email)), the address has been proved to belong to
  -- this account, and a half-finished induction by the same person is the same half-finished
  -- signup whichever door it came through. A source filter here would leave that row unconverted
  -- and keep mailing them a recovery note after they had already joined.
  --
  -- `converted_at is null` is what makes this idempotent: a second call matches no row, stamps
  -- nothing, and returns 0. The FIRST conversion is the one that counts, so a re-run cannot push
  -- the timestamp forward and make a same-day signup look like a recovered one.
  update public.signup_leads as l set
    converted_profile_id = v_profile_id,
    converted_at = now(),
    updated_at = now()
  where lower(l.email) = v_email
    and l.converted_at is null;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.convert_signup_leads_for_me() is
  'Stamps every unconverted signup_leads row whose address matches the CALLER''S OWN confirmed auth.users email, and returns how many it stamped. It exists because mark_signup_lead_converted requires the claim token capture_signup_lead handed the capturing browser, and an event guest who RSVPs by email and signs in days later on another device holds no such token and never will; this door is proved by authentication instead, which is a stronger claim on the address than a token is. It takes no arguments and never accepts an email (ADR-854), reads the address server-side for auth.uid() only, refuses an unconfirmed address, returns 0 and writes nothing when there is no profile or no proven address, is idempotent (it only touches converted_at is null), and is deliberately source-blind because a beta_induction lead for the same proven address belongs to the same person. authenticated only.';

-- ── 4. Grants ────────────────────────────────────────────────────────────────────────────────────
-- Revoke by role NAME first: a bare `from public` leaves Supabase's per-role default grants standing
-- (ADR-959, 20270215000001). capture_signup_lead keeps the verdict it already had in
-- scripts/function-grants.txt (`public`, the funnel runs signed out). The new function is
-- authenticated only, because anon has no proven address for it to match on.

revoke execute on function public.capture_signup_lead(text, text, integer, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.capture_signup_lead(text, text, integer, text, text, text, text, jsonb, jsonb) to anon, authenticated, service_role;

revoke execute on function public.convert_signup_leads_for_me() from public, anon, authenticated;
grant execute on function public.convert_signup_leads_for_me() to authenticated;

commit;
