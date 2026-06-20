-- 0009_presence_pings — live headcount per venue (build plan §11).
--
-- A lightweight heartbeat: clients in a room upsert a ping every ~20s. The lobby
-- counts pings seen in the last ~45s as "here now", so rooms visibly have gravity.
--
-- Isolation (docs/ISOLATION.md): lives in `resonance`; the FK points WITHIN this
-- schema; user_id is a plain uuid (external/own auth id) with NO cross-schema FK
-- (ADR-002). Server writes via service role; no policies (matching 0003).
create table if not exists resonance.presence_pings (
  venue_id   uuid not null references resonance.venues(id) on delete cascade,
  user_id    uuid not null,                  -- external id; no cross-schema FK
  last_seen  timestamptz not null default now(),
  primary key (venue_id, user_id)
);

create index if not exists presence_pings_by_recency
  on resonance.presence_pings (venue_id, last_seen);

alter table resonance.presence_pings enable row level security;
