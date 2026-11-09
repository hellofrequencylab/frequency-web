-- LIVE-1967 (ADR-1933): the private draft a signed-out visitor builds on /create-a-space, saved to their email at
-- step 3, so an abandoned draft can be picked up again from a link and (LIVE-1968) reminded about, at most three
-- times, from the browser's own time zone.
--
-- Two things change here.
--
--   1. A new table, create_space_drafts. One row per saved draft, keyed by the hash of a token that only the
--      browser that saved it (and the email it was saved to) holds. The draft is the builder's own JSON, capped at
--      8KB like signup_leads.payload, and NEVER a picture: photo files stay in the browser (lib/create-space/uploads.ts).
--      The row remembers the time zone the browser reported, how far the visitor got, when they started, when they
--      last saved, when the draft became a Space (converted_at), and when they asked for no more reminders.
--      purge_after is set on insert to 90 days out and the reminder cron deletes past it; nothing lives here forever.
--
--   2. 'create_space' joins the signup_leads sources. The visitor's address goes through capture_signup_lead, the
--      same anon-callable door the induction and the guest RSVP use, so the operator's abandoned-leads list sees
--      them and convert_signup_leads_for_me() stamps the row converted when they sign in through the emailed link.
--      As with event_rsvp (20270345003300), the CHECK and the function's own case line are widened TOGETHER: the
--      function rewrites an unknown source to beta_induction rather than rejecting it, so widening one half alone
--      would land every Create a Space lead as a beta lead with nothing raising.
--
-- SECURITY POSTURE of the table: service role only. RLS on with no policy and every default grant revoked from anon
-- and authenticated; listed in scripts/rls-deny-all.txt. Written and read by lib/create-space/draft-io.ts through the
-- admin client, behind the public server action and beacon route on /create-a-space, which rate limit by IP and by
-- mailbox and accept only a token of the right shape. A read answers only the draft JSON for a matching token hash,
-- never whether an address is known.
--
-- House style: additive and idempotent, SECURITY DEFINER with a pinned search_path, no em or en dashes.
-- pgTAP: supabase/tests/create_space_drafts.test.sql.

begin;

-- ── 1. The table ──────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.create_space_drafts (
  id              uuid primary key default gen_random_uuid(),
  -- sha256 hex of the resume token. The token itself is never stored; it is in the browser's draft and in the
  -- reminder email's link, and a lookup hashes it first.
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Lowercased and trimmed by the writer. Not unique: a second browser makes a second row, and the reminder cron
  -- takes the newest unconverted row per address.
  email           text not null check (char_length(email) between 3 and 254),
  -- The lead row the address opened through capture_signup_lead, when that call succeeded.
  signup_lead_id  uuid references public.signup_leads(id) on delete set null,
  -- The handle the draft claims, re-checked on every save, so the day-3 reminder can skip a taken one.
  handle          text check (handle is null or char_length(handle) between 1 and 40),
  -- The builder's draft (lib/create-space/builder.ts, cut to its closed shape by parseDraft before it lands here).
  draft           jsonb not null default '{}'::jsonb check (pg_column_size(draft) <= 8192),
  -- The browser's IANA zone, for the 8am to 8pm reminder window. Null means no reminder is ever sent.
  tz              text check (tz is null or char_length(tz) between 1 and 64),
  -- 0-based builder step the visitor had reached when last saved; monotonic.
  step_reached    smallint not null default 0 check (step_reached between 0 and 9),
  started_at      timestamptz,
  saved_at        timestamptz not null default now(),
  converted_at    timestamptz,
  unsubscribed_at timestamptz,
  purge_after     timestamptz not null default now() + interval '90 days',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The reminder cron's read: unconverted rows by address, newest save first.
create index if not exists create_space_drafts_email_idx on public.create_space_drafts (lower(email), saved_at desc);
-- "Unconverted drafts that went quiet N hours ago": converted_at leads so the null group is contiguous.
create index if not exists create_space_drafts_recovery_idx on public.create_space_drafts (converted_at, saved_at);
-- FK index (public.signup_leads): an unindexed FK makes a lead delete scan this table.
create index if not exists create_space_drafts_lead_idx on public.create_space_drafts (signup_lead_id);
create index if not exists create_space_drafts_purge_idx on public.create_space_drafts (purge_after);

drop trigger if exists create_space_drafts_set_updated_at on public.create_space_drafts;
create trigger create_space_drafts_set_updated_at
  before update on public.create_space_drafts
  for each row execute function public.set_updated_at();

alter table public.create_space_drafts enable row level security;
revoke all on table public.create_space_drafts from anon, authenticated;

comment on table public.create_space_drafts is
  'LIVE-1967 / ADR-1933: a signed-out visitor''s private Create a Space draft, saved to their email at step 3. Keyed by the hash of a resume token; the draft JSON is capped at 8KB and never holds a picture. Service role only (RLS on, no policy). Purged after purge_after by the reminder cron.';

-- ── 2. 'create_space' joins the signup_leads sources (CHECK and case line together) ───────────────────────────

alter table public.signup_leads drop constraint if exists signup_leads_source_check;
alter table public.signup_leads
  add constraint signup_leads_source_check
  check (source in ('beta_induction', 'feature_funnel', 'event_rsvp', 'create_space'));

comment on column public.signup_leads.source is
  'Which funnel this person first entered through: beta_induction | feature_funnel | event_rsvp | create_space. Checked, not free text, because an unrecognised value would silently split the recovery job''s cohorts. NOT updated on a repeat capture: it records the FIRST door. capture_signup_lead carries the same list in its body and rewrites anything else to beta_induction, so this CHECK and that case expression must be widened together.';

-- Signature and return type identical to 20270345003300, so `create or replace` applies and the ACL survives.
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
  'ADR-959 lead capture, anon-callable. Upserts by lower(email) and returns {"id", "claim_token"} in the same shape for a new and a known address (null only for a malformed one). The claim token is minted fresh on every call, stored hashed, and is what update_signup_lead / mark_signup_lead_converted require (scan2 L7-6). p_source accepts beta_induction | feature_funnel | event_rsvp | create_space and rewrites anything else to beta_induction, so that list moves with signup_leads_source_check (20270346028600).';

commit;
