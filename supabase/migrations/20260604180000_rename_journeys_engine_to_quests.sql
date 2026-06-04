-- The gamified, Crew-gated tracked engine reverts to its original name: "Quests"
-- (ADR-087). It lives in the "The Quest" nav and is the seasonal/zaps/badge engine.
-- This frees the "Journeys" name for the new OPEN, free, member-built practice-combo
-- library (backlog §Q1).
--
-- Stale `quest_*` VIEWS already exist — backward-compat aliases created during the
-- original quest→arc rename that auto-repointed through arc→journey and now select
-- FROM journey_chains. Drop them so the real tables can take the quest_* names.
-- We deliberately do NOT recreate journey_* compat views: that namespace is now
-- reserved for the open Journeys library.
drop view if exists public.quest_chains;
drop view if exists public.quest_steps;
drop view if exists public.quest_progress;

alter table public.journey_chains   rename to quest_chains;
alter table public.journey_steps    rename to quest_steps;
alter table public.journey_progress rename to quest_progress;
