-- 0004_profiles — per-world member identity (spec §7.2 profiles).
--
-- Isolation (docs/ISOLATION.md): user_id is the Supabase Auth user id stored as a
-- plain uuid with NO foreign key to auth.users (ADR-002) — even though we use
-- Supabase Auth, the schema stays liftable. A user has one profile per world.

create table if not exists resonance.profiles (
  world_id      uuid not null,
  user_id       uuid not null,              -- auth user id; no cross-schema FK
  display_name  text not null,
  avatar_config jsonb not null default '{}'::jsonb,
  bio           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (world_id, user_id)
);

drop trigger if exists set_updated_at on resonance.profiles;
create trigger set_updated_at before update on resonance.profiles
  for each row execute function resonance.set_updated_at();

alter table resonance.profiles enable row level security;
