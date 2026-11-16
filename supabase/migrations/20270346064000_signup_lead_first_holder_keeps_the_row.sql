-- SCAN-1246: a repeat capture_signup_lead can no longer take a lead row from the browser that opened it.
--
-- capture_signup_lead is anon-callable and upserts by lower(email). On a conflict it used to set
-- claim_token_hash = excluded.claim_token_hash and hand the new raw token back, so ANYONE who submitted an address
-- already in signup_leads became the row's holder: update_signup_lead accepted their token, the real person's
-- browser was locked out of its own row, and the stranger could rewrite the names and the handle.
--
-- WHAT CHANGES, on a repeat capture of a known address (the insert path is untouched):
--   1. THE TOKEN IS NOT ROTATED. The stored claim_token_hash stays exactly as it was (including NULL on a row
--      from before the token existed, which stays writable by nobody). The caller still gets {"id", "claim_token"}
--      in the same fixed shape, so the reply says nothing about the address, but that token opens no row:
--      update_signup_lead and mark_signup_lead_converted answer false for it, as they do for any wrong token.
--   2. THE STORED NAMES AND HANDLE WIN. first_name, last_name, display_name and handle are filled in when blank
--      and never replaced, the same rule capture_guest_rsvp applies to guest_name (scan2 L7-5). The holder can
--      still change them through update_signup_lead with the token.
--
-- WHAT DOES NOT CHANGE, and why:
--   * step_reached still takes the furthest step, and source and first-touch attribution stay immutable.
--   * payload still merges with the newer key winning. The Create a Space builder re-sends its payload (score,
--     step, offer, place) through this door on every save and discards the token
--     (lib/create-space/draft-io.ts), and the operator's lead list reads that score, so freezing existing keys
--     would stop the score moving. The payload therefore remains an unproven record of the latest submission;
--     nothing should treat it as the person's verified answer. That part of SCAN-1246 is left stated, not fixed.
--   * Signature, return type and return shape are identical, so `create or replace` applies and the ACL survives.
--     Callers: app/join/(induction)/lead-actions.ts (keeps the token), app/(main)/events/guest-rsvp-actions.ts,
--     lib/billing/tickets.ts and lib/create-space/draft-io.ts (all three read only the id).
--   * Conversion at sign-in does not use the token: convert_signup_leads_for_me() proves the address through
--     auth.users, so a person who comes back in a new browser still converts.
--
-- THE KNOWN COST. A person who returns in a different browser (or after the 30-day fq_lead cookie has gone) and
-- gives the same address gets a token that opens nothing, so that browser's later beats are silent no-ops; the
-- capture itself still records the furthest step and merges the payload. The alternative, rotating, is the defect.
-- The same browser re-submitting its address is handled in the app: lead-actions.ts keeps the token it already
-- holds when the row id comes back the same.
--
-- Additive and idempotent. ROLLBACK: re-run the `create or replace function public.capture_signup_lead(...)`
-- block from 20270346028600_create_space_drafts.sql.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Signature and return type identical to 20270346028600, so `create or replace` applies and the ACL survives.
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
  -- 'event_rsvp' added 20270345003300, 'create_space' 20270346028600. Anything NOT in this list is still
  -- rewritten to 'beta_induction' rather than rejected, so this list and signup_leads_source_check must be
  -- widened in the same migration, every time.
  v_source text := case when p_source in ('beta_induction', 'feature_funnel', 'event_rsvp', 'create_space') then p_source else 'beta_induction' end;
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
    -- 2026-11-16 (SCAN-1246): the STORED name and handle win. This call is unproven (anyone can submit
    -- an address), so it may fill in a blank and may not replace an answer. The holder of the claim
    -- token changes them through update_signup_lead.
    first_name   = coalesce(l.first_name, excluded.first_name),
    last_name    = coalesce(l.last_name, excluded.last_name),
    display_name = coalesce(l.display_name, excluded.display_name),
    handle       = coalesce(l.handle, excluded.handle),
    -- Still newest-key-wins: the Create a Space builder re-sends its score through this door on every
    -- save (header). Unproven by construction; do not read it as the person's verified answer.
    payload      = l.payload || excluded.payload,
    -- First touch is immutable (ADR-095). Only an empty attribution record is filled in.
    attribution  = case when l.attribution = '{}'::jsonb then excluded.attribution else l.attribution end,
    -- 2026-11-16 (SCAN-1246): the token does NOT rotate. The browser that opened the row holds it; a
    -- later caller gets a token in the same shape that opens nothing. A NULL hash stays NULL.
    claim_token_hash = l.claim_token_hash,
    -- `source` is NOT updated: it records where this person first entered, which is the question
    -- the funnel report asks. Their latest funnel is already in payload.
    updated_at   = now()
  returning l.id into v_id;

  -- One fixed shape for every accepted address, new or already here. Nothing else leaves the row.
  -- For an address already here, v_token is NOT the row's token (SCAN-1246): it matches no stored hash.
  return jsonb_build_object('id', v_id, 'claim_token', v_token);
end;
$$;

comment on function public.capture_signup_lead(text, text, integer, text, text, text, text, jsonb, jsonb) is
  'ADR-959 lead capture, anon-callable. Upserts by lower(email) and returns {"id", "claim_token"} in the same shape for a new and a known address (null only for a malformed one). The claim token opens the row only for the call that CREATED it: a repeat capture of a known address keeps the stored token hash, fills blank names and handle without replacing them, and returns a token that opens nothing (SCAN-1246). The token is stored hashed and is what update_signup_lead / mark_signup_lead_converted require (scan2 L7-6). p_source accepts beta_induction | feature_funnel | event_rsvp | create_space and rewrites anything else to beta_induction, so that list moves with signup_leads_source_check (20270346028600).';

commit;
