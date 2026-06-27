-- =============================================================================
-- Broaden post_reactions.reaction_type from the legacy ('heart','plus_one') pair
-- to the curated emoji set (lib/feed/reactions.ts).
--
-- The column stays `text`; we swap the CHECK constraint for one that allows the
-- six emoji keys, and migrate the existing rows onto the new vocabulary so no
-- historical reaction is orphaned:
--   heart    -> ❤️   (the love reaction)
--   plus_one -> 🙌   (the endorse / celebrate reaction)
--
-- The UNIQUE (post_id, profile_id, reaction_type) constraint is unchanged, so a
-- member still holds at most one row per emoji per post — the anti-farm cap the
-- gem award keys off (see app/(main)/feed/actions.ts toggleReaction) is intact.
--
-- Allowed set MUST stay in lockstep with REACTION_KEYS in lib/feed/reactions.ts.
-- =============================================================================

ALTER TABLE post_reactions
  DROP CONSTRAINT IF EXISTS post_reactions_reaction_type_check;

-- Re-key historical rows. ON CONFLICT DO NOTHING-style safety: a member who had
-- both 'heart' and (hypothetically) an existing '❤️' would collide on the unique
-- key — drop the duplicate legacy rows first, then remap the survivors.
DELETE FROM post_reactions a
USING post_reactions b
WHERE a.post_id = b.post_id
  AND a.profile_id = b.profile_id
  AND a.reaction_type = 'heart'
  AND b.reaction_type = '❤️';

DELETE FROM post_reactions a
USING post_reactions b
WHERE a.post_id = b.post_id
  AND a.profile_id = b.profile_id
  AND a.reaction_type = 'plus_one'
  AND b.reaction_type = '🙌';

UPDATE post_reactions SET reaction_type = '❤️' WHERE reaction_type = 'heart';
UPDATE post_reactions SET reaction_type = '🙌' WHERE reaction_type = 'plus_one';

ALTER TABLE post_reactions
  ADD CONSTRAINT post_reactions_reaction_type_check
  CHECK (reaction_type IN ('❤️', '🔥', '🙌', '😂', '😮', '🙏'));
