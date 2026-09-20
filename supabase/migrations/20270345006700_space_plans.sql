-- SPACE PLANS (ADR-1386 PROG-CAL2 to PROG-CAL8). The working record behind Pencils and
-- Productions: notes, links, to-dos, playbooks, co-host shares, and a private team feed.
--
-- A Plan is private to the host Space's team (ADR-923 quad on private.can_write_space_content).
-- An accepted share lets a co-host Space's editors read and write that Plan. Nothing on a Plan
-- is public. Publishing still happens only in the event Studio (invariant 1).
--
-- House style: additive + idempotent. Rollback: drop the new tables and columns in reverse
-- order (feeds, shares, playbooks, plan_id columns, space_plans).

-- ── space_plans ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.space_plans (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references public.spaces(id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 200),
  -- Derived where possible (PROG-CAL2). Stored so a someday Plan with no dates still has a stage.
  stage              text not null default 'plan'
                     check (stage in ('pencil', 'plan', 'production')),
  notes              text check (notes is null or char_length(notes) <= 20000),
  links              jsonb not null default '[]'::jsonb,
  -- CAL8: what Production opens. v1 default is event. The third stage stays Production
  -- on team surfaces (docs/NAMING.md); the target only changes which Studio the verb opens.
  target_kind        text not null default 'event'
                     check (target_kind in ('event', 'journey', 'program', 'maintenance')),
  playbook_id        uuid,
  owner_profile_id   uuid references public.profiles(id) on delete set null,
  created_by         uuid references public.profiles(id) on delete set null,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.space_plans is
  'A Space Plan (ADR-1386): the working record behind one or more Pencils and Productions. Team only.';
comment on column public.space_plans.stage is
  'pencil | plan | production. A someday Plan with no dates is plan.';
comment on column public.space_plans.target_kind is
  'What Make it a Production opens (ADR-1386 P8). event is v1.';
comment on column public.space_plans.links is
  'JSON array of {url, label} objects. Validated in lib/calendar/plans.ts.';

create index if not exists space_plans_space_idx
  on public.space_plans (space_id) where archived_at is null;

drop trigger if exists space_plans_set_updated_at on public.space_plans;
create trigger space_plans_set_updated_at
  before update on public.space_plans
  for each row execute function public.set_updated_at();

alter table public.space_plans enable row level security;

-- Host-only policies first. Co-host arms are added after space_plan_shares exists.
drop policy if exists space_plans_space_read on public.space_plans;
create policy space_plans_space_read on public.space_plans
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_plans_space_insert on public.space_plans;
create policy space_plans_space_insert on public.space_plans
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_plans_space_update on public.space_plans;
create policy space_plans_space_update on public.space_plans
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_plans_space_delete on public.space_plans;
create policy space_plans_space_delete on public.space_plans
  for delete using (private.can_write_space_content(space_id));

revoke all on table public.space_plans from anon;

-- ── space_plan_shares (CAL2 co-host visibility, CAL7 collaboration) ─────────────────────────
create table if not exists public.space_plan_shares (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references public.space_plans(id) on delete cascade,
  guest_space_id   uuid not null references public.spaces(id) on delete cascade,
  status           text not null default 'pending'
                   check (status in ('pending', 'accepted', 'declined', 'revoked')),
  requested_by     uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  responded_at     timestamptz,
  responded_by     uuid references public.profiles(id) on delete set null
);

comment on table public.space_plan_shares is
  'A co-host Space may work a Plan only through an accepted share (ADR-1386, ADR-1387).';

create unique index if not exists uniq_space_plan_share_active
  on public.space_plan_shares (plan_id, guest_space_id)
  where status in ('pending', 'accepted');

alter table public.space_plan_shares enable row level security;

drop policy if exists space_plan_shares_read on public.space_plan_shares;
create policy space_plan_shares_read on public.space_plan_shares
  for select using (
    exists (
      select 1 from public.space_plans p
      where p.id = space_plan_shares.plan_id
        and (
          private.can_write_space_content(p.space_id)
          or private.can_write_space_content(space_plan_shares.guest_space_id)
          or private.get_my_web_role() in ('admin', 'janitor')
        )
    )
  );

drop policy if exists space_plan_shares_insert on public.space_plan_shares;
create policy space_plan_shares_insert on public.space_plan_shares
  for insert with check (
    exists (
      select 1 from public.space_plans p
      where p.id = plan_id and private.can_write_space_content(p.space_id)
    )
  );

drop policy if exists space_plan_shares_update on public.space_plan_shares;
create policy space_plan_shares_update on public.space_plan_shares
  for update
  using (
    exists (
      select 1 from public.space_plans p
      where p.id = space_plan_shares.plan_id
        and (
          private.can_write_space_content(p.space_id)
          or private.can_write_space_content(space_plan_shares.guest_space_id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.space_plans p
      where p.id = space_plan_shares.plan_id
        and (
          private.can_write_space_content(p.space_id)
          or private.can_write_space_content(space_plan_shares.guest_space_id)
        )
    )
  );

drop policy if exists space_plan_shares_delete on public.space_plan_shares;
create policy space_plan_shares_delete on public.space_plan_shares
  for delete using (
    exists (
      select 1 from public.space_plans p
      where p.id = space_plan_shares.plan_id and private.can_write_space_content(p.space_id)
    )
  );

revoke all on table public.space_plan_shares from anon;

-- Co-host editors see the whole shared Plan (ADR-1387).
drop policy if exists space_plans_space_read on public.space_plans;
create policy space_plans_space_read on public.space_plans
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
    or exists (
      select 1 from public.space_plan_shares s
      where s.plan_id = space_plans.id
        and s.status = 'accepted'
        and private.can_write_space_content(s.guest_space_id)
    )
  );

drop policy if exists space_plans_space_update on public.space_plans;
create policy space_plans_space_update on public.space_plans
  for update
  using (
    private.can_write_space_content(space_id)
    or exists (
      select 1 from public.space_plan_shares s
      where s.plan_id = space_plans.id
        and s.status = 'accepted'
        and private.can_write_space_content(s.guest_space_id)
    )
  )
  with check (
    private.can_write_space_content(space_id)
    or exists (
      select 1 from public.space_plan_shares s
      where s.plan_id = space_plans.id
        and s.status = 'accepted'
        and private.can_write_space_content(s.guest_space_id)
    )
  );

-- ── Playbooks (CAL5) ─────────────────────────────────────────────────────────────────────
create table if not exists public.space_plan_playbooks (
  id              uuid primary key default gen_random_uuid(),
  space_id        uuid not null references public.spaces(id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 200),
  event_type      text not null default 'workshop' check (char_length(event_type) between 1 and 80),
  task_titles     text[] not null default '{}',
  notes           text,
  event_defaults  jsonb not null default '{}'::jsonb,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.space_plan_playbooks is
  'A Plan template per event type (retreat, sound bath, workshop). Starting a Plan from a playbook copies it.';

create index if not exists space_plan_playbooks_space_idx
  on public.space_plan_playbooks (space_id);

drop trigger if exists space_plan_playbooks_set_updated_at on public.space_plan_playbooks;
create trigger space_plan_playbooks_set_updated_at
  before update on public.space_plan_playbooks
  for each row execute function public.set_updated_at();

alter table public.space_plan_playbooks enable row level security;

drop policy if exists space_plan_playbooks_read on public.space_plan_playbooks;
create policy space_plan_playbooks_read on public.space_plan_playbooks
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_plan_playbooks_insert on public.space_plan_playbooks;
create policy space_plan_playbooks_insert on public.space_plan_playbooks
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_plan_playbooks_update on public.space_plan_playbooks;
create policy space_plan_playbooks_update on public.space_plan_playbooks
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_plan_playbooks_delete on public.space_plan_playbooks;
create policy space_plan_playbooks_delete on public.space_plan_playbooks
  for delete using (private.can_write_space_content(space_id));

revoke all on table public.space_plan_playbooks from anon;

alter table public.space_plans
  drop constraint if exists space_plans_playbook_id_fkey;
alter table public.space_plans
  add constraint space_plans_playbook_id_fkey
  foreign key (playbook_id) references public.space_plan_playbooks(id) on delete set null;

-- ── Pointers from dates, events, and to-dos ───────────────────────────────────────────────
alter table public.space_calendar_entries
  add column if not exists plan_id uuid references public.space_plans(id) on delete set null;

alter table public.space_calendar_entries
  add column if not exists exception_dates date[] not null default '{}';

comment on column public.space_calendar_entries.plan_id is
  'The Plan this date belongs to (ADR-1386). Null for Unavailable and Private entries that are not part of a Plan.';
comment on column public.space_calendar_entries.exception_dates is
  'Explicit skipped dates for a repeating Pencil (ADR-1386 P5). Stored, never inferred.';

create index if not exists space_calendar_entries_plan_idx
  on public.space_calendar_entries (plan_id) where plan_id is not null;

alter table public.events
  add column if not exists plan_id uuid references public.space_plans(id) on delete set null;

comment on column public.events.plan_id is
  'The Plan this Production was made from (ADR-1386). Null when the event was created without a Plan.';

create index if not exists events_plan_idx
  on public.events (plan_id) where plan_id is not null;

alter table public.crm_tasks
  add column if not exists plan_id uuid references public.space_plans(id) on delete cascade;

alter table public.crm_tasks
  add column if not exists due_offset_days integer;

comment on column public.crm_tasks.plan_id is
  'When set, this follow-up belongs to a Space Plan (one team inbox, ADR-1386 ruling 3).';
comment on column public.crm_tasks.due_offset_days is
  'Relative due date: days before (negative) or after (positive) the Production date. Null = a fixed due_at.';

create index if not exists crm_tasks_plan_idx
  on public.crm_tasks (plan_id) where plan_id is not null;

-- ── Private team feed tokens (CAL7). Never slug-keyed. ───────────────────────────────────
create table if not exists public.space_calendar_private_feeds (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces(id) on delete cascade,
  token        text not null unique check (char_length(token) = 32),
  created_by   uuid references public.profiles(id) on delete set null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.space_calendar_private_feeds is
  'Revocable token for a Space team private calendar feed (entries, Pencils, Plan to-do dates). Never slug-keyed.';

create index if not exists space_calendar_private_feeds_space_idx
  on public.space_calendar_private_feeds (space_id) where revoked_at is null;

alter table public.space_calendar_private_feeds enable row level security;

drop policy if exists space_calendar_private_feeds_read on public.space_calendar_private_feeds;
create policy space_calendar_private_feeds_read on public.space_calendar_private_feeds
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_calendar_private_feeds_insert on public.space_calendar_private_feeds;
create policy space_calendar_private_feeds_insert on public.space_calendar_private_feeds
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_calendar_private_feeds_update on public.space_calendar_private_feeds;
create policy space_calendar_private_feeds_update on public.space_calendar_private_feeds
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_calendar_private_feeds_delete on public.space_calendar_private_feeds;
create policy space_calendar_private_feeds_delete on public.space_calendar_private_feeds
  for delete using (private.can_write_space_content(space_id));

revoke all on table public.space_calendar_private_feeds from anon;
