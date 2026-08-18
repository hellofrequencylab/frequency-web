-- APPLIED to production 2026-08-18 via MCP apply_migration; ledger repaired to this version the
-- same day (name pages_retire_orphan_block_types). The in-file post-assert ran inside the apply
-- transaction and raised nothing; re-measured after: zero retired types in either pages column, and
-- the three drafts now carry only registry types (CallToAction, Gallery, Hero, Image, MediaText,
-- Statement). scripts/stored-block-types.json re-captured in the same change. Authored as
-- docs/proposals/LIVE-028-retire-orphan-block-types.sql (backlog LIVE-028, ADR-1055, ADR-977 D-9).
-- The outer begin/commit from the proposal is removed: the apply path is already transactional.
--
-- RETIRE THE FIVE ORPHAN BLOCK TYPES IN pages.data (ADR-1055, backlog LIVE-028, ADR-977 D-9).
--
-- ⚠️ NOT APPLIED. Authored for the owner to apply. Applying is TWO steps — see
-- supabase/migrations/README.md (ADR-963): apply it, then repair the ledger so the row carries
-- THIS version (20270305000000) and not the timestamp `apply_migration` mints. Until it is
-- applied, `pnpm check:migrations` rule 4 will report this file as `unpairedRepo`
-- ("authored but never applied"), which is the correct reading of the tree.
--
-- ── WHAT IS BROKEN ───────────────────────────────────────────────────────────────────────────
--
-- Five block types live in `pages.data` and resolve to NOTHING in the block registry
-- (`config.components`, lib/page-editor/config.tsx — 88 rows). Verified against production on
-- 2026-08-17; every count below is measured, not estimated:
--
--   slug           status   orphan blocks in `data`
--   about          draft    PageHero ×1, ImageBand ×1, ZigZag ×3, BetaCTA ×1   (6 of 8 blocks)
--   how-it-works   draft    PageHero ×1, ZigZag ×3, BetaCTA ×1                 (5 of 7 blocks)
--   the-lab        draft    PageHero ×1, ImageBand ×1, ZigZag ×2,
--                           FeatureGallery ×1, BetaCTA ×1                      (6 of 8 blocks)
--
-- `home` and `the-community` are clean in BOTH columns, and `published_data` carries no orphan
-- anywhere — asserted at the foot of this file rather than assumed. No Space `pageDocs` document
-- carries one either (18 documents, 12 distinct types, all resolving).
--
-- ADR-978 already stopped this from DESTROYING the drafts: the loader keeps any well-formed
-- document and the renderer skips a block it cannot resolve. So nothing is lost today — the
-- blocks simply render as nothing, and 6 of `about`'s 8 sections are invisible. This migration
-- is the other half: it gives the authored copy a block that can actually paint it.
--
-- ── WHY THESE TARGETS, AND THE CORRECTION THAT MATTERS ───────────────────────────────────────
--
-- ADR-977 D-9 measured `ZigZag` against the registry's `Zigzag` and ADR-978 correctly refused
-- that alias: their props only partly overlap (`titleAccent` vs `accentWord`, `side` vs
-- `mediaSide`, and `kicker`/`tone`/`imgAspect` have no home in `Zigzag`), so aliasing would drop
-- three fields and mis-map two.
--
-- 🔴 BOTH ADRs COMPARED AGAINST THE WRONG BLOCK. `Zigzag` is not `ZigZag`'s successor. The
-- successor is `MediaText`, and the code says so in its own header:
--
--     components/page-editor/blocks/media.tsx:60
--       "1. MediaText — alternating image + text row (standardizes the old ZigZag)"
--
-- `MediaText` is an exact, name-for-name, option-for-option SUPERSET of every prop these stored
-- ZigZag blocks carry. The same file names two more successors outright (media.tsx:114 and :215),
-- and sections.tsx:259 names the fourth. So four of the five mappings are recorded in the tree;
-- only `PageHero -> Hero (variant 'minimal')` is inferred, and it is inferred from `Hero`'s own
-- field list being a superset of PageHero's four props with a text-only variant.
--
--   orphan          -> target          evidence                          stored props covered
--   PageHero        -> Hero            Hero fields ⊇ PageHero props      4/4 (variant 'minimal')
--   ImageBand       -> Image           media.tsx:114 "standardizes"      3/3 (mode 'single')
--   ZigZag          -> MediaText       media.tsx:60  "standardizes"      12/12
--   FeatureGallery  -> Gallery         media.tsx:215 "standardizes"      3/3 (+ item shape)
--   BetaCTA         -> CallToAction    sections.tsx:259 "matches BetaCTA" 3/3 (tone 'ink')
--
-- MIGRATION, NOT DELETION, for all five. Every stored prop key is a legal field key on its
-- target and every stored option value is a legal option on its target, so the rewrite is
-- lossless: `target_defaults || stored_props` keeps every authored byte (including `props.id`)
-- and fills only the keys the newer block added. Nothing is dropped, so there is no QUARANTINE
-- entry to declare.
--
-- ── THE TWO JUDGEMENT CALLS, NAMED ───────────────────────────────────────────────────────────
--
-- 1. `Hero.variant = 'minimal'`. The stored PageHero blocks carry no image, and Hero's `image`
--    variant would substitute a stock photo (`image || '/images/site/lab-thermal.jpg'`) — i.e.
--    invent art nobody authored. `minimal` renders eyebrow + title + subtitle and nothing else,
--    which is exactly what PageHero was.
--
-- 2. The `BetaCTA -> CallToAction` button. The old block rendered its own hardcoded beta CTA and
--    stored no cta props, so a straight prop copy would produce a call to action with no button.
--    The values below are a SNAPSHOT of `BETA_CTA_LABEL` / `BETA_CTA_HREF` (lib/site.ts) taken
--    2026-08-17, matching what lib/page-editor/templates/about.ts and the-lab.ts pass. A stored
--    document cannot reference a constant, so if that constant is ever re-pointed these three
--    drafts keep the old value — the same property every other stored document already has.
--
-- ── SAFETY ───────────────────────────────────────────────────────────────────────────────────
--
-- IDEMPOTENT: the CASE matches only the five retired type names, which no longer exist after the
-- first run, and the UPDATE is guarded on `is distinct from`. Re-runnable.
-- NON-DESTRUCTIVE: `||` puts the stored props on the RIGHT, so a stored value always wins over a
-- default. Top-level keys other than `type`/`props` (e.g. `readOnly`) survive via `block || …`.
-- SCOPED: `data` only. `published_data` is asserted clean instead of rewritten, so if that ever
-- stops being true this migration ABORTS rather than half-fixing the site.
--
-- ROLLBACK: the rewrite is reversible because `props.id` still carries the original type name as
-- its prefix (`PageHero-27`, `ZigZag-29`, `FeatureGallery-16`, …) — the editor's makeItem stamps
-- `<Type>-<n>` and this migration preserves `props.id` untouched. To reverse:
--
--   begin;
--   with src as (
--     select p.id, e.ord, e.block
--     from public.pages p,
--          lateral (select ordinality as ord, value as block
--                   from jsonb_array_elements(p.data->'content') with ordinality) e
--     where jsonb_typeof(p.data->'content') = 'array'
--   ), mapped as (
--     select id, ord,
--       case split_part(coalesce(block->'props'->>'id', ''), '-', 1)
--         when 'PageHero'       then block || jsonb_build_object('type','PageHero',
--                'props', (block->'props') - 'variant' - 'image' - 'focal' - 'minHeight' - 'facts'
--                  - 'ctaPrimaryLabel' - 'ctaPrimaryHref' - 'ctaSecondaryLabel' - 'ctaSecondaryHref'
--                  - 'note' - 'tone' - 'width' - 'align' - 'layout')
--         when 'ImageBand'      then block || jsonb_build_object('type','ImageBand',
--                'props', (block->'props') - 'mode' - 'images' - 'columns' - 'focal' - 'size'
--                  - 'radius' - 'shadow' - 'caption' - 'tone' - 'align' - 'layout')
--         when 'ZigZag'         then block || jsonb_build_object('type','ZigZag',
--                'props', (block->'props') - 'focal' - 'width' - 'align' - 'layout')
--         when 'FeatureGallery' then block || jsonb_build_object('type','FeatureGallery',
--                'props', (block->'props') - 'columns' - 'tileAspect' - 'emphasis' - 'cardStyle'
--                  - 'density' - 'tone' - 'width' - 'align' - 'layout')
--         when 'BetaCTA'        then block || jsonb_build_object('type','BetaCTA',
--                'props', (block->'props') - 'eyebrow' - 'ctaPrimaryLabel' - 'ctaPrimaryHref'
--                  - 'ctaSecondaryLabel' - 'ctaSecondaryHref' - 'emphasis' - 'tone' - 'width'
--                  - 'align' - 'layout')
--         else block
--       end as block
--     from src
--   ), rebuilt as (
--     select id, jsonb_agg(block order by ord) as content from mapped group by id
--   )
--   update public.pages p set data = jsonb_set(p.data, '{content}', r.content)
--   from rebuilt r where p.id = r.id and p.data->'content' is distinct from r.content;
--   commit;
--
-- The reversal is exact for the 17 blocks this migration touches. It is NOT type-safe for a block
-- an operator adds later whose id happens to start with one of these five words, which is why it
-- lives here as a runbook rather than as a second migration.


