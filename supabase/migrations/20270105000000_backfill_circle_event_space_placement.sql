-- Backfill circle-event placement (ADR-857).
--
-- A circle's events belong to the circle's Space: the Space calendar reads events by
-- events.space_id, the circle page reads them by scope_id, and from ADR-857 on every
-- circle-event writer derives space_id from the owning circle, and a circle transfer restamps
-- its events. Before that, every circle event was stamped ROOT even when its circle lived in a
-- Space — so a Space's own circles' events never appeared on the Space calendar.
--
-- This sweeps the historical rows onto the same invariant the writers now maintain:
-- a circle-scoped event's space_id equals its circle's space_id. Personal circles live in the
-- root space, so their events keep root placement and this is a no-op for them by construction
-- (the WHERE only touches rows whose placement disagrees with the circle's).
--
-- Idempotent: re-running finds no disagreeing rows. The restrictive space-isolation policies
-- (can_view_space_content) start applying to the restamped rows immediately, which is the
-- CORRECT tightening: a private Space's circle is already invisible to non-members via the
-- identical restrictive policy on circles — its events matching that boundary is the fix,
-- not a regression.

update public.events e
set space_id = c.space_id
from public.circles c
where e.scope_type = 'circle'
  and e.scope_id = c.id
  and c.space_id is not null
  and e.space_id is distinct from c.space_id;
