-- FH-018S (live half): Frequency Hunts reports and the pause / resume / close switch (Tier 2, Safety).
--
-- A report is one member saying "this Trail is unsafe or wrong". hunt_reports holds them (service role
-- only, like every Hunt table); one person has at most one OPEN report per Hunt, so a second tap is not
-- a second voice. hunt_report_file is the only writer of a report. hunt_moderate is the only writer of a
-- Hunt's running state after publish: pause (live to paused), resume (paused to live) and close
-- (live or paused to ended). Each writes its change, the audit row, one outbox row (consumer
-- 'moderation') and the idempotency record together, or none of them. A refusal writes nothing.
--
-- Who may call is decided in the app (lib/hunts/authz.ts decide: pause_resume, end); the database
-- guarantees the moves and the once-ness. Nothing is deleted: a paused or closed Hunt keeps every run,
-- credit and grant, it only stops granting. Additive and idempotent.

begin;

create table if not exists public.hunt_reports (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references public.hunts(id) on delete cascade,
  reporter_profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('unsafe','private_property','minor_risk','wrong_or_broken','offensive','other')),
  details text not null default '' check (char_length(details) <= 1000),
  state text not null default 'open' check (state in ('open','dismissed','actioned')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 280),
  check ((state = 'open') = (resolved_at is null))
);
create unique index if not exists hunt_reports_one_open_idx
  on public.hunt_reports(hunt_id, reporter_profile_id) where state = 'open';
create index if not exists hunt_reports_hunt_idx on public.hunt_reports(hunt_id, created_at desc);
create index if not exists hunt_reports_reporter_idx on public.hunt_reports(reporter_profile_id);
create index if not exists hunt_reports_resolved_by_idx on public.hunt_reports(resolved_by) where resolved_by is not null;

alter table public.hunt_reports enable row level security;
revoke all on table public.hunt_reports from public, anon, authenticated;
grant all on public.hunt_reports to service_role;

create or replace function public.hunt_report_file(
  p_actor uuid,
  p_hunt_id uuid,
  p_reason text,
  p_details text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  h public.hunts%rowtype;
  stored public.hunt_command_keys%rowtype;
  report_id uuid;
  clean text;
  answer jsonb;
begin
  if p_actor is null or p_hunt_id is null or p_reason is null or p_idempotency_key is null or p_request_hash is null then
    raise exception 'hunt_report_file needs an actor, hunt, reason, key and request hash' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':report_file:' || p_idempotency_key, 0));

  select * into stored from public.hunt_command_keys
   where actor_profile_id = p_actor and action = 'report_file' and idempotency_key = p_idempotency_key;
  if found then
    if stored.request_hash <> p_request_hash then
      return jsonb_build_object('result', 'key_conflict');
    end if;
    return coalesce(stored.response_ref, jsonb_build_object('result', 'reported')) || jsonb_build_object('replayed', true);
  end if;

  if p_reason not in ('unsafe','private_property','minor_risk','wrong_or_broken','offensive','other') then
    return jsonb_build_object('result', 'bad_reason');
  end if;
  clean := btrim(coalesce(p_details, ''));
  if char_length(clean) > 1000 then
    return jsonb_build_object('result', 'details_too_long');
  end if;

  -- Serialise on the Hunt row so two taps of the same person cannot both pass the open-report check.
  select * into h from public.hunts
   where id = p_hunt_id and visibility in ('public', 'unlisted') and status in ('live', 'paused', 'ended')
   for update;
  if not found then
    return jsonb_build_object('result', 'hunt_not_found');
  end if;

  if exists (select 1 from public.hunt_reports where hunt_id = h.id and reporter_profile_id = p_actor and state = 'open') then
    return jsonb_build_object('result', 'already_reported');
  end if;

  insert into public.hunt_reports (hunt_id, reporter_profile_id, reason, details)
  values (h.id, p_actor, p_reason, clean)
  returning id into report_id;

  insert into public.hunt_audit (hunt_id, actor_profile_id, action, target_kind, target_id, after_state)
  values (h.id, p_actor, 'report_filed', 'report', report_id::text, jsonb_build_object('reason', p_reason));

  insert into public.hunt_outbox (hunt_id, consumer, event_id, event_type, aggregate_kind, aggregate_id,
                                  aggregate_revision, semantic_key, payload)
  values (h.id, 'moderation', 'report-' || report_id::text, 'report.filed', 'hunt', h.id::text,
          h.revision, 'report:' || report_id::text,
          jsonb_build_object('report_id', report_id, 'reason', p_reason));

  answer := jsonb_build_object('result', 'reported', 'report_id', report_id);
  insert into public.hunt_command_keys (actor_profile_id, action, idempotency_key, request_hash, hunt_id, response_ref)
  values (p_actor, 'report_file', p_idempotency_key, p_request_hash, h.id, answer);

  return answer;
