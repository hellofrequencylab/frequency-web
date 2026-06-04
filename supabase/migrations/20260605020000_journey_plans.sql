-- Q1 P1 (backlog §Q1): the OPEN "Journeys" library — members curate combos of
-- practices, organized by Pillar (domains), and share/fork them. FREE; rides the
-- existing practice loop. Separate from the Crew-gated gamified engine (quest_*).
-- Writes go through the service-role admin client behind app-code authz (repo
-- convention); RLS governs reads.

create table public.journey_plans (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  title        text not null,
  summary      text,
  author_id    uuid references public.profiles(id) on delete set null,
  visibility   text not null default 'private' check (visibility in ('private','unlisted','public')),
  fork_of      uuid references public.journey_plans(id) on delete set null,
  forked_count int  not null default 0,
  adopt_count  int  not null default 0,
  cover_image  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz
);
create index journey_plans_public_idx on public.journey_plans (visibility, published_at desc);
create index journey_plans_author_idx on public.journey_plans (author_id);
create index journey_plans_fork_idx   on public.journey_plans (fork_of);

create table public.journey_plan_items (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.journey_plans(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  -- snapshot the practice's Pillar so the plan's pillar map is stable even if the
  -- practice is later recategorized.
  domain_id   uuid references public.domains(id) on delete set null,
  sort_order  int not null default 0,
  note        text,
  unique (plan_id, practice_id)
);
create index journey_plan_items_plan_idx on public.journey_plan_items (plan_id, sort_order);

alter table public.journey_plans      enable row level security;
alter table public.journey_plan_items enable row level security;

-- Reads: public plans, or your own (any visibility). Writes are service-role only
-- (the admin client bypasses RLS), gated in the server actions.
create policy journey_plans_select on public.journey_plans
  for select using (
    visibility = 'public' or author_id = get_my_profile_id()
  );

create policy journey_plan_items_select on public.journey_plan_items
  for select using (
    exists (
      select 1 from public.journey_plans jp
      where jp.id = plan_id
        and (jp.visibility = 'public' or jp.author_id = get_my_profile_id())
    )
  );