-- Assert the corpus is the one this migration was written against. A rewrite that silently
-- matches nothing is indistinguishable from a rewrite that worked, which is the failure this
-- repo names in four ADRs — so refuse to run against a `pages` table that is not there at all.
do $$
declare
  n_pages int;
begin
  if to_regclass('public.pages') is null then
    raise exception 'public.pages does not exist — wrong database, aborting';
  end if;
  select count(*) into n_pages from public.pages;
  if n_pages < 1 then
    raise exception 'public.pages is empty — nothing to migrate, aborting rather than reporting success';
  end if;
end $$;

with src as (
  select p.id, e.ord, e.block
  from public.pages p,
       lateral (
         select ordinality as ord, value as block
         from jsonb_array_elements(p.data->'content') with ordinality
       ) e
  where jsonb_typeof(p.data->'content') = 'array'
),
mapped as (
  select
    id,
    ord,
    case block->>'type'

      -- PageHero -> Hero, text-only variant. Hero's field list is a superset of PageHero's
      -- four props; `minimal` is the variant that paints no image.
      when 'PageHero' then block || jsonb_build_object(
        'type', 'Hero',
        'props', jsonb_build_object(
          'variant', 'minimal',
          'eyebrow', '',
          'title', '',
          'titleAccent', '',
          'subtitle', '',
          'image', '',
          'focal', 'center',
          'minHeight', 'auto',
          'facts', '[]'::jsonb,
          'ctaPrimaryLabel', '',
          'ctaPrimaryHref', '',
          'ctaSecondaryLabel', '',
          'ctaSecondaryHref', '',
          'note', '',
          'tone', 'surface',
          'width', 'default',
          'align', 'left',
          'layout', jsonb_build_object('spaceTop','default','spaceBottom','default','visibility','all')
        ) || coalesce(block->'props', '{}'::jsonb)
      )

      -- ImageBand -> Image, single mode. media.tsx:114: "A single image renders as the
      -- full-width band (standardizes the old ImageBand)". `size: full` + no radius/shadow is
      -- the band treatment; `tone: none` paints no band background behind it.
      when 'ImageBand' then block || jsonb_build_object(
        'type', 'Image',
        'props', jsonb_build_object(
          'mode', 'single',
          'image', '',
          'images', '[]'::jsonb,
          'alt', '',
          'columns', '3',
          'aspect', '21/9',
          'focal', 'center',
          'size', 'full',
          'radius', 'none',
          'shadow', 'none',
          'caption', '',
          'tone', 'none',
          'align', 'center',
          'layout', jsonb_build_object('spaceTop','default','spaceBottom','default','visibility','all')
        ) || coalesce(block->'props', '{}'::jsonb)
      )

      -- ZigZag -> MediaText. media.tsx:60: "standardizes the old ZigZag". All 12 stored props
      -- map by name; `side` and `imgAspect` and `tone` values are all legal options on the
      -- target. NOT `Zigzag` — see the header and ADR-978.
      when 'ZigZag' then block || jsonb_build_object(
        'type', 'MediaText',
        'props', jsonb_build_object(
          'image', '',
          'alt', '',
          'eyebrow', '',
          'title', '',
          'titleAccent', '',
          'kicker', '',
          'body', '',
          'side', 'left',
          'imgAspect', 'landscape',
          'focal', 'center',
          'ctaLabel', '',
          'ctaHref', '',
          'tone', 'surface',
          'width', 'default',
          'align', 'left',
          'layout', jsonb_build_object('spaceTop','default','spaceBottom','default','visibility','all')
        ) || coalesce(block->'props', '{}'::jsonb)
      )

      -- FeatureGallery -> Gallery. media.tsx:215: "GalleryMediaBlock — image grid (standardizes
      -- the old FeatureGallery)". The stored item shape {image,title,body} is Gallery's
      -- arrayFields exactly, so `items` copies across untouched.
      when 'FeatureGallery' then block || jsonb_build_object(
        'type', 'Gallery',
        'props', jsonb_build_object(
          'eyebrow', '',
          'heading', '',
          'items', '[]'::jsonb,
          'columns', '2',
          'tileAspect', '16/10',
          'emphasis', jsonb_build_object('scale','default','accent','none'),
          'cardStyle', jsonb_build_object('style','border','radius','md'),
          'density', jsonb_build_object('spacing','cozy'),
          'tone', 'surface',
          'width', 'default',
          'align', 'left',
          'layout', jsonb_build_object('spaceTop','default','spaceBottom','default','visibility','all')
        ) || coalesce(block->'props', '{}'::jsonb)
      )

      -- BetaCTA -> CallToAction, ink tone. sections.tsx:259: "Dark ink variant: full-bleed with
      -- light-strip seams + amber glow (matches BetaCTA)". The cta pair is the snapshot of
      -- BETA_CTA_LABEL / BETA_CTA_HREF explained in the header.
      when 'BetaCTA' then block || jsonb_build_object(
        'type', 'CallToAction',
        'props', jsonb_build_object(
          'eyebrow', '',
          'heading', '',
          'headingAccent', '',
          'body', '',
          'ctaPrimaryLabel', 'Start a Circle',
          'ctaPrimaryHref', '/onboarding/beta',
          'ctaSecondaryLabel', '',
          'ctaSecondaryHref', '',
          'emphasis', jsonb_build_object('scale','default','accent','none'),
          'tone', 'ink',
          'width', 'default',
          'align', 'center',
          'layout', jsonb_build_object('spaceTop','default','spaceBottom','default','visibility','all')
        ) || coalesce(block->'props', '{}'::jsonb)
      )

      else block
    end as block
  from src
),
rebuilt as (
  select id, jsonb_agg(block order by ord) as content
  from mapped
  group by id
)
update public.pages p
set data = jsonb_set(p.data, '{content}', r.content)
from rebuilt r
where p.id = r.id
  and p.data->'content' is distinct from r.content;

-- The verdict, asserted rather than assumed. Both columns, both directions: no retired type may
-- survive anywhere in `pages`, and `published_data` must have been clean all along (this
-- migration deliberately does not rewrite it — if it is dirty, that is a different fact than the
-- one measured on 2026-08-17 and it needs a human, not a silent second rewrite).
do $$
declare
  bad text;
begin
  select string_agg(distinct which || ':' || t, ', ' order by which || ':' || t) into bad
  from (
    select 'data' as which, e->>'type' as t
    from public.pages p, lateral jsonb_array_elements(p.data->'content') e
    where jsonb_typeof(p.data->'content') = 'array'
    union all
    select 'published_data', e->>'type'
    from public.pages p, lateral jsonb_array_elements(p.published_data->'content') e
    where jsonb_typeof(p.published_data->'content') = 'array'
  ) s
  where t in ('PageHero', 'ImageBand', 'ZigZag', 'FeatureGallery', 'BetaCTA');

  if bad is not null then
    raise exception 'retired block types still present after the rewrite: %', bad;
  end if;
end $$;

