-- Rename Arcs -> Journeys (ADR-085). "Arc" was itself a rename from "Quest"
-- (ADR-079); the product name is now Journeys. Renaming the tables keeps their
-- policies, indexes, FKs, and triggers attached (Postgres tracks by OID), and no
-- function/RPC references these names in its body, so this is a clean rename.
alter table public.arc_chains   rename to journey_chains;
alter table public.arc_steps    rename to journey_steps;
alter table public.arc_progress rename to journey_progress;
