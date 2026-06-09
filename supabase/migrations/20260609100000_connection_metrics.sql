-- =============================================================================
-- Connection Layer P6 — the metrics suite (ADR-186)
--
-- Two caller-private / aggregate metric RPCs that complete the "clever metrics"
-- layer from the design:
--   • your_impact()        — the lead-funnel view of YOU: people you brought in
--     (captured contacts who became members), how fast they activated, and how many
--     went on to connect (the catalyst signal — did you bring connectors?).
--   • circle_momentum(c)   — is a circle warming or cooling: members, new members
--     this week, and NEW ties formed BETWEEN its members this week (counts only, no
--     names — a vital sign, not a surveillance feed).
-- Both SECURITY DEFINER with a pinned search_path; your_impact is scoped to the
-- caller via auth.uid(); circle_momentum returns only aggregate counts.
-- =============================================================================

create or replace function public.your_impact()
returns table (
  brought              int,
  activated            int,
  avg_days_to_activate numeric,
  catalysts            int
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select id from public.profiles where auth_user_id = auth.uid()),
  brought as (
    select nc.linked_profile_id as pid, nc.created_at as captured_at, p.created_at as joined_at
    from public.network_contacts nc
    join public.profiles p on p.id = nc.linked_profile_id
    where nc.owner_id = (select id from me)
      and nc.linked_profile_id is not null
  )
  select
    count(*)::int as brought,
    count(*) filter (where b.joined_at > b.captured_at)::int as activated,
    round(
      avg(extract(epoch from (b.joined_at - b.captured_at)) / 86400.0)
        filter (where b.joined_at > b.captured_at),
      1
    ) as avg_days_to_activate,
    count(*) filter (where exists (
      select 1 from public.friendships f
      where f.status = 'accepted' and (f.user_a_id = b.pid or f.user_b_id = b.pid)
    ))::int as catalysts
  from brought b;
$$;

comment on function public.your_impact is
  'The caller''s lead-funnel impact: people they brought (captured → member), activation velocity, and how many went on to connect (catalyst). Caller-scoped (ADR-186, P6).';

create or replace function public.circle_momentum(_circle uuid)
returns table (
  members          int,
  new_members_7d   int,
  new_ties_7d      int,
  upcoming_events  int
)
language sql
stable
security definer
set search_path = public
as $$
  with mem as (
    select profile_id from public.memberships where circle_id = _circle and status = 'active'
  )
  select
    (select count(*) from mem)::int as members,
    (select count(*) from public.memberships
       where circle_id = _circle and status = 'active' and joined_at > now() - interval '7 days')::int as new_members_7d,
    (select count(*) from public.friendships f
       where f.status = 'accepted' and f.responded_at > now() - interval '7 days'
         and f.user_a_id in (select profile_id from mem)
         and f.user_b_id in (select profile_id from mem))::int as new_ties_7d,
    (select count(*) from public.events e
       where e.scope_id = _circle and e.starts_at > now() and coalesce(e.is_cancelled, false) = false)::int as upcoming_events;
$$;

comment on function public.circle_momentum is
  'A circle''s vital signs — members, new members (7d), and new ties formed between members (7d). Aggregate counts only (ADR-186, P6).';
