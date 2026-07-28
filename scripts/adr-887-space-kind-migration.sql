-- ADR-887 · MOVE THE SPACE KIND ONTO ITS OWN KEY: profileData.category -> profileData.kind
--
-- APPLIED to production 2026-07-28. VERIFY BEFORE matched expectations exactly: nine legacy rows
-- (alvara, audrey-dewitt, danieltyack, house-of-fates, justice-massage, mikhael, nutrithryv,
-- rageher, templeofaset), zero rows already carrying kind. VERIFY AFTER: zero category keys
-- remain, nine kind keys, distribution identical to the before-state (business 3, practitioner 3,
-- coach 2, venue 1) - values copied verbatim, nothing relabeled. Kept in the repo because every
-- statement is idempotent and the file is the record of what was run.
--
-- The ADR-887 split gave Spaces two axes: SUBJECT (what it is about, the shared vocabulary at
-- preferences.profileData.subject) and KIND (what shape of thing it is, the old six-key "category"
-- vocabulary at preferences.profileData.kind). The KEYS themselves are unchanged (business /
-- practitioner / coach / studio / maker / venue); only the jsonb key they live under moves.
--
-- ORDER-INDEPENDENT: readProfileData (lib/spaces/profile-data.ts) already reads `kind` and FALLS
-- BACK to the legacy `category` key, and any settings save rewrites the blob onto `kind` — so
-- nothing breaks before, without, or during this script. Running it just retires the legacy key
-- from the ~9 rows that carry one.
--
-- GUARDED: touches ONLY rows whose profileData is a real jsonb object that HAS `category` and does
-- NOT already have `kind` (a row saved through the new form since the ship has `kind` already and
-- keeps it — the operator's newer pick is never clobbered by the old value). The VALUE is copied
-- verbatim, on-list or off (the ADR-879 rule: an off-list value is preserved, never rewritten).
-- IDEMPOTENT: after the first run no row matches the WHERE, so a second run updates nothing.
-- The custom pill-name override stays at its historical `categoryLabel` key on purpose (pure label
-- override; no reader keys on the name) — this script does not touch it.

-- ── VERIFY BEFORE ─────────────────────────────────────────────────────────────
-- Expect: ~9 rows with a legacy category and no kind; note their values.
select id,
       slug,
       preferences->'profileData'->>'category' as legacy_category,
       preferences->'profileData'->>'kind'     as kind
  from public.spaces
 where jsonb_typeof(preferences->'profileData') = 'object'
   and (preferences->'profileData' ? 'category' or preferences->'profileData' ? 'kind')
 order by slug;

-- ── THE MOVE ──────────────────────────────────────────────────────────────────
update public.spaces
   set preferences = jsonb_set(
         preferences #- '{profileData,category}',      -- drop the legacy key ...
         '{profileData,kind}',
         preferences->'profileData'->'category'        -- ... and land its old value on `kind`, verbatim
       )
 where jsonb_typeof(preferences->'profileData') = 'object'
   and preferences->'profileData' ? 'category'
   and not (preferences->'profileData' ? 'kind');

-- ── VERIFY AFTER ──────────────────────────────────────────────────────────────
-- Expect: zero rows still carrying `category`; every value from BEFORE now sits under `kind`.
select count(*) as legacy_category_rows_remaining
  from public.spaces
 where jsonb_typeof(preferences->'profileData') = 'object'
   and preferences->'profileData' ? 'category';

select preferences->'profileData'->>'kind' as kind, count(*)
  from public.spaces
 where jsonb_typeof(preferences->'profileData') = 'object'
   and preferences->'profileData' ? 'kind'
 group by 1
 order by 1;
