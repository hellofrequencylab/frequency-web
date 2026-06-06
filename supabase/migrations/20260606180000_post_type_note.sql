-- Capture: the 'note' post kind (build item §6, ADR-156). A Note is a lightweight
-- text journal entry — the same posts substrate, a quieter variant, so it inherits
-- the feed, ranking, reactions and moderation for free (no parallel store). Mirrors
-- the existing post_type variants ('feed' / 'announcement' / 'blog' / 'recap').
-- ADD VALUE runs standalone (matches 20240108/20240306) — re-runnable via IF NOT EXISTS.
ALTER TYPE post_type ADD VALUE IF NOT EXISTS 'note';
