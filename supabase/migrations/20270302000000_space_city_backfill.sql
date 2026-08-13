-- SPACE CITY BACKFILL — the locality half of the LocalBusiness node.
--
-- WHY THIS MATTERS, and the narrower claim than the one first made. An audit on 2026-08-13
-- reported `spaces.city` NULL on all 20 rows as "nothing local can key on it". That overstated it.
-- The public place surfaces do NOT read this column: /discover/places buckets `getPublicCircles`
-- plus upcoming events by THEIR own `city`, /discover/cities runs off the density read-model, and
-- lib/spaces/discovery.ts never reads `.city` at all. Filling this column changes none of them.
--
-- What it actually feeds is one thing, and it is worth having: `localBusinessSchema` /`spaceSchema`
-- in lib/jsonld.ts accept `address.addressLocality`, and that node is described in its own header as
-- "the local-SEO/AIO lever for '<category> near me' answers". The call site in
-- app/(main)/spaces/[slug]/(profile)/layout.tsx passes only `streetAddress`, so the locality slot has
-- always been emitted empty. This migration supplies the data; the call site passes it (same change).
--
-- SOURCE: the owner, space by space, 2026-08-13. Not inferred, except where noted below, and every
-- inferred value was confirmed by them before it was written here.
--
-- THREE ROWS ARE DELIBERATELY LEFT NULL, because `addressLocality` means a locality and these are not:
--   • justice-massage      — "Mobile North County and San Diego" is a SERVICE AREA. schema.org has
--                            `areaServed` for exactly this, and putting a service area in
--                            addressLocality would emit an address that does not exist. Left null
--                            until areaServed is wired; see the follow-up note in the PR.
--   • victoria-angel-heart — "Virtual". A business with no premises should carry no PostalAddress
--                            locality at all; inventing one would place them in a town they are not in.
--   • frequency            — the platform root Space, not a place. Its events span Encinitas and Vista.
--
-- ONE VALUE TO KNOW ABOUT: `nutrithryv` is "Cardiff", i.e. Cardiff-by-the-Sea, which is a community
-- INSIDE Encinitas rather than an incorporated city. Stored as given, because that is how the business
-- describes itself and how people search for it. Consequence: it will not cluster with the Encinitas
-- rows. Harmless for page generation — the /discover/cities density gate keeps a thin city out of the
-- sitemap on its own — but worth knowing before someone reads the grouped counts and is surprised.
--
-- IDEMPOTENT and NON-DESTRUCTIVE: keyed on slug, and each update is guarded on `city IS NULL`, so a
-- re-run cannot overwrite a value an operator has since set by hand. Re-runnable as many times as needed.
--
-- ⚠️ THE TIMESTAMP IS LOAD-BEARING, and it is why this file is 20270302 and not 20270301.
-- `spaces.city` is created by 20270301000000_space_location.sql. This backfill was first written at
-- that SAME timestamp, and on a fresh database it failed with `column s.city does not exist`: when two
-- migrations tie on the timestamp the CLI falls back to the whole filename, and `..._space_city_backfill`
-- sorts before `..._space_location` because 'c' < 'l'. The tie is invisible in production, where the
-- column already exists, and only ever fails on a rebuild-from-zero — which is exactly what db-tests
-- does, and exactly why that job is worth having. Any future migration touching a column that another
-- migration adds must sort strictly after it; do not reuse a timestamp already on disk.

begin;

update public.spaces as s set city = v.city
from (values
  ('alvara',                    'Encinitas'),
  ('audrey-dewitt',             'Vista'),
  ('being-wholistic-collective','Vista'),
  ('breathe-shine',             'Carlsbad'),
  ('danieltyack',               'Encinitas'),
  ('danny-kenduck',             'Encinitas'),
  ('david-steel',               'Encinitas'),
  ('house-of-fates',            'Carlsbad'),
  ('kenton-hoppas',             'Encinitas'),
  ('kevin-russell',             'Encinitas'),
  ('mikhael',                   'Vista'),
  ('nutrithryv',                'Cardiff'),
  ('rageher',                   'Encinitas'),
  ('rapid-cold-plunge-sauna',   'San Diego'),
  ('royaltemple',               'Vista'),
  ('templeofaset',              'Vista'),
  ('vanta',                     'Encinitas')
) as v(slug, city)
where s.slug = v.slug
  and s.city is null;

commit;
