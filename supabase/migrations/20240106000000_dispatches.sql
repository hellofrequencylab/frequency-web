-- Dispatches: role-scoped announcements (the "street team bulletin" feature)
-- Authors are host/guide/mentor. Audience is determined by scope + id.

create table if not exists dispatches (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references profiles(id) on delete cascade,
  title          text not null,
  body           text not null,          -- markdown
  excerpt        text,                   -- auto-generated first ~200 chars for feed cards
  -- Audience scoping
  audience_scope text not null check (audience_scope in ('circle', 'hub', 'nexus')),
  audience_id    uuid not null,          -- polymorphic FK to circles/hubs/nexuses
  -- Optional link to a crew task / challenge
  linked_task_id uuid references crew_tasks(id) on delete set null,
  -- Lifecycle
  status         text not null default 'draft' check (status in ('draft', 'published')),
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists dispatches_author_idx        on dispatches(author_id);
create index if not exists dispatches_audience_idx      on dispatches(audience_scope, audience_id);
create index if not exists dispatches_published_at_idx  on dispatches(published_at desc) where status = 'published';

-- RLS: service role writes; members can read dispatches scoped to their audience
alter table dispatches enable row level security;

create policy "Anyone authenticated can read published dispatches"
  on dispatches for select
  to authenticated
  using (status = 'published');
