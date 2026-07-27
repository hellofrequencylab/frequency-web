-- =============================================================================
-- TIER TO CIRCLE MEMBERSHIP ACCESS (ADR-859)
--
-- A Space links one of its membership tiers to one of its circles ("a circle for
-- each tier", the operator's model): joining or being billed into the tier grants
-- circle membership; the membership lifecycle (cancel, tier switch, webhook
-- cancellation) revokes it. Two additive columns:
--
--   space_membership_tiers.circle_id   the link, ONE circle per tier. ON DELETE
--                                      SET NULL: deleting the circle degrades the
--                                      tier to "no circle" instead of blocking the
--                                      delete (the tier itself stays sellable).
--   memberships.granted_by_tier_id     PROVENANCE on the circle-membership row: set
--                                      only on rows the tier engine created. Revoke
--                                      deletes rows carrying the revoking tier's id
--                                      and NOTHING else, so a row the member
--                                      self-joined (granted_by_tier_id IS NULL) is
--                                      never removed by a billing event. ON DELETE
--                                      SET NULL: deleting a tier clears provenance,
--                                      and the member simply keeps the circle (the
--                                      operator removed the tier, not the member).
--
-- WHY DURABLE ROWS (versus ADR-823's live gate for members-only event tickets):
-- the circle IS the hub of the feature. The roster, circles.member_count (the
-- insert/delete count triggers), the comms audience, and the get_my_circle_ids()
-- RLS helper ALL read `memberships` rows directly. A live "check the tier at read
-- time" gate (the ADR-823 pattern, right for a one-shot ticket claim) would leave
-- every one of those readers blind to tier members. So access is materialized as
-- real rows, and lib/spaces/tier-circle.ts (syncTierCircleAccess) owns the
-- lifecycle wiring that keeps them true.
--
-- No backfill: linking a tier via setTierCircle runs an initial sweep that grants
-- every current active member of that tier, so new links self-heal and existing
-- data needs no one-time migration pass.
--
-- The existing cap trigger (enforce_circle_member_cap, 20260726000000) still fires
-- on these inserts: a full circle raises 'circle_full' (P0001), which the app
-- catches and reports WITHOUT failing the paid membership.
--
-- House style (matches 20260726000000): additive + idempotent, SAFE to re-run.
-- No em or en dashes.
--
-- ROLLBACK:
--   drop index if exists public.memberships_granted_by_tier_idx;
--   alter table public.memberships drop column if exists granted_by_tier_id;
--   drop index if exists public.space_membership_tiers_circle_idx;
--   alter table public.space_membership_tiers drop column if exists circle_id;
-- =============================================================================

-- The tier side of the link: one circle per tier.
alter table public.space_membership_tiers
  add column if not exists circle_id uuid references public.circles(id) on delete set null;

comment on column public.space_membership_tiers.circle_id is
  'The circle this tier grants membership in (ADR-859). One circle per tier; null = the tier grants no circle. ON DELETE SET NULL: removing the circle degrades the tier to no-circle. Written only by setTierCircle (lib/spaces/tier-circle.ts), which validates the circle belongs to the same Space.';

-- Most tiers carry no link; a partial index keeps "which tiers feed this circle"
-- (the unlink sweep + operator surfaces) cheap without indexing the null majority.
create index if not exists space_membership_tiers_circle_idx
  on public.space_membership_tiers (circle_id)
  where circle_id is not null;

-- The circle side: provenance for rows the tier engine created.
alter table public.memberships
  add column if not exists granted_by_tier_id uuid references public.space_membership_tiers(id) on delete set null;

comment on column public.memberships.granted_by_tier_id is
  'Provenance (ADR-859): set when this circle membership was granted by a Space membership tier (space_membership_tiers.id). NULL = the member joined on their own; revoke NEVER deletes a null-provenance row. ON DELETE SET NULL: deleting the tier releases the row to the member rather than evicting them.';

-- The revoke path deletes by provenance; a partial index keeps that delete (and
-- the re-link sweep) from scanning the self-joined majority.
create index if not exists memberships_granted_by_tier_idx
  on public.memberships (granted_by_tier_id)
  where granted_by_tier_id is not null;
