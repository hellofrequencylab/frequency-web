/**
 * The held-claim queue's fact loader (FH-020T). Every Hunt table is service role only, so this file is
 * the tenancy wall for the staff review screen: it reads, fresh for each request, the claims waiting for
 * a decision (hunt_claims.state = needs_review), works out which venue Space each one belongs to, and
 * asks lib/hunts/authz.ts `decide('review_claim')` whether this reviewer may decide it. Nothing is
 * cached, so revoking a staff member or a partner empties the next page load. It writes nothing; the
 * write is `reviewClaim` in lib/hunts/staff-review.ts.
 *
 * Venue attribution: a held claim stores the placement it came through in `policy_result.placement_id`.
 * That placement, with the claim's version and mission, names its venue Space in
 * hunt_mission_placements. A claim with no such placement is shown to nobody (fail closed) until the
 * authoritative venue column lands (the rest of FH-020T's open scope).
 *
 * "Staff" of a venue Space is a member who may edit the Space (`canEditProfile`), the same standing the
 * door and the station use (lib/hunts/redemption-store.ts loadStationFacts).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById } from '@/lib/spaces/store'
import { decide } from './authz'
import { loadStationFacts } from './redemption-store'
import type { StationFacts } from './redemption'

// eslint-disable-next-line no-restricted-syntax -- the FH-005 hunt tables are not in the generated types yet (ADR-246 exception)
const db = () => createAdminClient() as unknown as SupabaseClient

const QUEUE_LIMIT = 200

type ClaimRow = {
  id: string
  hunt_id: string
  version_id: string
  mission_key: string
  reason: string | null
  created_at: string
  policy_result: { placement_id?: unknown } | null
}

type Attributed = { claim: ClaimRow; venueSpaceId: string }

/** Pair each claim with the venue its placement serves. A claim whose placement or venue is unknown is dropped. */
async function attribute(claims: readonly ClaimRow[]): Promise<Attributed[]> {
  const placementIds = [...new Set(claims.map((c) => c.policy_result?.placement_id).filter((p): p is string => typeof p === 'string'))]
  if (placementIds.length === 0) return []
  const { data, error } = await db()
    .from('hunt_mission_placements')
    .select('hunt_id, version_id, mission_key, placement_id, venue_space_id')
    .in('placement_id', placementIds)
  if (error) return []
  const rows = (data ?? []) as { hunt_id: string; version_id: string; mission_key: string; placement_id: string; venue_space_id: string | null }[]
  const out: Attributed[] = []
  for (const claim of claims) {
    const placementId = claim.policy_result?.placement_id
    const bound = rows.find((r) => r.placement_id === placementId && r.hunt_id === claim.hunt_id && r.version_id === claim.version_id && r.mission_key === claim.mission_key)
    if (bound?.venue_space_id) out.push({ claim, venueSpaceId: bound.venue_space_id })
  }
  return out
}

function mayReview(facts: StationFacts, huntId: string, venueSpaceId: string, nowEpoch: number): boolean {
  return decide('review_claim', {
    hunt: facts.hunt,
    grants: facts.grants,
    partners: facts.partners,
    actor: { ...facts.actor, staffSpaceIds: [...facts.staffVenueSpaceIds] },
    ctx: { venueSpaceId, targetHuntId: huntId },
    now: new Date(nowEpoch * 1000).toISOString(),
  }).allow
}

function ageLabel(createdAt: string, nowEpoch: number): string {
  const minutes = Math.max(0, Math.floor((nowEpoch * 1000 - Date.parse(createdAt)) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

type HeldClaimView = { claimId: string; reference: string; venueName: string; reason: string; ageLabel: string }

/** The held claims this reviewer may decide, oldest first. Empty for anyone who is not staff of the venue. */
export async function loadHeldClaims(reviewerId: string, nowEpoch = Math.floor(Date.now() / 1000)): Promise<HeldClaimView[]> {
  const { data, error } = await db()
    .from('hunt_claims')
    .select('id, hunt_id, version_id, mission_key, reason, created_at, policy_result')
    .eq('state', 'needs_review')
    .order('created_at', { ascending: true })
    .limit(QUEUE_LIMIT)
  if (error) return []
  const attributed = await attribute((data ?? []) as ClaimRow[])

  const factsByHunt = new Map<string, StationFacts | null>()
  const venueNames = new Map<string, string>()
  const out: HeldClaimView[] = []
  for (const { claim, venueSpaceId } of attributed) {
    if (!factsByHunt.has(claim.hunt_id)) factsByHunt.set(claim.hunt_id, await loadStationFacts(reviewerId, claim.hunt_id))
    const facts = factsByHunt.get(claim.hunt_id)
    if (!facts || !mayReview(facts, claim.hunt_id, venueSpaceId, nowEpoch)) continue
    if (!venueNames.has(venueSpaceId)) venueNames.set(venueSpaceId, (await getSpaceById(venueSpaceId))?.name ?? 'Venue')
    out.push({
      claimId: claim.id,
      reference: claim.id.slice(0, 4).toUpperCase(),
      venueName: venueNames.get(venueSpaceId) ?? 'Venue',
      reason: claim.reason?.trim() || 'Proof needs a second look',
      ageLabel: ageLabel(claim.created_at, nowEpoch),
    })
  }
  return out
}

/** Whether this reviewer may decide this claim right now, read fresh. The review action calls this before it writes. */
export async function mayReviewClaim(reviewerId: string, claimId: string, nowEpoch: number): Promise<boolean> {
  const { data, error } = await db()
    .from('hunt_claims')
    .select('id, hunt_id, version_id, mission_key, reason, created_at, policy_result')
    .eq('id', claimId)
    .eq('state', 'needs_review')
    .maybeSingle()
  if (error || !data) return false
  const [one] = await attribute([data as ClaimRow])
  if (!one) return false
  const facts = await loadStationFacts(reviewerId, one.claim.hunt_id)
  return !!facts && mayReview(facts, one.claim.hunt_id, one.venueSpaceId, nowEpoch)
}
