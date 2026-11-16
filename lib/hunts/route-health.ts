/**
 * Route health (FH-032): the organiser's aggregate view of one Trail, and the much narrower view a
 * partner venue gets.
 *
 * THE ORGANISER (any Hunt role: lib/hunts/store.ts authorizeHuntAction 'read_aggregate') sees where
 * runs wait and stall, which alternate placements get used, each active venue's own counts, open and
 * closed placements, and whether the Trail's messages are going out. It is still an aggregate: the
 * model below holds counts keyed by stop, placement and venue. No run id, player or timestamp survives
 * `buildRouteHealth`, so there is no per-player path to read off it.
 *
 * A PARTNER gets `partnerRouteView`: its own placements and its own confirmed stops, exact, and
 * nothing about any other venue. Every number that depends on what players did elsewhere (how many
 * started, are playing, finished, are waiting after its stop) goes through `coarse`
 * (lib/hunts/merchant-report.ts): hidden under five, then only in steps of five. One player moving
 * between other venues changes nothing a partner can see unless a count crosses a multiple of five,
 * and a crossing says only that one of at least five people did something. No before-and-after pair
 * of views singles a player out, which is what stops a partner rebuilding a trail.
 *
 * PARTNERS (FH-029, plugged in by FH-032S): `activeVenues` is the one place that decides which Spaces
 * count as venues of the Trail right now, and it asks lib/hunts/partners.ts `partnerLive`, the same rule
 * the claim path and publish use. A venue withdrawn, suspended or revoked through the partner flow
 * drops out of `venues` on the next read; its counts move to `formerVenues`, so what it already
 * confirmed still adds up. `partnerStanding` says, for each live partner, who the named steward is and
 * whether the terms it accepted are the ones in force today.
 *
 * FINALE (FH-031, plugged in by FH-032S): `finale` is the finale every player's Trail page shows, from
 * lib/hunts/rally-finale.ts `projectFinale` over the same host Event and the same Space rule, read
 * with no player's seat in it. `messages` still reports the Hunt outbox beside it.
 */
import type { PartnerRow } from './authz'
import { buildMerchantReport, claimVenues, coarse, type ReportFacts } from './merchant-report'
import { PARTNER_TERMS, partnerLive } from './partners'
import { projectFinale, type HostEvent } from './rally-finale'

/** An active run whose last confirmed stop is older than this is stalled, not just between stops. */
export const STALL_HOURS = 24

/** A partner row with the two facts FH-029 added: the named steward and the terms version it pinned. */
export type RoutePartner = PartnerRow & { inviteeProfileId?: string | null; termsVersion?: string | null }

/** The current version's finale: the host Event it names, read now, and that Event's confirmed seats. */
export type RouteFinale = { eventId: string; event: HostEvent | null; going: number }

export type RouteFacts = ReportFacts & {
  hunt: { status: string; ownerSpaceId: string | null; currentVersionId: string | null }
  partners: readonly RoutePartner[]
  /** Display names of the named stewards, by profile id. */
  stewardNames?: Readonly<Record<string, string>>
  /** Null or absent when the current version does not end at an Event. */
  finale?: RouteFinale | null
  /** The current version's stops. */
  missions: readonly { missionKey: string; title: string }[]
  versionRuns: readonly { id: string; state: string }[]
  progress: readonly { runId: string; missionKey: string; disposition: string; acceptedAt: string }[]
  placements: readonly { id: string; medium: string; revokedAt: string | null; healthStatus: string }[]
  outbox: { pending: number; leased: number; done: number; dead: number }
  venueNames: Readonly<Record<string, string>>
}

/** The Spaces that are venues of this Trail at `nowIso`: its own Space, then partners in force (lib/hunts/partners.ts). */
export function activeVenues(facts: Pick<RouteFacts, 'hunt' | 'partners'>, nowIso: string): string[] {
  const live = facts.partners.filter((p) => partnerLive(p, nowIso))
  return [...new Set([facts.hunt.ownerSpaceId, ...live.map((p) => p.spaceId)].filter((id): id is string => !!id))]
}

/** Why a venue that was once live is not any more. */
type VenueEnd = 'withdrawn' | 'suspended' | 'ended'

/** Partner Spaces that were in force once (accepted with an effective date) and are not now. */
function formerPartners(facts: Pick<RouteFacts, 'hunt' | 'partners'>, nowIso: string): { spaceId: string; ended: VenueEnd }[] {
  const active = new Set(activeVenues(facts, nowIso))
  const out = new Map<string, VenueEnd>()
  for (const p of facts.partners) {
    if (active.has(p.spaceId) || p.effectiveAt === null || Date.parse(p.effectiveAt) > Date.parse(nowIso)) continue
    if (p.status === 'withdrawn' || p.status === 'suspended') out.set(p.spaceId, p.status)
    else if (p.status === 'accepted') out.set(p.spaceId, 'ended')
  }
  return [...out].map(([spaceId, ended]) => ({ spaceId, ended }))
}