end;
$$;

create or replace function public.hunt_moderate(
  p_actor uuid,
  p_hunt_id uuid,
  p_action text,
  p_note text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  h public.hunts%rowtype;
  stored public.hunt_command_keys%rowtype;
  next_status text;
  clean text;
  closed_reports integer := 0;
  answer jsonb;
begin
  if p_actor is null or p_hunt_id is null or p_action is null or p_idempotency_key is null or p_request_hash is null then
    raise exception 'hunt_moderate needs an actor, hunt, action, key and request hash' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':moderate:' || p_idempotency_key, 0));

  select * into stored from public.hunt_command_keys
   where actor_profile_id = p_actor and action = 'hunt_moderate' and idempotency_key = p_idempotency_key;
  if found then
    if stored.request_hash <> p_request_hash then
      return jsonb_build_object('result', 'key_conflict');
    end if;
    return coalesce(stored.response_ref, jsonb_build_object('result', 'moderated')) || jsonb_build_object('replayed', true);
  end if;

  if p_action not in ('pause', 'resume', 'close') then
    return jsonb_build_object('result', 'bad_action');
  end if;
  clean := btrim(coalesce(p_note, ''));
  if char_length(clean) > 280 then
    return jsonb_build_object('result', 'note_too_long');
  end if;

  select * into h from public.hunts where id = p_hunt_id for update;
  if not found then
    return jsonb_build_object('result', 'hunt_not_found');
  end if;

  -- The only moves. Ended is final: a Hunt that ended or was cancelled is never reopened in place.
  next_status := case
    when p_action = 'pause' and h.status = 'live' then 'paused'
    when p_action = 'resume' and h.status = 'paused' then 'live'
    when p_action = 'close' and h.status in ('live', 'paused') then 'ended'
    else null
  end;
  if next_status is null then
    return jsonb_build_object('result', 'not_allowed', 'status', h.status);
  end if;

  update public.hunts set status = next_status, revision = revision + 1, updated_at = now() where id = h.id;

  -- Closing or resuming is the operator's answer to what was reported; a pause leaves the queue open.
  if p_action in ('close', 'resume') then
    update public.hunt_reports
       set state = case when p_action = 'close' then 'actioned' else 'dismissed' end,
           resolved_at = now(), resolved_by = p_actor, resolution_note = nullif(clean, '')
     where hunt_id = h.id and state = 'open';
    get diagnostics closed_reports = row_count;
  end if;

  insert into public.hunt_audit (hunt_id, actor_profile_id, action, target_kind, target_id, before_state, after_state)
  values (h.id, p_actor, 'hunt_' || p_action, 'hunt', h.id::text,
          jsonb_build_object('status', h.status),
          jsonb_build_object('status', next_status, 'reports_resolved', closed_reports));

  insert into public.hunt_outbox (hunt_id, consumer, event_id, event_type, aggregate_kind, aggregate_id,
                                  aggregate_revision, semantic_key, payload)
  values (h.id, 'moderation', 'moderate-' || h.id::text || '-' || (h.revision + 1)::text, 'hunt.' || p_action, 'hunt', h.id::text,
          h.revision + 1, 'moderate:' || h.id::text || ':' || (h.revision + 1)::text,
          jsonb_build_object('action', p_action, 'status', next_status));

  answer := jsonb_build_object('result', 'moderated', 'status', next_status);
  insert into public.hunt_command_keys (actor_profile_id, action, idempotency_key, request_hash, hunt_id, response_ref)
  values (p_actor, 'hunt_moderate', p_idempotency_key, p_request_hash, h.id, answer);

  return answer;
end;
$$;

revoke all on function public.hunt_report_file(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.hunt_report_file(uuid, uuid, text, text, text, text) to service_role;
revoke all on function public.hunt_moderate(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.hunt_moderate(uuid, uuid, text, text, text, text) to service_role;

comment on table public.hunt_reports is 'FH-018S: one member report on a Hunt; one open report per person per Hunt. Service role only.';
comment on function public.hunt_report_file(uuid, uuid, text, text, text, text) is 'FH-018S: file one report on a visible Hunt. Service role only.';
comment on function public.hunt_moderate(uuid, uuid, text, text, text, text) is 'FH-018S: pause, resume or close a Hunt, resolving open reports on close or resume. Service role only.';

commit;
