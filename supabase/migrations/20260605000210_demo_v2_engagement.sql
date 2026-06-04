-- =====================================================================
-- Demo v2 — engagement layer (set-generated, deterministic)
-- =====================================================================
-- This is what turns a populated community into a vibrant one: hearts on the
-- feed, attendance on events, full trophy cases, and streaks. No prose here —
-- these are row-only signals derived from the already-seeded cast (profiles,
-- posts, events, memberships, achievements), so they are generated in pure SQL.
--
-- Deterministic spread via hashtext(post||profile) so the same members react to
-- the same posts every run; ON CONFLICT on the natural keys makes it idempotent.
-- Everything keys off is_demo rows, so a purge (DELETE … WHERE is_demo) cascades
-- it all away.
-- =====================================================================

BEGIN;

-- 1. Post reactions — circle co-members react to demo posts (~38% heart, ~12%
--    plus_one), never your own post. hashtext gives a stable pseudo-random pick.
INSERT INTO post_reactions (post_id, profile_id, reaction_type)
SELECT po.id, m.profile_id, 'heart'
FROM posts po
JOIN memberships m ON m.circle_id = po.scope_id AND m.profile_id <> po.author_id
WHERE po.is_demo
  AND (abs(hashtext(po.id::text || ':h:' || m.profile_id::text)) % 100) < 38
ON CONFLICT (post_id, profile_id, reaction_type) DO NOTHING;

INSERT INTO post_reactions (post_id, profile_id, reaction_type)
SELECT po.id, m.profile_id, 'plus_one'
FROM posts po
JOIN memberships m ON m.circle_id = po.scope_id AND m.profile_id <> po.author_id
WHERE po.is_demo
  AND (abs(hashtext(po.id::text || ':p:' || m.profile_id::text)) % 100) < 12
ON CONFLICT (post_id, profile_id, reaction_type) DO NOTHING;

-- 2. Sync the denormalised counters the feed reads.
UPDATE posts p SET
  reaction_count = (SELECT count(*) FROM post_reactions r WHERE r.post_id = p.id),
  comment_count  = (SELECT count(*) FROM posts c WHERE c.parent_id = p.id),
  reply_count    = (SELECT count(*) FROM posts c WHERE c.parent_id = p.id)
WHERE p.is_demo;

-- 3. Event RSVPs — ~70% of a circle RSVP; a small slice as not_going. Past
--    events thus read as well-attended, upcoming ones as anticipated.
INSERT INTO event_rsvps (event_id, profile_id, status)
SELECT e.id, m.profile_id,
       CASE WHEN (abs(hashtext(e.id::text || ':s:' || m.profile_id::text)) % 100) < 8
            THEN 'not_going' ELSE 'going' END
FROM events e
JOIN memberships m ON m.circle_id = e.scope_id
WHERE e.is_demo
  AND (abs(hashtext('rsvp:' || e.id::text || m.profile_id::text)) % 100) < 70
ON CONFLICT (event_id, profile_id) DO NOTHING;

-- 4. Trophy cases — each member unlocks their first `achievement_count`
--    achievements (lowest sort_order first), so the count on the profile and the
--    badges on the page agree. Capped by however many achievements exist.
INSERT INTO user_achievements (profile_id, achievement_id, unlocked_at)
SELECT p.id, a.id, now() - ((abs(hashtext(p.id::text || a.id::text)) % 180) || ' days')::interval
FROM profiles p
CROSS JOIN LATERAL (
  SELECT id FROM achievements ORDER BY sort_order, id LIMIT p.achievement_count
) a
WHERE p.is_demo AND p.achievement_count > 0
ON CONFLICT (profile_id, achievement_id) DO NOTHING;

-- 5. Attendance streaks mirror the profile's streak fields (so the streak shown
--    on the profile is backed by a real streaks row).
INSERT INTO streaks (profile_id, streak_type, current_count, longest_count, last_activity_at)
SELECT id, 'attendance'::streak_type, current_streak, longest_streak,
       now() - ((abs(hashtext(id::text)) % 4) || ' days')::interval
FROM profiles
WHERE is_demo AND (current_streak > 0 OR longest_streak > 0)
ON CONFLICT (profile_id, streak_type) DO NOTHING;

COMMIT;
