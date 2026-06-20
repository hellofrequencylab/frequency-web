-- 0014_worlds — the multi-tenant `worlds` table and cross-world discovery
-- (build plan §18). Retires the DEMO_WORLD_ID placeholder by giving world_id a
-- real home, ADDITIVELY: existing rows already carry the demo world's uuid, so
-- nothing reshapes. Discovery reads across ALL worlds; per-world surfaces stay
-- scoped as before.
--
-- Isolation (docs/ISOLATION.md): lives entirely in `resonance`. Server writes
-- via the service role; RLS enabled with no policies (matching 0003).

create table if not exists resonance.worlds (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

alter table resonance.worlds enable row level security;

-- Seed the demo world with the explicit id that existing rows already carry
-- (DEMO_WORLD_ID), plus a second world so discovery is genuinely cross-world.
insert into resonance.worlds (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000aa', 'Resonance', 'resonance'),
  ('00000000-0000-0000-0000-0000000000bb', 'Afterhours', 'afterhours')
on conflict do nothing;

-- Seed a little content in the second world so the feed isn't empty there:
-- one venue and one upcoming event.
insert into resonance.venues (world_id, name, media_type, seat_count) values
  ('00000000-0000-0000-0000-0000000000bb', 'Neon Alley', 'dj', 5)
on conflict do nothing;

insert into resonance.events (world_id, host_user_id, title, starts_at, ticket_type) values
  (
    '00000000-0000-0000-0000-0000000000bb',
    '00000000-0000-0000-0000-000000000001',
    'Midnight Set',
    now() + interval '2 hours',
    'free'
  )
on conflict do nothing;
