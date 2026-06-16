-- Side Quests (ADR-300 Part 3): reward-only, badge-granting missions that do NOT count toward the
-- four Pillars. Built on the existing achievements / user_achievements engine — a Side Quest is an
-- achievement flagged is_side_quest, with MANUAL criteria (so the passive auto-evaluator in
-- lib/achievements.ts skips it) and the 'special' category. Members claim them on the
-- /crew/side-quests board; claiming unlocks the badge (a user_achievements row, which is the
-- idempotency lock) and pays the Zaps reward once. No Pillar Signature credit.

alter table public.achievements
  add column if not exists is_side_quest boolean not null default false;

create index if not exists idx_achievements_side_quest
  on public.achievements (is_side_quest) where is_side_quest;

-- Starter Side Quests (operators can add more once the authoring UI lands). Manual criteria keeps
-- them off the auto-evaluator; they only unlock via the claim path.
insert into public.achievements (slug, name, description, icon, category, tier, criteria, zaps_reward, is_side_quest, sort_order)
values
  ('side-quest-break-the-ice', 'Break the ice', 'Introduce yourself to someone new in a Circle this week.', 'handshake', 'special', 'bronze', '{"type":"manual"}', 20, true, 10),
  ('side-quest-bring-a-friend', 'Bring a friend', 'Invite someone from outside Frequency along to a gathering.', 'user-plus', 'special', 'silver', '{"type":"manual"}', 40, true, 20),
  ('side-quest-touch-grass', 'Touch grass', 'Take one practice outside and do it in the open air.', 'trees', 'special', 'bronze', '{"type":"manual"}', 20, true, 30)
on conflict (slug) do nothing;
