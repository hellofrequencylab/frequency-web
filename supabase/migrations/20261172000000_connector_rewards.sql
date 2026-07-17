-- Connector rewards seed (ADR-154 / ADR-777) — the economy rows the event-invite capture
-- loop's gamification reads. Pairs with lib/rewards/connector.ts (the grant engine) and the
-- achievements-engine 'connections' criteria (lib/achievements.ts: getUserStats.connectionCount
-- + the isRelevantEvent / threshold 'connections' cases).
--
-- Two things are seeded:
--   1. The Connector ACHIEVEMENT tiers — 10 / 25 / 100 real connections. A "real connection" is a
--      captured event guest who at least RSVP'd going/maybe (achievements.ts counts event_guests
--      rows with rsvp_status in ('going','maybe') for the inviter). Criteria type 'connections',
--      count = the threshold. Distinct slugs from the LEGACY 'connector' referral badge (unchanged).
--   2. The join GEM key — 'connector_join' (5 💎), paid to the inviter when a captured guest actually
--      signs up (lib/rewards/connector.ts rewardConnectorJoinOnSignup → awardGems). Without this row
--      the gem leg is a safe no-op (the zaps leg still pays), so this migration LIGHTS UP the bonus.
--
-- Additive + idempotent (ON CONFLICT guards). Depends on 20261170000000_event_guests.sql for the
-- event_guests table the connection count reads. Safe to re-run.

begin;

-- 1. Connector achievement tiers. category 'social', ascending cosmetic tiers. The per-tier
--    zaps_reward is the one-time milestone bonus (the per-outcome ⚡ live in the grant engine).
insert into public.achievements (slug, name, description, icon, category, tier, criteria, zaps_reward, sort_order)
values
  ('connector-10',  'Connector',      'Made 10 real connections from people you invited to an event.',  'link', 'social', 'silver',   '{"type":"connections","count":10}',   25,  60),
  ('connector-25',  'Super Connector','Made 25 real connections from people you invited.',              'link', 'social', 'gold',     '{"type":"connections","count":25}',   75,  61),
  ('connector-100', 'Master Connector','Made 100 real connections from people you invited.',            'link', 'social', 'platinum', '{"type":"connections","count":100}',  250, 62)
on conflict (slug) do nothing;

-- 2. The join-outcome Gem key. daily_cap NULL: the grant engine already bounds connector payouts
--    per inviter per day (CONNECTOR_DAILY_CAP), and each (outcome, inviter, guest) is idempotent via
--    reward_grants, so no extra per-action cap is needed here.
insert into public.gem_config (action_type, gems_amount, daily_cap, description, is_active)
values ('connector_join', 5, null, 'A guest you invited joined Frequency', true)
on conflict (action_type) do update
  set gems_amount = excluded.gems_amount, description = excluded.description, is_active = true;

commit;
