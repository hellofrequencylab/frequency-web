-- =====================================================================
-- Blocking: a member can block another so they cannot DM each other and
-- blocked users are hidden from each other's surfaces. Required for a public
-- beta and for App Store review (per-user block). Supersedes the ADR-015
-- "no blocking in v1" stance (ADR-036). Directional rows (blocker -> blocked);
-- enforcement checks both directions via is_blocked_between().
-- =====================================================================

create table if not exists blocked_users (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocked_users_not_self check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);

create index if not exists blocked_users_blocker_idx on blocked_users (blocker_id);
create index if not exists blocked_users_blocked_idx on blocked_users (blocked_id);

-- Either-direction block check, used by server actions to gate interaction.
create or replace function is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from blocked_users
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

alter table blocked_users enable row level security;

-- A member can read the blocks they created (to manage them). Writes go through
-- the service-role admin client behind app-code authz (self only).
create policy "blocked_users: read own" on blocked_users for select using (
  blocker_id in (select id from profiles where auth_user_id = auth.uid())
);
