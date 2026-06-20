-- 0012_minigames — server-authoritative mini-game framework + Crowd Trivia (§16).
--
-- Isolation (docs/ISOLATION.md): every table lives in `resonance`; FKs only ever
-- point WITHIN this schema. All user references are plain uuid (external/own auth
-- id) with NO cross-schema FK (ADR-002). RLS on, no policies: the data layer is
-- server-only and reaches these through the service role (matches 0003).
--
-- The answer key never lives here. The server holds the question bank in code
-- (lib/games/trivia.ts) and only ever stores which question is open, never the
-- correct option, so a leaked row still can't reveal an answer.

-- One live game per venue (unique venue_id). current_question_id is the question
-- the host has opened; status walks idle -> open -> revealed -> idle.
create table if not exists resonance.game_sessions (
  id                  uuid primary key default gen_random_uuid(),
  venue_id            uuid not null references resonance.venues(id) on delete cascade,
  game_key            text not null default 'trivia',
  current_question_id text,
  status              text not null default 'idle'
                        check (status in ('idle', 'open', 'revealed')),
  round_no            integer not null default 0,
  started_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique (venue_id)
);

-- Running score per player per venue. The per-round dedupe (so a player can't
-- score a round twice) rides on last_round, updated whenever points are added.
create table if not exists resonance.game_scores (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null,
  user_id    uuid not null,
  points     integer not null default 0,
  last_round integer not null default 0,
  updated_at timestamptz default now(),
  unique (venue_id, user_id)
);

alter table resonance.game_sessions enable row level security;
alter table resonance.game_scores   enable row level security;
