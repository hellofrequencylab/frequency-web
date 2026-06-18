-- Rewards Economy v3 — earn-rate config (ADR-305, docs/REWARDS-ECONOMY.md)
--
-- gem_config / zap_config are the tunable registry the payout classifier reads.
-- This migration bumps the v3 Gem daily caps, adds the online "share" action,
-- and registers the creation-reward + Certificate payout keys used by
-- lib/rewards/creation.ts and lib/quest/complete.ts. Values match the ADR.

begin;

-- Bumped Gem daily caps (v3): more headroom for everyday online care.
update gem_config set daily_cap = 8 where action_type = 'reaction';      -- 1 gem,  was 5/day
update gem_config set daily_cap = 8 where action_type = 'comment_reply'; -- 2 gems, was 5/day
update gem_config set daily_cap = 5 where action_type = 'post_create';   -- 3 gems, was 3/day
update gem_config set daily_cap = 3 where action_type = 'welcome_member';-- 8 gems, was uncapped
-- daily_login (2 / 1-per-day), event_rsvp (5), circle_join (5) unchanged.

-- "Share" is a distinct online action (2 gems, 5/day).
insert into gem_config (action_type, gems_amount, daily_cap, description, is_active)
values ('share', 2, 5, 'Shared a post or content (online care)', true)
on conflict (action_type) do update
  set gems_amount = excluded.gems_amount, daily_cap = excluded.daily_cap, is_active = true;

-- Creation reward Gem keys: the small first-publish token (soft 3/day enforced in
-- app via reward_grants count) + the validated-creation bonus + the Certificate.
insert into gem_config (action_type, gems_amount, daily_cap, description, is_active) values
  ('create_journey_token',   5,    3, 'Published a Journey (creation token)',                true),
  ('create_event_token',     5,    3, 'Published an event (creation token)',                 true),
  ('create_practice_token',  3,    3, 'Published a practice (creation token)',               true),
  ('create_journey_bonus',  25, null, 'Your Journey was first adopted (validated creation)', true),
  ('create_event_bonus',    10, null, 'Your event got its first RSVP (validated creation)',  true),
  ('create_practice_bonus', 10, null, 'Your practice was first logged (validated creation)', true),
  ('certificate_bonus',    100, null, 'Earned the season Certificate',                       true)
on conflict (action_type) do update
  set gems_amount = excluded.gems_amount, daily_cap = excluded.daily_cap,
      description = excluded.description, is_active = true;

-- Validated-creation Zap payouts (paid to the creator on first genuine use).
insert into zap_config (action_type, zaps_amount, daily_cap, is_active, description) values
  ('create_journey',  100, null, true, 'Your Journey was first adopted (validated creation)'),
  ('create_event',     50, null, true, 'Your event got its first RSVP (validated creation)'),
  ('create_practice',  40, null, true, 'Your practice was first logged (validated creation)')
on conflict (action_type) do update
  set zaps_amount = excluded.zaps_amount, is_active = true, description = excluded.description;

commit;
