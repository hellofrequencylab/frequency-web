-- =============================================================================
-- Connection Layer P3b — Welcomes (ADR-186)
--
-- The retention superpower: greeting a newcomer in their first week. When you
-- welcome someone who just joined one of your circles, you earn reward_welcome gems
-- once (from connection_settings). Rewards the ACTION of welcoming, never people-as-
-- points. One welcome per (welcomer, newcomer).
-- =============================================================================

create table if not exists public.welcomes (
  id          uuid primary key default gen_random_uuid(),
  welcomer_id uuid not null references public.profiles(id) on delete cascade,
  newcomer_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (welcomer_id, newcomer_id),
  constraint welcomes_distinct check (welcomer_id <> newcomer_id)
);

create index if not exists welcomes_welcomer_idx on public.welcomes (welcomer_id);
create index if not exists welcomes_newcomer_idx on public.welcomes (newcomer_id);

alter table public.welcomes enable row level security;

drop policy if exists "read own welcomes" on public.welcomes;
create policy "read own welcomes" on public.welcomes
  for select using (
    welcomer_id in (select id from public.profiles where auth_user_id = auth.uid())
    or newcomer_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

comment on table public.welcomes is
  'A established member welcomed a newcomer; earns reward_welcome gems once (ADR-186, P3b). Service-role write.';

-- ── welcome_targets — newcomers in your circles you haven't welcomed yet ─────
create or replace function public.welcome_targets(_days int default 14, _limit int default 12)
returns table (
  profile_id     uuid,
  display_name   text,
  handle         text,
  avatar_url     text,
  joined_at      timestamptz,
  shared_circles int
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select id from public.profiles where auth_user_id = auth.uid()),
  my_circles as (
    select circle_id from public.memberships
    where profile_id = (select id from me) and status = 'active'
  ),
  welcomed as (
    select newcomer_id from public.welcomes where welcomer_id = (select id from me)
  )
  select
    p.id, p.display_name, p.handle, p.avatar_url, p.created_at,
    (select count(*) from public.memberships m
       where m.profile_id = p.id and m.status = 'active'
         and m.circle_id in (select circle_id from my_circles))::int as shared_circles
  from public.profiles p
  where p.created_at > now() - make_interval(days => _days)
    and p.id <> (select id from me)
    and p.ghost_mode = false
    and p.id not in (select newcomer_id from welcomed)
    and exists (
      select 1 from public.memberships m
      where m.profile_id = p.id and m.status = 'active'
        and m.circle_id in (select circle_id from my_circles)
    )
  order by p.created_at desc
  limit greatest(_limit, 0);
$$;

comment on function public.welcome_targets is
  'Newcomers (joined within _days) in the caller''s circles that the caller hasn''t welcomed yet (ADR-186, P3b).';
