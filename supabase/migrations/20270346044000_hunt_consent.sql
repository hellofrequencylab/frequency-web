-- FH-024: the Frequency Hunts consent ledger, tenant-scoped leads and privacy requests (Tier 2, Consent).
--
-- The product rules are docs/hunts/PRODUCT-DRAFTS-D4-D7-D8.md (D4). In storage terms:
--
--   * hunt_consent_events is the ledger. Append-only: a grant or a withdrawal is a new row, never an
--     edit, and the table refuses UPDATE and any direct DELETE. One row names ONE Space, channel and
--     purpose, with the consent version, the source and a unique event key, so a second merchant's
--     choice is its own record and a replayed event adds nothing.
--   * hunt_contact_suppressions is what stops a send. A withdrawal writes a Space-scoped suppression
--     FIRST, then moves the lead. A privacy request writes a GLOBAL one (space_id null), which no grant
--     can lift. It carries a hash of the contact, so deleting the account (profile_id goes null) never
--     re-enables sends; a Space-scoped row with no profile and no hash is inert.
--   * hunt_leads is the scoped projection a Space sees: (space, profile, state, consent version). It
--     never carries another Space's choice or any private profile history, and hunt_consent_roster
--     returns only one Space's opted-in rows.
--   * hunt_privacy_requests records export, erase and do-not-contact requests, one per request key.
--
-- Replay after opt-out cannot re-subscribe: a repeated event key returns the stored answer, and an event
-- older than the latest one for the same Space, channel and purpose is refused as stale. Only a newer,
-- deliberate grant re-subscribes, and only when no global suppression stands.
-- Everything is service role only. Additive and idempotent.

begin;

create table if not exists public.hunt_consent_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  hunt_id uuid references public.hunts(id) on delete set null,
  channel text not null default 'email' check (channel in ('email')),
  purpose text not null default 'marketing' check (purpose in ('marketing')),
  event text not null check (event in ('grant','withdraw')),
  consent_version text not null check (char_length(btrim(consent_version)) between 1 and 40),
  source text not null check (source in ('hunt_reward','follow_link','player_area','privacy_request')),
  event_key text not null unique check (char_length(event_key) between 8 and 200),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists hunt_consent_events_latest_idx on public.hunt_consent_events(profile_id, space_id, channel, purpose, occurred_at desc);
create index if not exists hunt_consent_events_space_idx on public.hunt_consent_events(space_id);
create index if not exists hunt_consent_events_hunt_idx on public.hunt_consent_events(hunt_id) where hunt_id is not null;

-- Append-only. UPDATE is never allowed. DELETE is allowed only when an account cascade or the privacy
-- erase function (which sets the local flag) is doing it.
create or replace function public.hunt_consent_events_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'the consent ledger is append-only' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() <= 1 and coalesce(current_setting('hunt.privacy_erase', true), '') <> 'on' then
    raise exception 'the consent ledger is append-only' using errcode = '55000';
  end if;
  return old;
end;
$$;
drop trigger if exists hunt_consent_events_append_only on public.hunt_consent_events;
create trigger hunt_consent_events_append_only
  before update or delete on public.hunt_consent_events
  for each row execute function public.hunt_consent_events_guard();

create table if not exists public.hunt_contact_suppressions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  space_id uuid references public.spaces(id) on delete cascade,
  contact_hash text check (contact_hash is null or char_length(contact_hash) = 64),
  channel text not null default 'email' check (channel in ('email')),
  reason text not null check (reason in ('withdrawn','privacy_request','erasure','complaint')),
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  -- Only a Space-scoped withdrawal can be lifted; everything global is permanent.
  check (lifted_at is null or (space_id is not null and reason = 'withdrawn'))
);
create index if not exists hunt_contact_suppressions_profile_idx on public.hunt_contact_suppressions(profile_id, channel) where lifted_at is null;
create index if not exists hunt_contact_suppressions_space_idx on public.hunt_contact_suppressions(space_id) where space_id is not null;
create index if not exists hunt_contact_suppressions_hash_idx on public.hunt_contact_suppressions(contact_hash, channel) where contact_hash is not null and lifted_at is null;
create unique index if not exists hunt_contact_suppressions_one_active_idx
  on public.hunt_contact_suppressions(profile_id, coalesce(space_id, '00000000-0000-0000-0000-000000000000'::uuid), channel, reason)
  where lifted_at is null and profile_id is not null;

