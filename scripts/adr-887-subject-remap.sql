-- ADR-887 · REMAP TWO CHANNEL CATEGORY ROWS ONTO THE SHARED SUBJECT VOCABULARY
--
-- The subject taxonomy (lib/taxonomy/subjects.ts) keeps five of the seven original Channel keys
-- verbatim, so their rows never move. Exactly two live rows sit on values the vocabulary retired
-- or refined:
--
--   1. The "Human Relating" Channel: `human-relating` -> `friendship`. The label nobody says out
--      loud retired in favour of "Friendship / Relationships" (CONTENT-VOICE §3c.1).
--   2. The "Mental / Emotional Health" Channel: `holistic-health` -> `mental-health`. It was filed
--      under Holistic Health only because no closer door existed; ADR-887 added one. The Holistic
--      Health Channel itself KEEPS `holistic-health`, which stays in the vocabulary (owner
--      directive 2026-07-28: plain wellness names are welcome as doors).
--
-- GUARDED BY SLUG + CURRENT VALUE, not by value alone: `holistic-health` is carried by two rows
-- and only one of them moves. Idempotent — a second run matches nothing. No other row is touched;
-- off-list values in the wild stay exactly as they are (the ADR-879 rule).

-- ── VERIFY BEFORE ──────────────────────────────────────────────────────────────
select slug, name, category from public.topical_channels order by category, slug;

-- ── THE REMAP ─────────────────────────────────────────────────────────────────
update public.topical_channels
   set category = 'friendship'
 where category = 'human-relating';

update public.topical_channels
   set category = 'mental-health'
 where slug = 'mental-emotional-health'
   and category = 'holistic-health';

-- ── VERIFY AFTER ──────────────────────────────────────────────────────────────
-- Expect: zero rows off-vocabulary, exactly one holistic-health, one mental-health, one friendship.
select category, count(*) from public.topical_channels group by 1 order by 1;