type FinaleState =
  | { state: 'none' }
  | { state: 'unavailable' }
  | { state: 'showing'; event: { title: string; slug: string; startsAt: string | null }; capacity: number | null; going: number; spotsLeft: number | null; isFull: boolean }

/**
 * What every player's finale panel shows right now: the projection with no player's seat in it, so it
 * can only say which Event, how full, or that the finale is unavailable. Nothing here is per player.
 */
function finaleBroadcast(facts: Pick<RouteFacts, 'hunt' | 'partners' | 'finale'>, nowIso: string): FinaleState {
  const f = facts.finale
  if (!f) return { state: 'none' }
  const p = projectFinale({
    finale: { eventId: f.eventId },
    event: f.event,
    going: f.going,
    rsvps: [],
    tickets: [],
    selfCheckedIn: false,
    runState: 'active',
    huntOwnerSpaceId: facts.hunt.ownerSpaceId,
    livePartnerSpaceIds: activeVenues(facts, nowIso),
  })
  if (p.kind === 'none') return { state: 'none' }
  if (p.kind === 'unavailable') return { state: 'unavailable' }
  return { state: 'showing', event: { title: p.event.title, slug: p.event.slug, startsAt: p.event.startsAt }, ...p.capacity }
}

type Stop = {
  title: string
  /** Runs credited with this stop. */
  reached: number
  /** Active runs whose latest stop this is. */
  waiting: number
  /** The part of `waiting` idle for STALL_HOURS or more. */
  stalled: number
  /** One row per placement bound to the stop; more than one means the stop has alternates. */
  placements: { medium: string; open: boolean; venueSpaceId: string | null; uses: number }[]
}

type RouteHealth = {
  status: string
  runs: { started: number; playing: number; finished: number; stopped: number; notStarted: number }
  stops: Stop[]
  placements: { open: number; closed: number; damaged: number; missing: number; unchecked: number }
  venues: VenueCounts[]
  /** Partners that were live and are not now. Their counts stay, so the Trail's totals still reconcile. */
  formerVenues: (VenueCounts & { ended: VenueEnd })[]
  /** Each live partner's named steward and whether the terms it accepted are today's. */
  partnerStanding: { spaceId: string; steward: string | null; terms: 'current' | 'earlier' | 'unknown' }[]
  messages: { waiting: number; sending: number; sent: number; failed: number }
  finale: FinaleState
}

type VenueCounts = { spaceId: string; name: string; confirmedStops: number; players: number; awaitingReview: number; handedOver: number }

