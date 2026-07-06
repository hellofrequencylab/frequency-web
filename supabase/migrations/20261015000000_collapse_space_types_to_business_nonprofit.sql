-- Phase 1 of the business-model collapse (ADR-552, docs/BUSINESS-MODEL-PLAN.md §4):
-- collapse the public Space type system from 8 types to TWO — `business` and `nonprofit` —
-- keeping the hidden platform host `root`. Everything else (practitioner, coaching,
-- event_space, lab, partner) folds into free "Focus" presets under Business; `organization`
-- is renamed to `nonprofit` (the cleaner one-word canon, ADR-552 §3.1).
--
-- SHIP NOTE: this may ship FILE-ONLY (not yet applied). The keystone pricing migrations
-- (20260915…/20260916…/20260917…) are also headered file-only, so the live DB may still be on
-- the pre-collapse shape. Apply this only after confirming DB reality (BUSINESS-MODEL-PLAN §0).
-- It is written to be idempotent-safe: the backfill runs before the CHECK is re-added so no row
-- can violate the new constraint at apply time.
--
-- `root` stays in the CHECK + the TS union (lib/spaces/types.ts): it is the platform host
-- (rootEntityId(), delete/suspend guards) and is never member-facing.

begin;

-- 1. Backfill the existing rows FIRST so the tightened CHECK can never reject a live row.
--    Every removed public type folds into `business`; `organization` becomes `nonprofit`.
update public.spaces
   set type = 'business'
 where type in ('practitioner', 'coaching', 'event_space', 'lab', 'partner');

update public.spaces
   set type = 'nonprofit'
 where type = 'organization';

-- 2. Drop and re-add the type CHECK to the collapsed two-public-type set (+ the hidden host).
alter table public.spaces drop constraint if exists spaces_type_check;
alter table public.spaces
  add constraint spaces_type_check
  check (type in ('business', 'nonprofit', 'root'));

commit;
