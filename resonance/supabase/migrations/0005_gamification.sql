-- 0005_gamification — Zaps ledger, reputation, and seasons (spec §9).
--
-- Isolation: all in `resonance`; user/world ids are plain uuid, no cross-schema FK.
-- Anti-accumulation by design: reputation is keyed by season, so the seasonal
-- reset starts everyone fresh.

-- 13-week seasons drive resets/decay (solstice/equinox cadence in production).
create table if not exists resonance.seasons (
  id         uuid primary key default gen_random_uuid(),
  world_id   uuid not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  theme      text,
  created_at timestamptz not null default now()
);

create index if not exists seasons_window
  on resonance.seasons (world_id, starts_at, ends_at);

-- Append-only currency ledger. Balance = sum(delta). The unique key makes awards
-- idempotent: a given (reason, ref) awards a user at most once (e.g. one award
-- per track-play), so a retried/double `advance` never double-pays.
create table if not exists resonance.zaps_ledger (
  id         uuid primary key default gen_random_uuid(),
  world_id   uuid not null,
  user_id    uuid not null,
  delta      integer not null,
  reason     text not null
               check (reason in ('vote_received', 'attendance', 'purchase', 'reward')),
  ref_id     uuid,
  created_at timestamptz not null default now(),
  unique (world_id, user_id, reason, ref_id)
);

create index if not exists zaps_by_user on resonance.zaps_ledger (world_id, user_id);

-- Public, witnessed DJ reputation, per season. Feeds The Field rank.
create table if not exists resonance.reputation (
  world_id   uuid not null,
  user_id    uuid not null,
  season_id  uuid not null references resonance.seasons(id) on delete cascade,
  dj_points  integer not null default 0,
  rank       text not null default 'Crew',
  updated_at timestamptz not null default now(),
  primary key (world_id, user_id, season_id)
);

drop trigger if exists set_updated_at on resonance.reputation;
create trigger set_updated_at before update on resonance.reputation
  for each row execute function resonance.set_updated_at();

alter table resonance.seasons     enable row level security;
alter table resonance.zaps_ledger enable row level security;
alter table resonance.reputation  enable row level security;
