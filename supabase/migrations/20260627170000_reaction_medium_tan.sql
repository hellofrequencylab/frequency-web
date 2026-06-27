-- =============================================================================
-- Skin-toned reaction emojis now carry the MEDIUM tan modifier (🏽, U+1F3FD):
--   🙌  -> 🙌🏽   (celebrate)
--   🙏  -> 🙏🏽   (grateful)
-- The other four (❤️ 🔥 😂 😮) have no skin tone and are unchanged.
--
-- Mirrors REACTIONS in lib/feed/reactions.ts. Swaps the CHECK constraint for the
-- new vocabulary and remaps existing rows so no historical reaction is orphaned.
-- The UNIQUE (post_id, profile_id, reaction_type) constraint is unchanged; the
-- pre-remap dedupe guards the (unlikely) case where a member already holds the
-- toned variant.
-- =============================================================================

ALTER TABLE post_reactions
  DROP CONSTRAINT IF EXISTS post_reactions_reaction_type_check;

DELETE FROM post_reactions a
USING post_reactions b
WHERE a.post_id = b.post_id
  AND a.profile_id = b.profile_id
  AND a.reaction_type = '🙌'
  AND b.reaction_type = '🙌🏽';

DELETE FROM post_reactions a
USING post_reactions b
WHERE a.post_id = b.post_id
  AND a.profile_id = b.profile_id
  AND a.reaction_type = '🙏'
  AND b.reaction_type = '🙏🏽';

UPDATE post_reactions SET reaction_type = '🙌🏽' WHERE reaction_type = '🙌';
UPDATE post_reactions SET reaction_type = '🙏🏽' WHERE reaction_type = '🙏';

ALTER TABLE post_reactions
  ADD CONSTRAINT post_reactions_reaction_type_check
  CHECK (reaction_type IN ('❤️', '🔥', '🙌🏽', '😂', '😮', '🙏🏽'));
