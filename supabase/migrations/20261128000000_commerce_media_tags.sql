-- Etsy-Grade Market, Phase 1 (listing editor + gallery + taxonomy/tags): discovery TAGS on a
-- commerce listing, plus a note on where listing photos live.
--
-- MEDIA (no schema change): listing photos REUSE the existing PUBLIC `event-media` bucket and its
-- storage RLS (public read; writes gated to split_part(name,'/',1) = auth.uid()), the same
-- owner-scoped prefix the events uploader uses (20260613100000_event_posts_media_cohosts.sql). Both
-- commerce authoring paths upload as an authenticated user under their OWN uid prefix -- an individual
-- maker (owner_kind='profile') and a Space manager (a real member editing owner_kind='space') -- so no
-- new bucket or policy is needed. Photo storage PATHS are stored in commerce_products.images and
-- resolved to public URLs at read (lib/commerce/products.ts rowToProduct), so display consumers
-- (product cards, the detail gallery) keep rendering plain URLs unchanged.
--
-- TAGS: buyer-facing discovery tags (Etsy-style), additive to the controlled `category` taxonomy
-- (lib/commerce/categories.ts). A text[] with a GIN index so a future "has tag" contains-filter stays
-- indexed at catalog scale. Additive + idempotent + visibility-only (no payment coupling), so it is
-- SAFE TO APPLY NOW.

alter table public.commerce_products
  add column if not exists tags text[] not null default '{}';

create index if not exists commerce_products_tags_gin
  on public.commerce_products using gin (tags);
