-- Per-Focus instructions + timing for a practice (multi-Focus support).
--
-- A practice can belong to MULTIPLE Focuses (Pillars). `focus_details` is keyed by
-- pillar id; presence of a key = that Focus is selected. Each entry carries the
-- structured instructions + timing the author wrote for that Focus:
--   { [pillarId]: { instructions: string, timing: string } }
-- `domain_id` stays the FIRST selected pillar id for back-compat (existing Pillar
-- filtering + cards keep a primary).
alter table practices add column if not exists focus_details jsonb not null default '{}'::jsonb;
