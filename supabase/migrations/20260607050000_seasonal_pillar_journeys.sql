-- =============================================================================
-- Seasonal Pillar Journeys — content gap fill (ADR-139 / ECONOMY-AND-JOURNEYS §5)
--
-- The economy spec says each season should ship one primary Journey per Pillar
-- (Mind · Body · Spirit · Expression). Only three generic Season-1 quest chains
-- existed. This seeds the four pillar tracks for the ACTIVE season, each a short
-- arc that deliberately MIXES an on-platform step (pays gems) with a real-world
-- step (pays zaps) — so a member working a Journey racks up BOTH currencies and
-- the new categorization is visible in the Vault points log.
--
-- Engine note: quest steps can only key off criteria the rules engine evaluates
-- (post_create · post_replies · event_attend · event_host · task_complete ·
-- referral). Rewards are paid by lib/achievements.ts in the currency that fits
-- each step's nature. Idempotent: ON CONFLICT (slug) / (chain_id, step_order).
-- =============================================================================

insert into quest_chains (slug, name, description, icon, season, zaps_reward, sort_order)
select v.slug, v.name, v.description, v.icon,
       coalesce((select season_number from seasons where status = 'active' limit 1), 1),
       v.zaps_reward, v.sort_order
from (values
  ('mind-open-circle',        'Mind · Open Circle',      'Curiosity and relating: introduce yourself, sit in a circle, and bring someone with you.', 'brain',     120, 110),
  ('body-show-up-strong',     'Body · Show Up Strong',   'Movement and health: get into the room, share the win, and keep showing up.',              'activity',  120, 120),
  ('spirit-steady-practice',  'Spirit · Steady Practice','Stillness and meaning: reflect, gather, and let the rhythm build.',                          'sparkles',  140, 130),
  ('expression-make-and-share','Expression · Make & Share','Creativity and craft: make something, share it, then help hold a gathering.',               'palette',   140, 140)
) as v(slug, name, description, icon, zaps_reward, sort_order)
on conflict (slug) do nothing;

-- Mind · Open Circle — post (gems) → attend (zaps) → refer (zaps)
insert into quest_steps (chain_id, step_order, name, description, criteria, target, zaps_reward)
select qc.id, s.step_order, s.name, s.description, s.criteria::jsonb, s.target, s.zaps_reward
from quest_chains qc cross join (values
  (1, 'Say hello',        'Share an introduction post',           '{"type":"post_create"}', 1, 6),
  (2, 'Sit in a circle',  'Show up to a gathering (check in)',     '{"type":"event_attend"}', 1, 25),
  (3, 'Bring someone',    'Invite a person who joins',             '{"type":"referral"}',     1, 40)
) as s(step_order, name, description, criteria, target, zaps_reward)
where qc.slug = 'mind-open-circle'
on conflict (chain_id, step_order) do nothing;

-- Body · Show Up Strong — attend (zaps) → post (gems) → attend x3 (zaps)
insert into quest_steps (chain_id, step_order, name, description, criteria, target, zaps_reward)
select qc.id, s.step_order, s.name, s.description, s.criteria::jsonb, s.target, s.zaps_reward
from quest_chains qc cross join (values
  (1, 'Get in the room',  'Attend a gathering (check in)',         '{"type":"event_attend"}', 1, 25),
  (2, 'Share the win',    'Post about your practice',              '{"type":"post_create"}',  1, 6),
  (3, 'Keep showing up',  'Attend three gatherings this season',   '{"type":"event_attend"}', 3, 30)
) as s(step_order, name, description, criteria, target, zaps_reward)
where qc.slug = 'body-show-up-strong'
on conflict (chain_id, step_order) do nothing;

-- Spirit · Steady Practice — post (gems) → attend (zaps) → attend x5 (zaps)
insert into quest_steps (chain_id, step_order, name, description, criteria, target, zaps_reward)
select qc.id, s.step_order, s.name, s.description, s.criteria::jsonb, s.target, s.zaps_reward
from quest_chains qc cross join (values
  (1, 'Reflect',          'Share a reflection post',               '{"type":"post_create"}',  1, 6),
  (2, 'Gather',           'Attend a sit or gathering (check in)',  '{"type":"event_attend"}', 1, 25),
  (3, 'Build the rhythm', 'Attend five gatherings this season',    '{"type":"event_attend"}', 5, 40)
) as s(step_order, name, description, criteria, target, zaps_reward)
where qc.slug = 'spirit-steady-practice'
on conflict (chain_id, step_order) do nothing;

-- Expression · Make & Share — post (gems) → post x3 (gems) → host (zaps)
insert into quest_steps (chain_id, step_order, name, description, criteria, target, zaps_reward)
select qc.id, s.step_order, s.name, s.description, s.criteria::jsonb, s.target, s.zaps_reward
from quest_chains qc cross join (values
  (1, 'Make something',   'Post something you made',               '{"type":"post_create"}',  1, 6),
  (2, 'Keep creating',    'Share three posts this season',         '{"type":"post_create"}',  3, 10),
  (3, 'Hold the space',   'Host or help run a gathering',          '{"type":"event_host"}',   1, 60)
) as s(step_order, name, description, criteria, target, zaps_reward)
where qc.slug = 'expression-make-and-share'
on conflict (chain_id, step_order) do nothing;