export function buildRouteHealth(facts: RouteFacts, nowIso: string): RouteHealth {
  const version = facts.hunt.currentVersionId
  const stateOf = new Map(facts.versionRuns.map((r) => [r.id, r.state]))
  const runs = { started: facts.versionRuns.length, playing: 0, finished: 0, stopped: 0, notStarted: 0 }
  for (const r of facts.versionRuns) runs[r.state === 'active' ? 'playing' : r.state === 'completed' ? 'finished' : 'stopped']++

  const reached = new Map<string, number>()
  const latest = new Map<string, { missionKey: string; at: number }>()
  for (const p of facts.progress) {
    if (p.disposition !== 'credited' || !stateOf.has(p.runId)) continue
    reached.set(p.missionKey, (reached.get(p.missionKey) ?? 0) + 1)
    const at = Date.parse(p.acceptedAt)
    const prev = latest.get(p.runId)
    if (!prev || at > prev.at) latest.set(p.runId, { missionKey: p.missionKey, at })
  }
  const waiting = new Map<string, number>()
  const stalled = new Map<string, number>()
  const cutoff = Date.parse(nowIso) - STALL_HOURS * 3600_000
  for (const r of facts.versionRuns) {
    if (r.state !== 'active') continue
    const last = latest.get(r.id)
    if (!last) {
      runs.notStarted++
      continue
    }
    waiting.set(last.missionKey, (waiting.get(last.missionKey) ?? 0) + 1)
    if (last.at <= cutoff) stalled.set(last.missionKey, (stalled.get(last.missionKey) ?? 0) + 1)
  }

  const uses = new Map<string, number>()
  for (const c of facts.claims) {
    if (c.state !== 'accepted' || c.versionId !== version || !c.placementId) continue
    const key = `${c.missionKey}\n${c.placementId}`
    uses.set(key, (uses.get(key) ?? 0) + 1)
  }
  const placementOf = new Map(facts.placements.map((p) => [p.id, p]))
  const stops: Stop[] = facts.missions.map((m) => ({
    title: m.title,
    reached: reached.get(m.missionKey) ?? 0,
    waiting: waiting.get(m.missionKey) ?? 0,
    stalled: stalled.get(m.missionKey) ?? 0,
    placements: facts.bindings
      .filter((b) => b.versionId === version && b.missionKey === m.missionKey)
      .map((b) => ({
        medium: placementOf.get(b.placementId)?.medium ?? 'qr',
        open: placementOf.get(b.placementId)?.revokedAt === null,
        venueSpaceId: b.venueSpaceId,
        uses: uses.get(`${m.missionKey}\n${b.placementId}`) ?? 0,
      })),
  }))

  const placements = { open: 0, closed: 0, damaged: 0, missing: 0, unchecked: 0 }
  for (const p of facts.placements) {
    placements[p.revokedAt === null ? 'open' : 'closed']++
    if (p.revokedAt === null && (p.healthStatus === 'damaged' || p.healthStatus === 'missing' || p.healthStatus === 'unchecked')) placements[p.healthStatus]++
  }

  const countsFor = (spaceId: string): VenueCounts => {
    const r = buildMerchantReport(facts, spaceId, 'owner_space', 0)
    return { spaceId, name: facts.venueNames[spaceId] ?? 'A venue', confirmedStops: r.visits.total, players: r.visits.visitors, awaitingReview: r.visits.awaitingReview, handedOver: r.redeemedHere }
  }
  const active = activeVenues(facts, nowIso)
  const venues = active.map(countsFor)
  const formerVenues = formerPartners(facts, nowIso).map(({ spaceId, ended }) => ({ ...countsFor(spaceId), ended }))
  const partnerStanding = facts.partners
    .filter((p) => p.spaceId !== facts.hunt.ownerSpaceId && partnerLive(p, nowIso))
    .map((p) => ({
      spaceId: p.spaceId,
      steward: (p.inviteeProfileId && facts.stewardNames?.[p.inviteeProfileId]) || null,
      terms: !p.termsVersion ? ('unknown' as const) : p.termsVersion === PARTNER_TERMS.hash ? ('current' as const) : ('earlier' as const),
    }))

  return {
    status: facts.hunt.status,
    runs,
    stops,
    placements,
    venues,
    formerVenues,
    partnerStanding,
    messages: { waiting: facts.outbox.pending, sending: facts.outbox.leased, sent: facts.outbox.done, failed: facts.outbox.dead },
    finale: finaleBroadcast(facts, nowIso),
  }
}

type PartnerRouteView = {
  status: string
  /** Trail-wide, coarse. */
  runs: { started: number | null; playing: number | null; finished: number | null }
  /** This venue's own placements. Exact. */
  placements: { open: number; closed: number }
  /** Stops with a placement at this venue. `confirmedHere` is the venue's own count; `waiting` is coarse. */
  stops: { title: string; confirmedHere: number; waiting: number | null }[]
}

/** What one partner venue may see of the route. Nothing about another venue, and no cross-venue cell under five. */
export function partnerRouteView(facts: RouteFacts, venueSpaceId: string, nowIso: string): PartnerRouteView {
  const health = buildRouteHealth(facts, nowIso)
  const mine = (p: { venueSpaceId: string | null }) => p.venueSpaceId === venueSpaceId
  const venueOf = claimVenues(facts)
  const hereBy = new Map<string, number>()
  for (const c of facts.claims) {
    if (c.state === 'accepted' && c.versionId === facts.hunt.currentVersionId && venueOf(c) === venueSpaceId) hereBy.set(c.missionKey, (hereBy.get(c.missionKey) ?? 0) + 1)
  }
  const own = health.stops.flatMap((s) => s.placements.filter(mine))
  return {
    status: health.status,
    runs: { started: coarse(health.runs.started), playing: coarse(health.runs.playing), finished: coarse(health.runs.finished) },
    placements: { open: own.filter((p) => p.open).length, closed: own.filter((p) => !p.open).length },
    stops: health.stops
      .map((s, index) => ({ s, index }))
      .filter(({ s }) => s.placements.some(mine))
      .map(({ s, index }) => ({ title: s.title, confirmedHere: hereBy.get(facts.missions[index].missionKey) ?? 0, waiting: coarse(s.waiting) })),
  }
}
