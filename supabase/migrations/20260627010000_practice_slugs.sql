-- Practice slugs (SEO, ADR-281 follow-up). Public practice detail pages were keyed by
-- uuid (/discover/practices/<uuid>); a human/keyword slug is a stronger crawl target.
-- Additive + reversible: a nullable `slug` column, a clean title-derived backfill
-- (de-duplicated with a numeric suffix), and a partial-unique index. The public reader
-- looks up by slug OR id, so existing uuid URLs keep resolving (canonical points at the slug).

alter table public.practices add column if not exists slug text;

with ranked as (
  select id,
         nullif(trim(both '-' from regexp_replace(lower(trim(title)), '[^a-z0-9]+', '-', 'g')), '') as base,
         row_number() over (
           partition by nullif(trim(both '-' from regexp_replace(lower(trim(title)), '[^a-z0-9]+', '-', 'g')), '')
           order by created_at, id
         ) as rn
  from public.practices
  where slug is null
)
update public.practices p
set slug = case
  when r.base is null then 'practice-' || substr(replace(p.id::text, '-', ''), 1, 12)
  when r.rn = 1 then left(r.base, 60)
  else left(r.base, 55) || '-' || r.rn
end
from ranked r
where p.id = r.id;

create unique index if not exists practices_slug_key on public.practices (slug) where slug is not null;
