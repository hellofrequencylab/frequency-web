-- =====================================================================
-- Practice templates: claimable starter content + topical imagery (ADR-116)
-- =====================================================================
-- The library practices become explicit TEMPLATES a member can "claim": a
-- Vera-guided wizard forks a private, owned copy and personalizes it (title /
-- cadence / steps) to that member, who then logs it for zaps + a streak. This
-- mirrors the demo-circle claim (ADR-091) applied to practices — the same
-- "make it yours" loop that gamifies healthy living.
--
-- Pure data + one additive flag:
--   1. `is_template` flag (default false).
--   2. Two new starter practices (Hydrate first, Single-task hour), fully
--      authored, each on its Pillar + sub-category.
--   3. Mark every system-owned, non-demo, public practice as a template.
--   4. Give every practice a TOPICAL header image (keyword-based, stable per
--      title), replacing the generic picsum placeholders. These are topical
--      PLACEHOLDERS pending curated/licensed art; the detail page renders them
--      with a plain <img>, so no next/image remote host is required.
--
-- The claim reward (`practice_claim` zaps, first claim only) needs no config
-- row — it falls back through ZAP_AMOUNTS in lib/zaps.ts (ADR-104 economy).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, INSERT…SELECT guarded by NOT EXISTS,
-- UPDATE-by-title (all titles unique). Safe to re-run.
-- =====================================================================

BEGIN;

-- 1. The flag --------------------------------------------------------------
ALTER TABLE practices ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS practices_template_idx ON practices (is_template) WHERE is_template;

-- 2. Two new starter practices (full content, on Pillar + sub-category) -----
INSERT INTO practices
  (title, description, is_public, created_by, is_template, category, icon, cadence,
   reward_zaps, reward_note, summary, body, domain_id, subcategory_id, header_image)
SELECT
  v.title, v.description, true, NULL, true, v.category, v.icon, v.cadence,
  v.reward_zaps, '+' || v.reward_zaps || ' zaps · streak +1', v.summary, v.body,
  (SELECT id FROM domains WHERE slug = v.pillar),
  (SELECT id FROM practice_subcategories WHERE slug = v.sub),
  'https://loremflickr.com/1200/500/' || v.keyword || '?lock=' || (abs(hashtext(v.title)) % 1000)
FROM (VALUES
 ('Hydrate first',
  'A full glass of water first thing, before coffee or your phone.',
  'holistic-health', 'droplet', 'Daily', 10, 'body', 'body-nutrition', 'water,glass',
  'Start the day with a glass of water — the easiest healthy win there is.',
  E'You wake up mildly dehydrated after a night with no water. Fix that before anything else touches your attention.\n\n**How to do it**\n- Fill a glass the night before and leave it where you cannot miss it.\n- Drink it all before your coffee, before your phone.\n- Log it the moment the glass is empty.\n\n**Why it works**\nIt is the lowest-friction healthy habit on earth — no skill, no time, no equipment. Win the first five minutes of the day and the rest follows more easily.'),
 ('Single-task hour',
  'One hour doing exactly one thing — notifications off.',
  'business-support', 'brain', 'Daily', 20, 'mind', 'mind-focus', 'desk,focus',
  'One hour, one task, nothing else. Protect it and watch what gets done.',
  E'Multitasking is a tax you pay all day in tiny switching costs. For one hour, refuse to pay it.\n\n**How to do it**\n- Choose the single thing that matters most this hour.\n- Phone in another room, one tab, one document — no switching.\n- Log it when the hour is up.\n\n**Why it works**\nThe brain is poor at parallel work and superb at sustained attention. One honest hour of single-tasking routinely out-produces a whole fragmented morning.')
) AS v(title, description, category, icon, cadence, reward_zaps, pillar, sub, keyword, summary, body)
WHERE NOT EXISTS (SELECT 1 FROM practices p WHERE p.title = v.title);

-- 3. Mark the real library (system-owned, non-demo, public) as templates -----
UPDATE practices SET is_template = true
WHERE created_by IS NULL AND COALESCE(is_demo, false) = false AND is_public = true AND is_template = false;

-- 4. Topical header images for every practice (stable per title) -------------
UPDATE practices p SET header_image =
  'https://loremflickr.com/1200/500/' || k.keyword || '?lock=' || (abs(hashtext(p.title)) % 1000)
FROM (VALUES
  -- core + expansion (templates)
  ('Daily meditation','meditation'), ('Morning movement','stretching,morning'),
  ('Breathwork','breathing,calm'), ('Gratitude journaling','journal,writing'),
  ('Cold exposure','cold,ice'), ('Deep work block','desk,focus'),
  ('Read ten pages','book,reading'), ('Digital sunset','sunset,calm'),
  ('Plan tomorrow tonight','notebook,planning'), ('Make music','guitar,music'),
  ('One photo a day','camera,photography'), ('Voice journal','microphone'),
  ('Dance one song','dance'), ('Appreciate someone','friends,smile'),
  ('Phone-free meal','dinner,table'), ('Call a loved one','phone,call'),
  ('Listen fully','conversation,coffee'), ('Daily walk','walking,path'),
  ('Strength session','gym,weights'), ('Time in nature','forest,nature'),
  ('Evening reflection','candle,evening'), ('Hydrate first','water,glass'),
  ('Single-task hour','desk,focus'),
  -- demo seed (not templates, but still want appropriate imagery)
  ('Dawn patrol surf','surf,ocean'), ('Daily run','running'),
  ('Mobility flow','yoga,stretch'), ('Cold plunge','ice,plunge'),
  ('Breathwork reset','breathing'), ('Sound bath sit','meditation,sound'),
  ('Morning sit','meditation,sunrise'), ('Gratitude journal','journal'),
  ('Daily sketch','sketch,drawing'), ('250 words','writing,typewriter'),
  ('Reach out to one person','message,phone')
) AS k(title, keyword)
WHERE p.title = k.title;

COMMIT;