create table if not exists public.hunt_leads (
  space_id uuid not null references public.spaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  state text not null check (state in ('opted_in','withdrawn')),
  consent_version text not null,
  first_hunt_id uuid references public.hunts(id) on delete set null,
  last_event_id uuid references public.hunt_consent_events(id) on delete set null,
  opted_in_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (space_id, profile_id)
);
create index if not exists hunt_leads_profile_idx on public.hunt_leads(profile_id);
create index if not exists hunt_leads_first_hunt_idx on public.hunt_leads(first_hunt_id) where first_hunt_id is not null;
create index if not exists hunt_leads_last_event_idx on public.hunt_leads(last_event_id) where last_event_id is not null;

create table if not exists public.hunt_privacy_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('export','erase','do_not_contact')),
  request_key text not null unique check (char_length(request_key) between 8 and 200),
  state text not null default 'open' check (state in ('open','done')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (state <> 'done' or completed_at is not null)
);
create index if not exists hunt_privacy_requests_profile_idx on public.hunt_privacy_requests(profile_id) where profile_id is not null;

alter table public.hunt_consent_events enable row level security;
revoke all on table public.hunt_consent_events from public, anon, authenticated;
grant all on public.hunt_consent_events to service_role;
alter table public.hunt_contact_suppressions enable row level security;
revoke all on table public.hunt_contact_suppressions from public, anon, authenticated;
grant all on public.hunt_contact_suppressions to service_role;
alter table public.hunt_leads enable row level security;
revoke all on table public.hunt_leads from public, anon, authenticated;
grant all on public.hunt_leads to service_role;
alter table public.hunt_privacy_requests enable row level security;
revoke all on table public.hunt_privacy_requests from public, anon, authenticated;
grant all on public.hunt_privacy_requests to service_role;

-- Record one grant or withdrawal.
create or replace function public.hunt_consent_record(
  p_profile uuid,
  p_space uuid,
  p_event text,
  p_version text,
  p_source text,
  p_hunt uuid,
  p_event_key text,
  p_occurred_at timestamptz default now(),
  p_channel text default 'email',
  p_purpose text default 'marketing'
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  existing public.hunt_consent_events%rowtype;
  latest timestamptz;
  event_id uuid;
begin
  if p_profile is null or p_space is null or p_event is null or p_version is null or p_source is null or p_event_key is null then
    raise exception 'hunt_consent_record needs a profile, Space, event, version, source and event key' using errcode = '22023';
  end if;
  if p_event not in ('grant', 'withdraw') then
    raise exception 'unknown consent event %', p_event using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile::text || ':consent:' || p_space::text || ':' || p_channel || ':' || p_purpose, 0));

  -- A repeated event key is a replay: answer what was stored, write nothing.
  select * into existing from public.hunt_consent_events where event_key = p_event_key;
  if found then
    return jsonb_build_object('result', 'replayed', 'event', existing.event);
  end if;

  select max(occurred_at) into latest from public.hunt_consent_events
   where profile_id = p_profile and space_id = p_space and channel = p_channel and purpose = p_purpose;
  if latest is not null and p_occurred_at <= latest then
    return jsonb_build_object('result', 'stale');
  end if;

  if p_event = 'grant' then
    if exists (select 1 from public.hunt_contact_suppressions
                where profile_id = p_profile and space_id is null and channel = p_channel and lifted_at is null) then
      return jsonb_build_object('result', 'suppressed');
    end if;

    insert into public.hunt_consent_events (profile_id, space_id, hunt_id, channel, purpose, event, consent_version, source, event_key, occurred_at)
    values (p_profile, p_space, p_hunt, p_channel, p_purpose, 'grant', p_version, p_source, p_event_key, p_occurred_at)
    returning id into event_id;

    update public.hunt_contact_suppressions set lifted_at = now()
     where profile_id = p_profile and space_id = p_space and channel = p_channel and reason = 'withdrawn' and lifted_at is null;

    insert into public.hunt_leads (space_id, profile_id, state, consent_version, first_hunt_id, last_event_id, opted_in_at)
    values (p_space, p_profile, 'opted_in', p_version, p_hunt, event_id, p_occurred_at)
    on conflict (space_id, profile_id) do update
      set state = 'opted_in', consent_version = excluded.consent_version, last_event_id = excluded.last_event_id,
          opted_in_at = excluded.opted_in_at, updated_at = now();
    return jsonb_build_object('result', 'recorded', 'event', 'grant', 'event_id', event_id);
  end if;

  -- Withdrawal: the suppression first, then the ledger row, then the lead.
  insert into public.hunt_contact_suppressions (profile_id, space_id, channel, reason)
  values (p_profile, p_space, p_channel, 'withdrawn')
  on conflict do nothing;

  insert into public.hunt_consent_events (profile_id, space_id, hunt_id, channel, purpose, event, consent_version, source, event_key, occurred_at)
  values (p_profile, p_space, p_hunt, p_channel, p_purpose, 'withdraw', p_version, p_source, p_event_key, p_occurred_at)
  returning id into event_id;

  insert into public.hunt_leads (space_id, profile_id, state, consent_version, first_hunt_id, last_event_id)
  values (p_space, p_profile, 'withdrawn', p_version, p_hunt, event_id)
  on conflict (space_id, profile_id) do update
    set state = 'withdrawn', consent_version = excluded.consent_version, last_event_id = excluded.last_event_id, updated_at = now();
  return jsonb_build_object('result', 'recorded', 'event', 'withdraw', 'event_id', event_id);
