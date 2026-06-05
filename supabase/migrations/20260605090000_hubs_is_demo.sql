-- Demo Seed Studio now generates a neighborhood Hub (run by a Guide) over each
-- seeded set of circles (engine.ts / ADR-093). Hubs need the same is_demo contract
-- as the other demo-able tables (docs/DEMO-SYSTEM.md) so they recede, toggle, and
-- purge with the rest of the layer — without it, a purged demo guide leaves an
-- orphaned hub behind (hubs.guide_id is ON DELETE SET NULL, not cascade).
alter table public.hubs add column if not exists is_demo boolean not null default false;
create index if not exists hubs_is_demo_idx on public.hubs (is_demo) where is_demo;

comment on column public.hubs.is_demo is
  'Seeded demo hub (Seed Studio). Purged with the demo layer; deleted AFTER its demo circles (circles.hub_id is NO ACTION).';
