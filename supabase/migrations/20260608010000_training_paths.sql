-- Role-advancement training records (ADR-157, build §7.2). One row per (member,
-- role) tracking the training Journey assigned on promotion: assigned → started →
-- completed. The durable advancement transcript + the gate + the analytics surface.
-- Writes go through the service role (lib/onboarding/training.ts); RLS is read-only
-- (own rows, or host+ for the future management suite).

create table if not exists training_paths (
  id           uuid           primary key default gen_random_uuid(),
  profile_id   uuid           not null references profiles (id) on delete cascade,
  role         community_role not null,
  status       text           not null default 'assigned' check (status in ('assigned', 'started', 'completed')),
  assigned_at  timestamptz    not null default now(),
  started_at   timestamptz,
  completed_at timestamptz,
  unique (profile_id, role)
);

create index if not exists idx_training_paths_profile on training_paths (profile_id);

alter table training_paths enable row level security;

drop policy if exists training_paths_select on training_paths;
create policy training_paths_select on training_paths for select using (
  profile_id in (select id from profiles where auth_user_id = auth.uid())
  or get_my_role() >= 'host'
);
