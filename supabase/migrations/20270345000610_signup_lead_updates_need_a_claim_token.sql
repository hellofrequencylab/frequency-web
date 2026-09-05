-- update_signup_lead and mark_signup_lead_converted require a CLAIM TOKEN the browser holds (scan2 L7-6).
--
-- THE DEFECT. capture_signup_lead (20270215000000) hands the browser a signup_leads.id and the two
-- later doors, update_signup_lead (anon-callable) and mark_signup_lead_converted (authenticated),
-- accepted that id as the whole key: `update ... where l.id = p_lead_id`. The original file argued
-- the id is not a capability because a caller who knows the ADDRESS is handed the same id by the
-- capture door anyway. That is true and it is not the whole story: an id also leaks on its own,
-- through browser storage, a referrer, a support screenshot, a log line. Whoever picks it up could
-- rewrite that lead's name, handle, step and payload with no proof of anything.
--
-- THE FIX. A per-row CLAIM TOKEN that only the capturing browser is given.
--
--   capture_signup_lead   mints a fresh random uuid on EVERY successful call, stores its SHA-256
--                         hex in the new column `claim_token_hash`, and returns
--                             {"id": <row id>, "claim_token": <the uuid>}
--                         as jsonb. Same fixed shape on every path that is not a malformed address,
--                         for a brand-new address and for one already here, so the anti-oracle
--                         property of the original file holds: the shape carries no created/updated
--                         flag and nothing is read out of the existing row.
--   update_signup_lead    takes `p_claim_token` beside `p_lead_id` and updates only when the pair
--                         matches. Returns boolean: true when a row changed, false otherwise.
--   mark_signup_lead_converted
--                         takes `p_claim_token` as a third argument, keeps its auth.uid() ownership
--                         check on the profile, and additionally requires the token. Same boolean.
--
-- A wrong or missing token changes nothing and returns false. False on a bad pair is not an oracle
-- on the id: without the token every id gives the same false, and the token is one random uuid
-- that only the browser that captured the address was ever shown.
--
-- HASHED, NOT PLAIN, and why. The row is service-role only, so a plain token would be safe against
-- every browser role. It would not be safe against the exposure this finding is about: a support
-- screenshot, a privacy export, an operator reading the table in the dashboard. Each of those
-- shows the row, and with a plain token the row IS the write capability. A SHA-256 hex costs one
-- extensions.digest() call per write and turns the stored value into something that proves a
-- token without being one. pgcrypto is already installed in the `extensions` schema
-- (20260613120000), and it is referenced schema-qualified because search_path is pinned to public.
--
-- ROTATION. Every capture mints a new token and REPLACES the stored hash. The browser that most
-- recently gave the address holds the row, which is what a returning visitor on a new browser
-- needs, and it means a token that leaked earlier stops working the next time the address is
-- captured. A caller who knows the address could always rewrite these fields through the capture
-- door, so rotation grants nobody anything the open door does not already grant.
--
-- EXISTING ROWS. Every row captured before this migration has claim_token_hash = NULL. No token
-- can match a NULL hash, so those rows are updatable by NOBODY through these functions: not anon,
-- not authenticated, not the browser that originally captured them. Fail closed, on purpose. The
-- service role can still write the table directly (RLS on, zero policies, service_role bypasses),
-- and the recovery job reads it the same way it always has. A visitor mid-funnel at the moment
-- this applies loses the later beats of that one session and re-captures on the next; their
-- address is already in the row and nothing is lost that a follow-up cannot recover.
--
-- WHY DROP AND NOT REPLACE. `create or replace` cannot change a return type (uuid to jsonb, void to
-- boolean), and adding a parameter to update_signup_lead would create an OVERLOAD beside the old
-- unproven door rather than closing it. So all three old signatures are dropped by name. A drop
-- resets the ACL to Supabase's defaults (EXECUTE to anon and authenticated), which is why every
-- grant below is restated from zero, role-explicit, in this file.
--
-- House style: additive column (add column if not exists), idempotent drops (if exists), SECURITY
-- DEFINER with a pinned search_path, revoke by role name (ADR-959). No em or en dashes.
-- pgTAP: supabase/tests/signup_lead_claim_token.test.sql.

begin;

-- ── 1. The column ────────────────────────────────────────────────────────────────────────────────

alter table public.signup_leads
  add column if not exists claim_token_hash text;

comment on column public.signup_leads.claim_token_hash is
  'SHA-256 hex of the claim token capture_signup_lead handed the capturing browser. update_signup_lead and mark_signup_lead_converted require the matching token; NULL (rows captured before 20270345000610) matches nothing, so those rows are writable only by the service role.';

-- ── 2. capture_signup_lead: the ONE door anon may knock on, now returning {id, claim_token} ──────

drop function if exists public.capture_signup_lead(text, text, integer, text, text, text, text, jsonb, jsonb);

