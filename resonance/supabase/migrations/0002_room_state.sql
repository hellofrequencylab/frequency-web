-- 0002_room_state — the server-authoritative playback state, one row per venue.
--
-- This is the heart of the sync engine (spec §6.5). The server owns this row;
-- clients read it and compute their own position. No feature tables (venues,
-- seats) yet — sync is proven in isolation first, keyed by a bare venue_id.
--
-- Isolation check (docs/ISOLATION.md): lives entirely in `resonance`;
-- current_dj_user_id is a plain uuid with NO foreign key (ADR-002).

create table if not exists resonance.room_state (
  venue_id             uuid primary key,
  media_provider       text not null default 'youtube'
                         check (media_provider in ('youtube')),
  current_media_id     text,
  -- Server timestamp when the current media started playing. Null when idle.
  playback_started_at  timestamptz,
  -- Offset into the media at playback_started_at, in seconds.
  start_offset_seconds numeric not null default 0 check (start_offset_seconds >= 0),
  is_playing           boolean not null default false,
  -- External user id of the DJ holding the floor. No cross-schema FK (ADR-002).
  current_dj_user_id   uuid,
  updated_at           timestamptz not null default now()
);

drop trigger if exists set_updated_at on resonance.room_state;
create trigger set_updated_at
  before update on resonance.room_state
  for each row execute function resonance.set_updated_at();

-- Deny by default: access is server-side via the service role (which bypasses
-- RLS). RLS is enabled with no policies so nothing else can read/write.
alter table resonance.room_state enable row level security;
