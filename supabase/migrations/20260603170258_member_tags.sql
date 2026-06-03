-- Member Data Platform · Phase 1 (ADR-068, docs/MEMBER-DATA-PLATFORM.md).
-- Declarative member tags — provenance + time-aware membership (e.g. web_beta,
-- founder, host). Tag *definitions* are governed in code (lib/traits/registry.ts);
-- this table holds *assignments*. Values are validated against the registry at the
-- app layer (assignTag). Privacy-by-design: member can VIEW own tags (transparency);
-- writes are service-role/admin; deletion cascades on account erase. Applied via MCP.
create table if not exists public.member_tags (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  tag_key     text not null,
  source      text not null default 'system',
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  expires_at  timestamptz,
  context     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (profile_id, tag_key)
);
create index if not exists member_tags_tag_key_idx on public.member_tags (tag_key) where expires_at is null;
create index if not exists member_tags_profile_idx on public.member_tags (profile_id);

alter table public.member_tags enable row level security;
drop policy if exists member_tags_select_own on public.member_tags;
create policy member_tags_select_own on public.member_tags
  for select using (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

comment on table public.member_tags is
  'Declarative member tags (assignments). Definitions governed in lib/traits/registry.ts. Member views own (RLS); service-role writes. See MEMBER-DATA-PLATFORM.md, ADR-068.';

-- Backfill: the founding cohort = web beta. Date each tag to when the member joined.
insert into public.member_tags (profile_id, tag_key, source, assigned_at, context)
select id, 'web_beta', 'backfill_founding_cohort', coalesce(created_at, now()),
       jsonb_build_object('cohort', 'founding', 'backfilled_at', now())
from public.profiles
where coalesce(is_demo, false) = false
  and coalesce(is_system, false) = false
on conflict (profile_id, tag_key) do nothing;