create function public.capture_signup_lead(
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
  v_source text := case when p_source in ('beta_induction', 'feature_funnel') then p_source else 'beta_induction' end;
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
  'ADR-959 lead capture, anon-callable. Upserts by lower(email) and returns {"id", "claim_token"} in the same shape for a new and a known address (null only for a malformed one). The claim token is minted fresh on every call, stored hashed, and is what update_signup_lead / mark_signup_lead_converted require (scan2 L7-6).';

-- ── 3. update_signup_lead: later beats, keyed on the id AND the claim token ──────────────────────

drop function if exists public.update_signup_lead(uuid, integer, text, text, text, text, jsonb);

create function public.update_signup_lead(
  p_lead_id      uuid,
  p_claim_token  uuid default null,
  p_step         integer default null,
  p_first_name   text default null,
  p_last_name    text default null,
  p_display_name text default null,
  p_handle       text default null,
  p_payload      jsonb default '{}'
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  -- A missing half of the pair is a no-op. This is checked before the hash so a NULL token never
  -- reaches digest() and a NULL stored hash can never be matched by anything.
  if p_lead_id is null or p_claim_token is null then
    return false;
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
  where l.id = p_lead_id
    and l.claim_token_hash is not null
    and l.claim_token_hash = encode(extensions.digest(p_claim_token::text, 'sha256'), 'hex');

  get diagnostics v_n = row_count;
  -- No row, wrong id, wrong token, a row from before the token existed: all the same false.
  return v_n > 0;
end;
$$;

comment on function public.update_signup_lead(uuid, uuid, integer, text, text, text, text, jsonb) is
  'Folds later funnel answers into a signup_leads row. Requires the row id AND the claim token capture_signup_lead returned; a wrong or missing token changes nothing and returns false (scan2 L7-6). Rows without a stored token hash are writable by nobody through this door.';

-- ── 4. mark_signup_lead_converted: the funnel finished, proven twice ─────────────────────────────

drop function if exists public.mark_signup_lead_converted(uuid, uuid);

create function public.mark_signup_lead_converted(
  p_lead_id     uuid,
  p_profile_id  uuid,
  p_claim_token uuid default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  if p_lead_id is null or p_profile_id is null or p_claim_token is null then
    return false;
  end if;

  -- Ownership of the PROFILE: the caller must be signed in as the profile they are claiming
  -- conversion for. Without this a stolen lead pair plus any profile id would let one account
  -- attach itself to another person's funnel record.
  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.auth_user_id = auth.uid()
  ) then
    return false;
  end if;

  -- Ownership of the LEAD: the claim token, same rule as update_signup_lead.
  update public.signup_leads as l set
    converted_profile_id = p_profile_id,
    -- Idempotent: the FIRST conversion is the one that counts, so a re-run of the finaliser cannot
    -- push the timestamp forward and make a same-day signup look like a recovered one.
    converted_at = coalesce(l.converted_at, now()),
    updated_at = now()
  where l.id = p_lead_id
    and l.claim_token_hash is not null
    and l.claim_token_hash = encode(extensions.digest(p_claim_token::text, 'sha256'), 'hex');

  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

comment on function public.mark_signup_lead_converted(uuid, uuid, uuid) is
  'Stamps a signup_leads row converted. Requires auth.uid() to own the profile AND the claim token capture_signup_lead returned; either missing returns false and changes nothing (scan2 L7-6). Authenticated only.';

-- ── 5. Grants, from zero ─────────────────────────────────────────────────────────────────────────
-- The drops above reset each ACL to Supabase's defaults (EXECUTE to anon and authenticated by
-- default privilege, plus PUBLIC). Revoke by role NAME, since `from public` alone leaves the
-- per-role default grants standing (ADR-959, 20270215000001), then hand back exactly the roles
-- each door is for. The verdicts in scripts/function-grants.txt are unchanged: capture and update
-- are `public` (the funnel runs signed out), conversion is `authenticated`.

revoke execute on function public.capture_signup_lead(text, text, integer, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.update_signup_lead(uuid, uuid, integer, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.mark_signup_lead_converted(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.capture_signup_lead(text, text, integer, text, text, text, text, jsonb, jsonb) to anon, authenticated, service_role;
grant execute on function public.update_signup_lead(uuid, uuid, integer, text, text, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.mark_signup_lead_converted(uuid, uuid, uuid) to authenticated, service_role;

commit;

-- Rollback: drop the three functions by the signatures created here, re-run the three
-- `create or replace function` blocks and the grant block of 20270215000000_signup_leads.sql plus
-- 20270215000001_signup_leads_close_default_grants.sql, and `alter table public.signup_leads drop
-- column claim_token_hash`. The app side (app/join/(induction)/lead-actions.ts) reads the jsonb
-- return and sends p_claim_token, so it must be rolled back in the same deploy.
