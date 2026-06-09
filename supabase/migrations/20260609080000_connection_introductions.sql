-- =============================================================================
-- Connection Layer P3 — the Introductions economy + the relationship timeline (ADR-186)
--
-- The novel mechanic: the highest-value social act on Frequency is INTRODUCING two
-- people who become real. You can introduce two people you're connected to; when
-- they become friends, you (the introducer) earn gems once (reward_introduction from
-- connection_settings). Plus relationship_timeline() — the auto interaction history
-- behind a connection (met / became friends / events together), no manual logging.
--
-- Guardrail (ADR-186): rewards an ACTION (introducing), never people-as-points; the
-- timeline is the caller's private read of their own tie.
-- =============================================================================

create table if not exists public.introductions (
  id            uuid primary key default gen_random_uuid(),
  introducer_id uuid not null references public.profiles(id) on delete cascade,
  person_a_id   uuid not null references public.profiles(id) on delete cascade,
  person_b_id   uuid not null references public.profiles(id) on delete cascade,
  note          text,
  status        text not null default 'pending' check (status in ('pending', 'connected', 'declined')),
  connected_at  timestamptz,
  rewarded      boolean not null default false,  -- introducer paid once on "became real"
  created_at    timestamptz not null default now(),
  constraint introductions_distinct check (
    person_a_id <> person_b_id and introducer_id <> person_a_id and introducer_id <> person_b_id
  )
);

create index if not exists introductions_introducer_idx on public.introductions (introducer_id);
create index if not exists introductions_person_a_idx on public.introductions (person_a_id);
create index if not exists introductions_person_b_idx on public.introductions (person_b_id);
-- One introduction per (introducer, unordered pair).
create unique index if not exists introductions_unique_idx
  on public.introductions (introducer_id, least(person_a_id, person_b_id), greatest(person_a_id, person_b_id));

alter table public.introductions enable row level security;

-- The introducer and the two introduced people may read it; all writes go through
-- the service role (the introduce action + the reward reconcile).
drop policy if exists "read own introductions" on public.introductions;
create policy "read own introductions" on public.introductions
  for select using (
    introducer_id in (select id from public.profiles where auth_user_id = auth.uid())
    or person_a_id in (select id from public.profiles where auth_user_id = auth.uid())
    or person_b_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

comment on table public.introductions is
  'A introduces B↔C; when B and C become friends the introducer earns reward_introduction gems once (ADR-186, P3). Service-role write.';

-- ── relationship_timeline — the auto interaction history of a connection ─────
-- The caller's private, event-derived history with one other member: when they met,
-- when they became friends, and every event they both showed up to. No manual log.
create or replace function public.relationship_timeline(_other uuid, _limit int default 50)
returns table (kind text, title text, at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select id from public.profiles where auth_user_id = auth.uid())
  -- how you met
  select 'met'::text,
         case f.how_met when 'in_person' then 'Met in person' when 'online' then 'Met online' else 'Met' end,
         f.met_at
  from public.friendships f
  where f.met_at is not null
    and ((f.user_a_id = (select id from me) and f.user_b_id = _other)
      or (f.user_b_id = (select id from me) and f.user_a_id = _other))
  union all
  -- became friends
  select 'connected'::text, 'Became friends', f.responded_at
  from public.friendships f
  where f.status = 'accepted' and f.responded_at is not null
    and ((f.user_a_id = (select id from me) and f.user_b_id = _other)
      or (f.user_b_id = (select id from me) and f.user_a_id = _other))
  union all
  -- every event you both RSVP'd "going" to
  select 'co_event'::text, e.title, e.starts_at
  from public.event_rsvps r1
  join public.event_rsvps r2 on r2.event_id = r1.event_id and r2.profile_id = _other and r2.status = 'going'
  join public.events e on e.id = r1.event_id
  where r1.profile_id = (select id from me) and r1.status = 'going'
  order by 3 desc nulls last   -- 3rd output column (at); alias isn't visible across UNION
  limit greatest(_limit, 0);
$$;

comment on function public.relationship_timeline is
  'The caller''s private, event-derived interaction history with one member (met / became friends / events together) — ADR-186, P3.';
