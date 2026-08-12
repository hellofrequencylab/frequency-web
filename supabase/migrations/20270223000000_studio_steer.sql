-- ============================================================================
-- STUDIO STEER: the saved dials behind edit re-entry (docs/STUDIO.md, ADR-996).
--
-- The Studio's steer panel gives an author three dials over any generated draft: the
-- MOOD, plain-language DIRECTIONS, and the LOCK pins that a redraw must not touch
-- (lib/studio/kernel/redraw.ts). Until now nothing held them. An author who redrew a
-- Practice twice re-picked the mood, re-typed the directions, and re-pressed the pins,
-- every single time, because the dials lived only in React state.
--
-- ONE table, service-role only:
--   studio_steer - one row per (entity, entity_id, profile_id): the mood, the directions,
--   and the pins that author last used on that entity.
--
-- WHY ITS OWN TABLE, rather than columns on practices / circles / events / journey_plans:
--
--   1. PRIVACY. `directions` is the author's own note to Vera ("lead with the retreat
--      angle, this one is for the beginners who quit last time"). Every one of those four
--      tables carries a PUBLIC READ policy (e.g. "practices: public read", 20240228000000),
--      so a column there would publish the author's working notes to anyone with the anon
--      key. That alone settles it.
--   2. IT IS KERNEL BEHAVIOUR, NOT ENTITY DATA. The dials are declared by the kernel and
--      offered to every entity that declares `steer`. Four column pairs on four tables would
--      re-declare one shared thing four times, and a fifth entity's re-entry would need a
--      fifth migration. One entity-blind table matches the contract the kernel already keeps.
--   3. THERE IS NO ONE HONEST HOME. A Circle's draft spans `circles` + `circle_profiles`;
--      a Journey's spans `journey_plans` + `journey_plan_items`. Picking one of each pair to
--      carry the dials would be arbitrary.
--
-- PER AUTHOR, not per entity: the dials are the author's own hand on the wheel, so a
-- co-manager never inherits (or overwrites) someone else's mood, and the read needs no
-- per-entity capability check at all. You can only ever read back what you yourself wrote.
--
-- ACCESS MODEL (mirrors business_intake / event_intake): SERVICE-ROLE ONLY. RLS is ENABLED
-- with NO client policies, so the ONLY access path is the gated server code
-- (lib/studio/steer-store.ts, admin client). The default grants are revoked too (ADR-964):
-- a grant held back only by RLS is one policy mistake away from being live. The deliberate
-- service-role-only posture is recorded in scripts/rls-deny-all.txt.
--
-- `entity_id` carries NO foreign key on purpose: it points at whichever table the `entity`
-- names (practices, circles, events, journey_plans), which is exactly the polymorphism a
-- single FK cannot express. A deleted entity therefore leaves one orphan row of authoring
-- state, which is harmless, unreadable by anyone but its author, and reclaimed the moment
-- the author's profile is deleted (the one FK that IS declared).
--
-- House style (matches event_intake): PURELY ADDITIVE + idempotent. It creates one new
-- table, one index, and its RLS. It ALTERs and DROPs nothing, so applying it cannot disturb
-- anything already running. lib/database.types.ts is regenerated separately and the store
-- reaches this table through the untyped admin handle until then (ADR-246). SAFE to re-run.
-- No em or en dashes in any copy here.
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.studio_steer;
-- ============================================================================

create table if not exists public.studio_steer (
  -- The manifest's stable entity id (lib/studio/registry.ts): 'practice', 'circle', 'event',
  -- 'journey'. Free text, code-gated to the registered set, so a newly declared entity needs
  -- no type change to inherit persistence.
  entity      text not null,

  -- The row the dials belong to, in whichever table `entity` names. No FK: see the header.
  entity_id   uuid not null,

  -- Whose hand is on the wheel. The dials are personal, so this is part of the key.
  profile_id  uuid not null references public.profiles(id) on delete cascade,

  -- The mood key (lib/studio/kernel/moods.ts): warm | bold | calm | playful. NULL means the
  -- author never picked one, which is different from picking the default, so it stays nullable.
  mood        text,

  -- The author's plain-language directions, folded into the redraw brief. Bounded in code.
  directions  text,

  -- The lock pins that were held, as manifest lock keys. Only keys the entity's manifest
  -- actually offers are ever written (declaredLockKeys runs before the save), so a stored pin
  -- is always one the server agreed to honour.
  locked      text[] not null default '{}',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  primary key (entity, entity_id, profile_id)
);

-- The only non-key read pattern: everything one author has steered, newest first (an author's
-- own audit, and the FK covering index for profile_id).
create index if not exists studio_steer_profile_idx
  on public.studio_steer (profile_id, updated_at desc);

-- FAIL-CLOSED: RLS enabled, NO policies. Only the gated server code (service-role admin
-- client, lib/studio/steer-store.ts) may touch this table. Direct client access (anon or
-- authed) is denied on every row.
alter table public.studio_steer enable row level security;

-- Close the default grants too (ADR-964). RLS-on-no-policy already denies anon and
-- authenticated (neither bypasses RLS), so this changes no result today; it removes the grant
-- that a future stray policy would otherwise switch on. service_role is not revoked from, so
-- every real caller is untouched.
revoke all on table public.studio_steer from anon, authenticated;

comment on table public.studio_steer is
  'The saved Studio steer dials behind edit re-entry (ADR-996). One row per (entity, entity_id, profile_id) holding the mood, the plain-language directions, and the lock pins that author last used, so an author who redraws twice does not re-pick the mood. Entity-blind by design: the dials are kernel behaviour offered to every manifest that declares steer, so they live here rather than as repeated columns on practices / circles / events / journey_plans (all of which are publicly readable, and directions are the author private note). Service-role only, fail-closed: RLS ENABLED with NO policies, the only access path is lib/studio/steer-store.ts via the admin client.';
