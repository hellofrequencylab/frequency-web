-- Index the journey_plan_guides.added_by foreign key (check:fk-indexes). A profile delete sets added_by to null,
-- which scans the table without an index. Reversible: drop index public.journey_plan_guides_added_by_idx.
create index if not exists journey_plan_guides_added_by_idx on public.journey_plan_guides (added_by);
