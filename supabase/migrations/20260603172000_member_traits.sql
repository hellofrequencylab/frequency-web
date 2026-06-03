-- Member Data Platform · Phase 2 (ADR-069). Computed traits — a PROJECTION of the
-- engagement_events ledger (ADR-025), refreshed on a schedule. Raw events stay the
-- source of truth. Narrow store (one row per profile+trait) so heterogeneous and
-- future predictive traits slot in beside deterministic ones. Member views own (RLS);
-- the refresh job writes via service role. Applied live via MCP.
create table if not exists public.member_traits (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  trait_key   text not null,
  value_num   double precision,
  value_text  text,
  value_ts    timestamptz,
  value_bool  boolean,
  value_json  jsonb,
  computed_at timestamptz not null default now(),
  primary key (profile_id, trait_key)
);
create index if not exists member_traits_key_idx on public.member_traits (trait_key);

alter table public.member_traits enable row level security;
drop policy if exists member_traits_select_own on public.member_traits;
create policy member_traits_select_own on public.member_traits
  for select using (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

comment on table public.member_traits is
  'Computed member traits — a projection of engagement_events (ADR-025), refreshed nightly. Definitions in lib/traits/registry.ts. Member views own (RLS); service-role writes. See MEMBER-DATA-PLATFORM.md, ADR-069.';

-- Per-member raw aggregates from the ledger. The pure TS layer (lib/traits/compute.ts)
-- turns these into registry-governed trait values, so derivation logic stays testable.
create or replace function public.member_engagement_stats()
returns table (
  profile_id                 uuid,
  created_at                 timestamptz,
  last_event_at              timestamptz,
  first_verified_practice_at timestamptz,
  distinct_active_days_30    integer,
  verified_practices_7d      integer,
  event_count_30d            integer
)
language sql
stable
as $$
  select
    p.id,
    p.created_at,
    max(e.created_at),
    min(e.created_at) filter (where e.event_type = 'practice.verified'),
    count(distinct date_trunc('day', e.created_at))
      filter (where e.created_at > now() - interval '30 days')::int,
    count(*) filter (where e.event_type = 'practice.verified'
                       and e.created_at > now() - interval '7 days')::int,
    count(*) filter (where e.created_at > now() - interval '30 days')::int
  from public.profiles p
  left join public.engagement_events e on e.actor_profile_id = p.id
  where coalesce(p.is_demo, false) = false
    and coalesce(p.is_system, false) = false
  group by p.id, p.created_at;
$$;
