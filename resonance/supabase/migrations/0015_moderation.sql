-- 0015_moderation — reports and blocks (cross-cutting moderation & safety).
--
-- Isolation (docs/ISOLATION.md): every table lives in `resonance`; FKs only ever
-- point WITHIN this schema. All user references are plain uuid (external/own auth
-- id) with NO cross-schema FK (ADR-002).

-- A report flags a user, a venue, or both for moderator review. world_id scopes
-- it to a tenant (carried as a plain uuid until the worlds table lands).
create table if not exists resonance.reports (
  id               uuid primary key default gen_random_uuid(),
  world_id         uuid not null,
  reporter_user_id uuid not null,             -- external id; no cross-schema FK
  subject_user_id  uuid,                       -- the reported user, if any
  venue_id         uuid references resonance.venues(id) on delete set null,
  reason           text not null,
  detail           text,
  status           text not null default 'open'
                     check (status in ('open', 'reviewed', 'dismissed')),
  created_at       timestamptz not null default now()
);

create index if not exists reports_by_world_status
  on resonance.reports (world_id, status);

-- A block hides one user from another. Personal and directional: (blocker,
-- blocked) is the natural key, so a user blocks a given person at most once.
create table if not exists resonance.blocks (
  blocker_user_id uuid not null,              -- external id; no cross-schema FK
  blocked_user_id uuid not null,              -- external id; no cross-schema FK
  world_id        uuid not null,
  created_at      timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id)
);

alter table resonance.reports enable row level security;
alter table resonance.blocks  enable row level security;
