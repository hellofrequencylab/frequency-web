-- 0011_marketplace — cosmetics catalog and per-user inventory (spec §14).
--
-- Isolation (docs/ISOLATION.md): everything lives in `resonance`; FKs only ever
-- point WITHIN this schema. User/world ids are plain uuid with NO cross-schema FK.
--
-- Economy: cosmetics are bought with Zaps (the in-app currency). A purchase spends
-- Zaps by appending a negative `purchase` row to resonance.zaps_ledger (0005), so
-- balance = sum(delta) stays the single source of truth. Premium items carry a
-- price_cents for a future Stripe path (scaffolded only).

-- The catalog. A zaps item has price_zaps > 0; a premium item has price_cents set
-- (Stripe-only) and typically price_zaps 0.
create table if not exists resonance.market_items (
  id          uuid primary key default gen_random_uuid(),
  world_id    uuid not null,
  name        text not null,
  kind        text not null
                check (kind in ('avatar_frame', 'color', 'badge', 'decor')),
  price_zaps  integer not null default 0,
  price_cents integer,                      -- nullable; premium/Stripe-only items
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists market_items_by_world
  on resonance.market_items (world_id, active);

-- What a user owns. One row per (user, item); acquiring is idempotent via the
-- unique key (a re-grant upserts, not duplicates).
create table if not exists resonance.user_inventory (
  id          uuid primary key default gen_random_uuid(),
  world_id    uuid not null,
  user_id     uuid not null,                -- external id; no cross-schema FK
  item_id     uuid not null references resonance.market_items(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  unique (user_id, item_id)
);

create index if not exists user_inventory_by_user
  on resonance.user_inventory (world_id, user_id);

-- Service-role only, matching 0003: RLS on with no policies (the data layer is
-- server-only by design; RLS is the backstop).
alter table resonance.market_items   enable row level security;
alter table resonance.user_inventory enable row level security;

-- Seed the demo catalog: a mix of zaps-priced cosmetics plus one premium item.
insert into resonance.market_items (world_id, name, kind, price_zaps, price_cents)
values
  ('00000000-0000-0000-0000-0000000000aa', 'Neon Halo',      'avatar_frame', 15,  null),
  ('00000000-0000-0000-0000-0000000000aa', 'Gold Trim',      'avatar_frame', 40,  null),
  ('00000000-0000-0000-0000-0000000000aa', 'Synthwave',      'color',        10,  null),
  ('00000000-0000-0000-0000-0000000000aa', 'First Spin',     'badge',         5,  null),
  ('00000000-0000-0000-0000-0000000000aa', 'Lava Lamp',      'decor',        25,  null),
  ('00000000-0000-0000-0000-0000000000aa', 'Aurora Frame',   'avatar_frame',  0,  499);
