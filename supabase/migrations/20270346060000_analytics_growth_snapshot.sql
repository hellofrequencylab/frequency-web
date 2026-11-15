-- Read-only operational aggregates. No raw member, contact, visitor or topic leaves this RPC.
begin;
-- The live snapshot shares one bounded ledger scan. This also supports newest-event and clock-skew checks.
create index if not exists engagement_events_growth_created_idx
  on public.engagement_events (created_at desc);
create or replace function public.analytics_growth_snapshot(_days int default 30)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  d int := greatest(1, least(coalesce(_days, 30), 90));
  t timestamptz := now();
  result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not authorized to read growth analytics' using errcode = '42501';
  end if;
  with recursive
  window_events as materialized (
    select event_type, created_at, idempotency_key, actor_profile_id
    from public.engagement_events
    where created_at >= t - make_interval(days => d) and created_at < t
  ),
  marks as (
    select profile_id as person, event_id, attended_at as at
    from public.event_rsvps
    where profile_id is not null and attended_by is not null
      and attended_by <> profile_id and attended_at < t
    union
    select buyer_profile_id, event_id, attended_at
    from public.event_tickets
    where buyer_profile_id is not null and attended_by is not null
      and attended_by <> buyer_profile_id and attended_at < t
  ),
  attendance as (
    -- attended_at is mutable evidence time: hosts can re-mark a seat. Event completion
    -- is the authoritative occurrence used for cohorts, elapsed time and date bins.
    select m.person, m.event_id, e.ends_at as at from marks m
    join public.profiles p on p.id = m.person
    join public.events e on e.id = m.event_id
    where p.is_system = false and e.ends_at < t and coalesce(e.is_cancelled, false) = false
    group by m.person, m.event_id, e.ends_at
  ),
  guest_marks as (
    select lower(trim(guest_email)) as guest from public.event_rsvps r join public.events e on e.id = r.event_id
    where profile_id is null and nullif(trim(guest_email), '') is not null and attended_by is not null
      and attended_at < t and e.ends_at >= t - interval '7 days' and e.ends_at < t
      and coalesce(e.is_cancelled, false) = false
    union
    select lower(trim(guest_email)) from public.event_tickets r join public.events e on e.id = r.event_id
    where buyer_profile_id is null and nullif(trim(guest_email), '') is not null and attended_by is not null
      and attended_at < t and e.ends_at >= t - interval '7 days' and e.ends_at < t
      and coalesce(e.is_cancelled, false) = false
  ),
  completed_rsvps as (
    select distinct r.profile_id, r.event_id,
      exists(select 1 from attendance a where a.person = r.profile_id and a.event_id = r.event_id) as attended
    from public.event_rsvps r join public.events e on e.id = r.event_id
    join public.profiles p on p.id = r.profile_id and p.is_system = false
    where r.status = 'going' and r.approval_status in ('none', 'approved')
      and coalesce(e.is_cancelled, false) = false and e.ends_at < t
      and e.ends_at >= t - make_interval(days => d)
  ),
  firsts as (select person, min(at) as first_at from attendance group by person),
  return_cohort as (
    select f.person, f.first_at,
      exists(select 1 from attendance a where a.person = f.person and a.at > f.first_at
        and a.at <= f.first_at + interval '28 days') as returned
    from firsts f where f.first_at >= t - make_interval(days => d + 28)
      and f.first_at < t - interval '28 days'
  ),
  profiles_cohort as (
    select p.id, p.created_at,
      left(coalesce(nullif(p.acquisition->>'source', ''), nullif(p.meta->'acquisition'->'first_touch'->'utm'->>'source', ''), 'unknown'), 100) as source,
      left(coalesce(nullif(p.acquisition->>'medium', ''), nullif(p.meta->'acquisition'->'first_touch'->'utm'->>'medium', ''), 'unknown'), 100) as medium,
      left(coalesce(nullif(p.acquisition->>'campaign', ''), nullif(p.meta->'acquisition'->'first_touch'->'utm'->>'campaign', ''), 'unattributed'), 100) as campaign,
      left(coalesce(nullif(p.meta->'acquisition'->>'last_touch_channel', ''), 'unknown'), 100) as converting_channel,
      f.first_at
    from public.profiles p left join firsts f on f.person = p.id
    where p.is_system = false and p.created_at >= t - make_interval(days => d) and p.created_at < t
  ),
  campaigns as (
    select source, medium, campaign, converting_channel, count(*) as signups,
      count(*) filter(where created_at <= t - interval '7 days') as eligible,
      count(*) filter(where created_at > t - interval '7 days') as pending,
      count(*) filter(where created_at <= t - interval '7 days' and first_at >= created_at
        and first_at <= created_at + interval '7 days') as activated
    from profiles_cohort group by source, medium, campaign, converting_channel
  ),
  lead_campaigns as (
    select left(coalesce(nullif(l.attribution->'first_touch'->'utm'->>'source', ''), 'unknown'), 100) as source,
      left(coalesce(nullif(l.attribution->'first_touch'->'utm'->>'medium', ''), 'unknown'), 100) as medium,
      left(coalesce(nullif(l.attribution->'first_touch'->'utm'->>'campaign', ''), 'unattributed'), 100) as campaign,
      count(*) as leads, count(l.converted_profile_id) as linked_members,
      count(*) filter(where l.created_at <= t - interval '7 days') as eligible,
      count(*) filter(where l.created_at > t - interval '7 days') as pending,
      count(*) filter(where l.created_at <= t - interval '7 days' and f.first_at >= l.created_at
        and f.first_at <= l.created_at + interval '7 days') as attended
    from public.signup_leads l left join firsts f on f.person = l.converted_profile_id
    where l.created_at >= t - make_interval(days => d) and l.created_at < t
    group by 1, 2, 3
  ),
  recent_events as (
    select event_type, count(*) as events, max(created_at) as latest
    from window_events where created_at >= t - interval '30 minutes'
    group by event_type
  ),
  builder_steps(i, event_type, label) as (
    values (1, 'createspace.view', 'Opened the builder'),
      (2, 'createspace.name_started', 'Typed a name'),
      (3, 'createspace.accent_picked', 'Picked an accent'),
      (4, 'createspace.offer', 'Mocked up the offer'),
      (5, 'createspace.lead', 'Reported a save'),
      (6, 'createspace.photos', 'Finished photos')
  ),
  builder_events as (
    select split_part(idempotency_key, ':', 2) as visitor, event_type, created_at as at
    from window_events
    where idempotency_key like 'create_space:%' and event_type like 'createspace.%'
  ),
  builder_walk as (
    select visitor, 1 as i, min(at) as at, min(at) as start_at
    from builder_events where event_type = 'createspace.view' group by visitor
    union all
    select w.visitor, w.i + 1, n.at, w.start_at
    from builder_walk w join builder_steps s on s.i = w.i + 1
    cross join lateral (
      select min(e.at) as at from builder_events e where e.visitor = w.visitor
        and e.event_type = s.event_type and e.at > w.at and e.at <= w.start_at + interval '7 days'
    ) n where n.at is not null
  ),
  builder as (
    select s.i, s.label, s.event_type, count(w.visitor) as visits,
      count(w.visitor) filter(where w.start_at <= t - interval '7 days') as "matureVisits"
    from builder_steps s left join builder_walk w on w.i = s.i group by s.i, s.label, s.event_type
  )
  select jsonb_build_object(
    'computedAt', t, 'windowDays', d,
    'showingUp', (select count(distinct person) from attendance where at >= t - interval '7 days'),
    'previousShowingUp', (select count(distinct person) from attendance where at >= t - interval '14 days' and at < t - interval '7 days'),
    'guestsShowingUp', (select count(*) from guest_marks),
    'rsvpEligible', (select count(*) from completed_rsvps),
    'rsvpAttended', (select count(*) from completed_rsvps where attended),
    'repeatEligible', (select count(*) from return_cohort),
    'repeatReturned', (select count(*) from return_cohort where returned),
    'timeToFirstMedianHours', (select percentile_cont(0.5) within group (order by extract(epoch from (first_at - created_at)) / 3600) from profiles_cohort where first_at >= created_at),
    'timeToFirstP90Hours', (select percentile_cont(0.9) within group (order by extract(epoch from (first_at - created_at)) / 3600) from profiles_cohort where first_at >= created_at),
    'firstAttendanceObserved', (select count(*) from profiles_cohort where first_at >= created_at),
    'newMembers', (select count(*) from profiles_cohort),
    'weeklyAttendance', (select jsonb_agg(n order by bucket desc) from (select bucket, (select count(distinct person) from attendance where at >= t - make_interval(days => (bucket + 1) * 7) and at < t - make_interval(days => bucket * 7)) as n from generate_series(0, 7) bucket) weeks),
    'builderPendingVisits', (select count(*) from builder_walk where i = 1 and start_at > t - interval '7 days'),
    'measurement', jsonb_build_object(
      'eventsInWindow', (select count(*) from window_events),
      'signupEventsExpected', (select count(*) from profiles_cohort),
      'signupEventsObserved', (select count(*) from profiles_cohort p where exists(select 1 from window_events e where e.event_type = 'account.created' and e.actor_profile_id = p.id and e.created_at >= p.created_at)),
      'leadEventsExpected', (select count(*) from public.signup_leads where created_at >= t - make_interval(days => d) and created_at < t),
      'leadEventsObserved', (select count(*) from public.signup_leads l where l.created_at >= t - make_interval(days => d) and l.created_at < t and exists(select 1 from window_events e where e.event_type = 'lead.captured' and e.idempotency_key = 'lead.captured:' || l.id::text and e.created_at >= l.created_at)),
      'unattributedSignups', (select count(*) from profiles_cohort where source = 'unknown' and campaign = 'unattributed'),
      'unattributedLeads', (select coalesce(sum(leads), 0) from lead_campaigns where source = 'unknown' and campaign = 'unattributed'),
      'futureEventRows', (select count(*) from public.engagement_events where created_at > t + interval '5 minutes')
    ),
    'savedDrafts', (select count(*) from public.create_space_drafts where created_at >= t - make_interval(days => d) and created_at < t),
    'lastEventAt', (select max(created_at) from public.engagement_events where created_at < t),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(c) order by c.signups desc, c.source, c.medium, c.campaign, c.converting_channel) from campaigns c), '[]'::jsonb),
    'leadCampaigns', coalesce((select jsonb_agg(to_jsonb(l) order by l.leads desc, l.source, l.medium, l.campaign) from lead_campaigns l), '[]'::jsonb),
    'recentEvents', coalesce((select jsonb_agg(to_jsonb(e) order by e.events desc, e.event_type) from recent_events e), '[]'::jsonb),
    'builder', coalesce((select jsonb_agg(to_jsonb(b) order by b.i) from builder b), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.analytics_growth_snapshot(int) from public, anon, authenticated;
grant execute on function public.analytics_growth_snapshot(int) to service_role;
comment on function public.analytics_growth_snapshot(int) is
  'Admin-server-only growth snapshot: host-confirmed attendance, mature cohorts, first-touch campaign outcomes, ordered anonymous builder steps. No raw identity export.';
commit;