end;
$$;

-- May a message go? Marketing needs the latest event to be a grant and no suppression (Space or global,
-- by profile or by contact hash). Essential messages (a reward ready, a closed stop) are checked
-- independently of marketing consent and are blocked only by a global suppression.
create or replace function public.hunt_consent_can_send(
  p_profile uuid,
  p_space uuid,
  p_essential boolean default false,
  p_contact_hash text default null,
  p_channel text default 'email'
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  last_event text;
begin
  if p_profile is null or p_space is null then
    raise exception 'hunt_consent_can_send needs a profile and a Space' using errcode = '22023';
  end if;

  if exists (select 1 from public.hunt_contact_suppressions
              where channel = p_channel and space_id is null and lifted_at is null
                and (profile_id = p_profile or (p_contact_hash is not null and contact_hash = p_contact_hash))) then
    return jsonb_build_object('allowed', false, 'reason', 'global_suppression');
  end if;
  if p_essential then
    return jsonb_build_object('allowed', true, 'reason', 'essential');
  end if;

  if exists (select 1 from public.hunt_contact_suppressions
              where channel = p_channel and space_id = p_space and lifted_at is null
                and (profile_id = p_profile or (p_contact_hash is not null and contact_hash = p_contact_hash))) then
    return jsonb_build_object('allowed', false, 'reason', 'space_suppression');
  end if;

  select event into last_event from public.hunt_consent_events
   where profile_id = p_profile and space_id = p_space and channel = p_channel and purpose = 'marketing'
   order by occurred_at desc, created_at desc limit 1;
  if last_event is distinct from 'grant' then
    return jsonb_build_object('allowed', false, 'reason', case when last_event is null then 'no_consent' else 'withdrawn' end);
  end if;
  return jsonb_build_object('allowed', true, 'reason', 'opted_in');
end;
$$;

-- What ONE Space may see: its own opted-in leads, no email, no other Space's rows, no profile history.
create or replace function public.hunt_consent_roster(p_space uuid)
returns table (profile_id uuid, consent_version text, opted_in_at timestamptz, first_hunt_id uuid)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select l.profile_id, l.consent_version, l.opted_in_at, l.first_hunt_id
    from public.hunt_leads l
   where l.space_id = p_space
     and l.state = 'opted_in'
     and not exists (select 1 from public.hunt_contact_suppressions s
                      where s.profile_id = l.profile_id and s.lifted_at is null and (s.space_id is null or s.space_id = l.space_id));
$$;

-- Privacy requests. do_not_contact: a global suppression and every lead withdrawn. erase: the same,
-- plus the hash-only tombstone, then the player's leads and ledger rows go. export: recorded open; the
-- application assembles the player's own history. Idempotent per request key.
create or replace function public.hunt_privacy_request(
  p_profile uuid,
  p_kind text,
  p_request_key text,
  p_contact_hash text default null
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  existing public.hunt_privacy_requests%rowtype;
  req_id uuid;
begin
  if p_profile is null or p_kind is null or p_request_key is null then
    raise exception 'hunt_privacy_request needs a profile, kind and request key' using errcode = '22023';
  end if;
  if p_kind not in ('export', 'erase', 'do_not_contact') then
    raise exception 'unknown privacy request %', p_kind using errcode = '22023';
  end if;
  if p_kind in ('erase', 'do_not_contact') and (p_contact_hash is null or char_length(p_contact_hash) <> 64) then
    raise exception 'this request needs the contact hash so the suppression outlives the account' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile::text || ':privacy', 0));

  select * into existing from public.hunt_privacy_requests where request_key = p_request_key;
  if found then
    return jsonb_build_object('result', 'replayed', 'state', existing.state);
  end if;

  insert into public.hunt_privacy_requests (profile_id, kind, request_key, state, completed_at)
  values (p_profile, p_kind, p_request_key,
          case when p_kind = 'export' then 'open' else 'done' end,
          case when p_kind = 'export' then null else now() end)
  returning id into req_id;

  if p_kind in ('do_not_contact', 'erase') then
    -- Suppress first.
    insert into public.hunt_contact_suppressions (profile_id, space_id, contact_hash, channel, reason)
    values (p_profile, null, p_contact_hash, 'email', case when p_kind = 'erase' then 'erasure' else 'privacy_request' end)
    on conflict do nothing;
    update public.hunt_leads set state = 'withdrawn', updated_at = now() where profile_id = p_profile and state <> 'withdrawn';
  end if;

  if p_kind = 'erase' then
    perform set_config('hunt.privacy_erase', 'on', true);
    delete from public.hunt_leads where profile_id = p_profile;
    delete from public.hunt_consent_events where profile_id = p_profile;
    perform set_config('hunt.privacy_erase', 'off', true);
  end if;

  return jsonb_build_object('result', 'recorded', 'request_id', req_id, 'state', case when p_kind = 'export' then 'open' else 'done' end);
