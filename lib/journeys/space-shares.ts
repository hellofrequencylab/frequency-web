// Co-hosted Journeys (journey_plan_space_shares): the PURE half. No IO, unit-tested.
//
// A Journey lives in ONE home Space (journey_plans.space_id). An ACCEPTED share row lets the same
// Journey also appear on a co-host Space without moving it, the way event_space_shares does for events
// (lib/events/event-share.ts). The IO readers live in lib/journey-plans.ts beside
// listJourneyPlansForSpace, so the service-role client stays in the one module that already holds it.
//
// THE CONTRACT: a share is necessary to appear on the co-host Space, never sufficient. The Journey's
// own visibility still applies, so a Journey flipped back to private drops off every co-host Space at
// once, whatever the share row says. The share grants a credit and a listing, never edit access.

/** The fields the merge needs from a journey_plans row. */
interface MergeablePlan {
  id: string
  created_at: string
}

/**
 * A Space's own Journeys plus the Journeys accepted-shared to it, de-duplicated by id (an own row wins),
 * newest first, capped at `limit`. Pure, so the ordering and the de-dupe are pinned by a unit test.
 */
export function mergeOwnedAndSharedPlans<T extends MergeablePlan>(owned: T[], shared: T[], limit: number): T[] {
  if (shared.length === 0) return owned.slice(0, limit)
  const seen = new Set<string>()
  const out: T[] = []
  for (const p of [...owned, ...shared]) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
  }
  out.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
  return out.slice(0, limit)
}

/** A share row as the co-host reader needs it. */
export interface JourneyShareRow {
  space_id: string
  status: string
}

/** A Space row as the co-host reader needs it. */
export interface CoHostSpaceRow {
  id: string
  slug: string
  name: string | null
  brand_name: string | null
  status: string | null
  visibility?: string | null
}

/** A Space credited as a co-host on the public Journey page. */
export interface JourneyCoHostSpace {
  id: string
  slug: string
  name: string
}

/**
 * The co-host Spaces to credit, from a plan's share rows and the resolved Space rows. ACCEPTED shares
 * only (pending, declined and revoked never render), active and non-private Spaces only, the home
 * Space never credited as its own co-host, one credit per Space, in share order. Pure.
 */
export function coHostSpacesFromRows(
  shares: JourneyShareRow[],
  spaces: CoHostSpaceRow[],
  homeSpaceId: string | null,
): JourneyCoHostSpace[] {
  const byId = new Map(spaces.map((s) => [s.id, s]))
  const seen = new Set<string>()
  const out: JourneyCoHostSpace[] = []
  for (const sh of shares) {
    if (sh.status !== 'accepted') continue
    if (sh.space_id === homeSpaceId || seen.has(sh.space_id)) continue
    const s = byId.get(sh.space_id)
    if (!s || s.status !== 'active' || s.visibility === 'private' || !s.slug) continue
    seen.add(s.id)
    out.push({ id: s.id, slug: s.slug, name: s.brand_name ?? s.name ?? 'Space' })
  }
  return out
}
