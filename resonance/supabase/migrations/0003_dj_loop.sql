-- 0003_dj_loop — venues, seats, per-DJ queues, and votes (spec §5.1).
--
-- Isolation (docs/ISOLATION.md): every table lives in `resonance`; FKs only ever
-- point WITHIN this schema. All user references are plain uuid (external/own auth
-- id) with NO cross-schema FK (ADR-002).

-- A venue is a room. (Full multi-tenant `worlds` table comes later; world_id is
-- carried now as a plain uuid so nothing needs reshaping.)
create table if not exists resonance.venues (
  id          uuid primary key default gen_random_uuid(),
  world_id    uuid not null,
  name        text not null,
  media_type  text not null default 'dj'
                check (media_type in ('dj', 'watch', 'lounge', 'event')),
  seat_count  int  not null default 5 check (seat_count between 1 and 10),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_updated_at before update on resonance.venues
  for each row execute function resonance.set_updated_at();

-- DJ seats on the stage. One row per occupied seat index.
create table if not exists resonance.venue_seats (
  id               uuid primary key default gen_random_uuid(),
  venue_id         uuid not null references resonance.venues(id) on delete cascade,
  seat_index       int  not null,
  occupant_user_id uuid not null,            -- external id; no cross-schema FK
  joined_at        timestamptz not null default now(),
  unique (venue_id, seat_index),
  unique (venue_id, occupant_user_id)        -- a user holds at most one seat
);

-- Each DJ's personal queue within a venue.
create table if not exists resonance.queue_items (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references resonance.venues(id) on delete cascade,
  user_id        uuid not null,              -- the DJ who queued it
  media_id       text not null,
  media_provider text not null default 'youtube'
                   check (media_provider in ('youtube')),
  title          text,
  thumbnail      text,
  position       int  not null,              -- order within the DJ's queue
  status         text not null default 'queued'
                   check (status in ('queued', 'played', 'skipped')),
  created_at     timestamptz not null default now()
);

create index if not exists queue_items_dj_order
  on resonance.queue_items (venue_id, user_id, position)
  where status = 'queued';

-- Votes on the current track-play. play_id ties a vote to one specific play so a
-- user can vote once per play (not once per track, not once per session).
create table if not exists resonance.votes (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references resonance.venues(id) on delete cascade,
  play_id    uuid not null,
  user_id    uuid not null,                  -- the voter
  value      text not null check (value in ('awesome', 'lame')),
  created_at timestamptz not null default now(),
  unique (play_id, user_id)                  -- one weighted vote per user per play
);

create index if not exists votes_by_play on resonance.votes (play_id);

-- The current play needs a stable id so votes attach to it and rotation can tell
-- one play from the next.
alter table resonance.room_state
  add column if not exists current_play_id uuid;

alter table resonance.venues       enable row level security;
alter table resonance.venue_seats  enable row level security;
alter table resonance.queue_items  enable row level security;
alter table resonance.votes        enable row level security;
