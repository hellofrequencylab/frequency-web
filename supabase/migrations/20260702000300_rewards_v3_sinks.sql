-- Rewards Economy v3 — Gem sinks (ADR-305, docs/REWARDS-ECONOMY.md)
--
-- Two sinks so the continuous Gem faucet has somewhere to go:
--   1. Gift Gems to another member  -> gem_gifts ledger (giver's spendable balance
--      = lifetime_gems - SUM(store_redemptions) - SUM(gem_gifts as giver); the
--      recipient is credited via a 'gift_received' gem_transactions row).
--   2. Buy a streak freeze           -> a purchasable store item; redeemItem
--      special-cases the slug to grant a daily-streak freeze token.

begin;

-- Gift ledger.
create table if not exists public.gem_gifts (
  id           uuid primary key default gen_random_uuid(),
  giver_id     uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  amount       integer not null check (amount > 0),
  created_at   timestamptz not null default now()
);
create index if not exists idx_gem_gifts_giver     on public.gem_gifts(giver_id);
create index if not exists idx_gem_gifts_recipient on public.gem_gifts(recipient_id);

alter table public.gem_gifts enable row level security;
-- Read your own gifts (given or received); host+ reads all. Writes are service-role only.
drop policy if exists "gem_gifts: read own or host reads all" on public.gem_gifts;
create policy "gem_gifts: read own or host reads all" on public.gem_gifts
  for select using (
    giver_id = get_my_profile_id()
    or recipient_id = get_my_profile_id()
    or get_my_role() >= 'host'::community_role
  );

-- Recipient credit action (variable amount via awardGems overrideAmount; the row just
-- needs to be active). No daily cap.
insert into gem_config (action_type, gems_amount, daily_cap, description, is_active)
values ('gift_received', 0, null, 'Received a Gem gift from another member', true)
on conflict (action_type) do update set is_active = true, description = excluded.description;

-- Buy-a-freeze store item (redeemItem special-cases this slug to grant a freeze token).
insert into store_items (slug, name, description, category, gem_cost, icon, is_active, sort_order)
values ('streak-freeze', 'Streak Freeze', 'Saves your streak for one missed day.', 'feature', 50, 'snowflake', true, 50)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description, category = excluded.category,
      gem_cost = excluded.gem_cost, is_active = true;

commit;