end;
$$;

revoke all on function public.hunt_consent_events_guard() from public, anon, authenticated;
revoke all on function public.hunt_consent_record(uuid, uuid, text, text, text, uuid, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.hunt_consent_record(uuid, uuid, text, text, text, uuid, text, timestamptz, text, text) to service_role;
revoke all on function public.hunt_consent_can_send(uuid, uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.hunt_consent_can_send(uuid, uuid, boolean, text, text) to service_role;
revoke all on function public.hunt_consent_roster(uuid) from public, anon, authenticated;
grant execute on function public.hunt_consent_roster(uuid) to service_role;
revoke all on function public.hunt_privacy_request(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.hunt_privacy_request(uuid, text, text, text) to service_role;

comment on table public.hunt_consent_events is 'FH-024: append-only consent ledger, one named Space, channel and purpose per row. Service role only.';
comment on table public.hunt_contact_suppressions is 'FH-024: what stops a send. Space-scoped withdrawals can lift on a newer grant; global ones and erasure tombstones never lift. Service role only.';
comment on table public.hunt_leads is 'FH-024: the tenant-scoped lead projection a Space may see. Service role only.';
comment on table public.hunt_privacy_requests is 'FH-024: export, erase and do-not-contact requests, one per request key. Service role only.';

commit;
