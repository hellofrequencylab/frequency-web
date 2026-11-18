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
 * PARTNER SEAM (FH-029, plugged in by FH-032S): `activeVenues` is the one place that decides which Spaces
 * count as venues of the Trail right now, by the live partner rule in lib/hunts/partners.ts
 * (`partnerLive`: accepted, effective, not revoked). A venue that withdrew or was suspended drops from
 * the active list on the next read, and its past counts move to `formerVenues`, so the Trail's totals
 * still reconcile with what was earned there.
 *
 * BROADCAST SEAM (FH-031, plugged in by FH-032S): `messages` reports the whole Hunt outbox (waiting,
 * sending, sent, failed). Beside it, `finale` reports the current version's host Event (parseFinale,
 * lib/hunts/rally-finale.ts) and the outbox rows addressed to that finale (`finaleBroadcastAggregate`),
 * so the organiser sees whether the finale notice went out.
 */
import type { PartnerRow } from './authz'
import { buildMerchantReport, claimVenues, coarse, type ReportFacts } from './merchant-report'
import { partnerLive } from './partners'

/** An active run whose last confirmed stop is older than this is stalled, not just between stops. */
export const STALL_HOURS = 24

export type RouteFacts = ReportFacts & {
  hunt: { status: string; ownerSpaceId: string | null; currentVersionId: string | null }
  partners: readonly PartnerRow[]
  /** The current version's stops. */
  missions: readonly { missionKey: string; title: string }[]
  versionRuns: readonly { id: string; state: string }[]
  progress: readonly { runId: string; missionKey: string; disposition: string; acceptedAt: string }[]
  placements: readonly { id: string; medium: string; revokedAt: string | null; healthStatus: string }[]
  outbox: OutboxCounts
  venueNames: Readonly<Record<string, string>>
  /**
   * The current version's finale, when it names one (FH-031): the host Event's title (null when the
   * Event cannot be read), whether it is still on, and the outbox rows addressed to that finale.
   */
  finale?: { title: string | null; eventOn: boolean; outbox: OutboxCounts } | null
}

type OutboxCounts = { pending: number; leased: number; done: number; dead: number }

/** PARTNER SEAM (FH-029). The Spaces that are venues of this Trail at `nowIso`: its own Space, then live partners. */
export function activeVenues(facts: Pick<RouteFacts, 'hunt' | 'partners'>, nowIso: string): string[] {
  const live = facts.partners.filter((p) => partnerLive(p, nowIso))
  return [...new Set([facts.hunt.ownerSpaceId, ...live.map((p) => p.spaceId)].filter((id): id is string => !!id))]
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

type VenueCounts = { spaceId: string; name: string; confirmedStops: number; players: number; awaitingReview: number; handedOver: number }

type RouteHealth = {
  status: string
  runs: { started: number; playing: number; finished: number; stopped: number; notStarted: number }
  stops: Stop[]
  placements: { open: number; closed: number; damaged: number; missing: number; unchecked: number }
  venues: VenueCounts[]
  /** Partner venues no longer live (withdrawn, suspended, ended) that still hold counts on this Trail. */
  formerVenues: VenueCounts[]
  messages: { waiting: number; sending: number; sent: number; failed: number }
  /** The finale and its broadcast, or null when the current version names no finale. */
  finale: { title: string | null; eventOn: boolean; sent: number; waiting: number; sending: number; failed: number } | null
}

const messageCounts = (o: OutboxCounts) => ({ waiting: o.pending, sending: o.leased, sent: o.done, failed: o.dead })

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

  const counts = (spaceId: string): VenueCounts => {
    const r = buildMerchantReport(facts, spaceId, 'owner_space', 0)
    return { spaceId, name: facts.venueNames[spaceId] ?? 'A venue', confirmedStops: r.visits.total, players: r.visits.visitors, awaitingReview: r.visits.awaitingReview, handedOver: r.redeemedHere }
  }
  const active = activeVenues(facts, nowIso)
  const venues = active.map(counts)
  // A venue that left keeps what was earned there: listed apart, only when it holds a count.
  const formerVenues = [...new Set(facts.partners.map((p) => p.spaceId))]
    .filter((spaceId) => !active.includes(spaceId))
    .map(counts)
    .filter((v) => v.confirmedStops + v.awaitingReview + v.handedOver > 0)

  return {
    status: facts.hunt.status,
    runs,
    stops,
    placements,
    venues,
    formerVenues,
    messages: messageCounts(facts.outbox),
    finale: facts.finale ? { title: facts.finale.title, eventOn: facts.finale.eventOn, ...messageCounts(facts.finale.outbox) } : null,
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
