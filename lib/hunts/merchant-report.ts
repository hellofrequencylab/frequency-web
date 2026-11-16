/**
 * The merchant report (FH-026): what one venue's staff may read about one Hunt, and the two exports.
 *
 * WHO. A report is for one venue Space. The caller must be current staff of that Space, read fresh
 * this request (lib/hunts/redemption-store.ts loadStationFacts), and the Space must be the Hunt's own
 * Space or an accepted, effective, unrevoked partner (lib/hunts/authz.ts decide). A removed staff
 * member, a revoked partner and a request for another Space's report all get the same refusal, and
 * nothing is read for them.
 *
 * WHAT. Counts only. The facts this module is handed carry runs, never profiles, so no row here can
 * name a player. A venue's own numbers (visits, hand-overs at its own counter) are exact and reconcile
 * to the claim and grant rows. Anything that depends on what players did at OTHER venues is a
 * cross-venue cell and is coarsened:
 *   a single Hunt-wide count shown to a partner is hidden under SMALL_CELL and rounded down to a
 *   multiple of it above (`coarse`), so neither a small group nor a one-step change is visible;
 *   a split of the venue's own visitors (finished, still playing, stopped) is shown whole or not at
 *   all (`wholeSplit`): if any part is between 1 and SMALL_CELL - 1 the split is withheld, because
 *   the exact total beside it would let a reader subtract their way to the hidden part.
 *
 * CONTACTS. Only people who opted in to this named Space, read from the consent ledger's roster
 * (hunt_consent_roster, FH-024), which already drops withdrawals and suppressions and carries no
 * email. The export keeps it that way: a per-Space reference, the consent version and the day.
 *
 * Pure apart from the injected readers, so every refusal is a test. Dark with HUNTS_CLAIMS_ENABLED.
 */
import { createHash } from 'node:crypto'
import { decide } from './authz'
import type { StationFacts } from './redemption'

/** A cross-venue cell smaller than this is never shown. Five is the common floor for small-cell suppression. */
export const SMALL_CELL = 5

/** One cross-venue count: hidden (null) under the floor, else rounded down to a multiple of it. */
export function coarse(n: number): number | null {
  return n < SMALL_CELL ? null : Math.floor(n / SMALL_CELL) * SMALL_CELL
}

/** A split beside an exact total: every part is 0 or at least the floor, or the whole split is withheld. */
export function wholeSplit<K extends string>(cells: Record<K, number>): Record<K, number> | null {
  for (const n of Object.values<number>(cells)) if (n > 0 && n < SMALL_CELL) return null
  return cells
}

// ── Who ──────────────────────────────────────────────────────────────────────────────────────────

type Standing = 'owner_space' | 'partner'

/** The caller's standing at this venue for this Hunt right now, or null. Nothing is inferred from a cached grant. */
export function venueStanding(facts: StationFacts, venueSpaceId: string, nowEpoch: number): Standing | null {
  if (!venueSpaceId || !facts.actor.profileId) return null
  if (!facts.staffVenueSpaceIds.includes(venueSpaceId)) return null
  if (facts.hunt.ownerSpaceId === venueSpaceId) return 'owner_space'
  const verdict = decide('export_own_contacts', {
    hunt: facts.hunt,
    grants: facts.grants,
    partners: facts.partners,
    actor: { ...facts.actor, staffSpaceIds: [...facts.staffVenueSpaceIds] },
    ctx: { venueSpaceId, targetHuntId: facts.hunt.id },
    now: new Date(nowEpoch * 1000).toISOString(),
  })
  return verdict.allow ? 'partner' : null
}

// ── What ─────────────────────────────────────────────────────────────────────────────────────────

const ASSURANCES = ['none', 'signed_node', 'staff', 'event_door'] as const
type Assurance = (typeof ASSURANCES)[number]

/** Rows of one Hunt. Runs stand in for players: no profile id is ever loaded for a report. */
export type ReportFacts = {
  claims: readonly { runId: string; versionId: string; missionKey: string; state: string; assurance: string; placementId: string | null; heldVenueSpaceId: string | null }[]
  bindings: readonly { versionId: string; missionKey: string; placementId: string; venueSpaceId: string | null }[]
  runs: readonly { id: string; state: string }[]
  rewards: readonly { id: string; title: string; kind: string }[]
  grants: readonly { rewardId: string; state: string; redeemedVenueSpaceId: string | null }[]
}

type GrantTotals<N> = { issued: N; open: N; redeemed: N; cancelled: N; expired: N }

type MerchantReport = {
  standing: Standing
  /** This venue's own stops. Exact. `total` is accepted claims; `visitors` is distinct runs among them. */
  visits: { total: number; visitors: number; byAssurance: Record<Assurance, number>; awaitingReview: number }
  /** Rewards handed over at this venue's counter. Exact. */
  redeemedHere: number
  /** Hunt-wide reward totals. Exact for the Hunt's own Space; coarse for a partner. */
  grants: GrantTotals<number | null>
  offers: { title: string; kind: string; issued: number | null; redeemedHere: number }[]
  /** What this venue's visitors went on to do. Whole or withheld. */
  onward: { finished: number; still_playing: number; stopped: number } | null
  /** People who opted in to hear from this Space. */
  contacts: number
}

const bindingKey = (versionId: string, missionKey: string, placementId: string) => `${versionId}\n${missionKey}\n${placementId}`

/** The venue a claim was made at, through the binding its version published. Null when it has none. */
export function claimVenues(facts: Pick<ReportFacts, 'bindings'>): (claim: { versionId: string; missionKey: string; placementId: string | null }) => string | null {
  const venueOf = new Map(facts.bindings.map((b) => [bindingKey(b.versionId, b.missionKey, b.placementId), b.venueSpaceId]))
  return (claim) => (claim.placementId ? venueOf.get(bindingKey(claim.versionId, claim.missionKey, claim.placementId)) ?? null : null)
}

export function buildMerchantReport(facts: ReportFacts, venueSpaceId: string, standing: Standing, contacts: number): MerchantReport {
  const venueOf = claimVenues(facts)
  const byAssurance: Record<Assurance, number> = { none: 0, signed_node: 0, staff: 0, event_door: 0 }
  const visitorRuns = new Set<string>()
  let total = 0
  let awaitingReview = 0
  for (const c of facts.claims) {
    if (c.state === 'needs_review' && c.heldVenueSpaceId === venueSpaceId) awaitingReview++
    if (c.state !== 'accepted' || venueOf(c) !== venueSpaceId) continue
    total++
    byAssurance[ASSURANCES.find((a) => a === c.assurance) ?? 'none']++
    visitorRuns.add(c.runId)
  }

  const exact: GrantTotals<number> = { issued: 0, open: 0, redeemed: 0, cancelled: 0, expired: 0 }
  const issuedBy = new Map<string, number>()
  const hereBy = new Map<string, number>()
  let redeemedHere = 0
  for (const g of facts.grants) {
    exact.issued++
    exact[g.state === 'redeemed' ? 'redeemed' : g.state === 'revoked' ? 'cancelled' : g.state === 'expired' ? 'expired' : 'open']++
    issuedBy.set(g.rewardId, (issuedBy.get(g.rewardId) ?? 0) + 1)
    if (g.state === 'redeemed' && g.redeemedVenueSpaceId === venueSpaceId) {
      redeemedHere++
      hereBy.set(g.rewardId, (hereBy.get(g.rewardId) ?? 0) + 1)
    }
  }
  const wide = (n: number): number | null => (standing === 'owner_space' ? n : coarse(n))

  const stateOf = new Map(facts.runs.map((r) => [r.id, r.state]))
  const onward = { finished: 0, still_playing: 0, stopped: 0 }
  for (const runId of visitorRuns) {
    const state = stateOf.get(runId)
    onward[state === 'completed' ? 'finished' : state === 'active' ? 'still_playing' : 'stopped']++
  }

  return {
    standing,
    visits: { total, visitors: visitorRuns.size, byAssurance, awaitingReview },
    redeemedHere,
    grants: { issued: wide(exact.issued), open: wide(exact.open), redeemed: wide(exact.redeemed), cancelled: wide(exact.cancelled), expired: wide(exact.expired) },
    offers: facts.rewards.map((r) => ({ title: r.title, kind: r.kind, issued: wide(issuedBy.get(r.id) ?? 0), redeemedHere: hereBy.get(r.id) ?? 0 })),
    onward: wholeSplit(onward),
    contacts,
  }
}

// ── The gate and the read ────────────────────────────────────────────────────────────────────────

/** One opted-in lead from the consent ledger's roster for ONE Space. */
export type RosterRow = { profileId: string; consentVersion: string; optedInAt: string | null; firstHuntId: string | null }

export type ReportDeps = {
  /** Fresh authority facts for this caller and Hunt, or null when the Hunt cannot be read. */
  loadStanding: (profileId: string, huntId: string) => Promise<StationFacts | null>
  loadFacts: (huntId: string) => Promise<ReportFacts>
  /** The consent roster of exactly one Space. */
  loadRoster: (spaceId: string) => Promise<RosterRow[]>
}

type ReportRequest = { profileId: string | null; huntId: string; venueSpaceId: string; /** Epoch seconds; the clock when omitted. */ nowEpoch?: number }
type Refused = { ok: false; reason: 'not_permitted' }

/**
 * Read one venue's report. The standing is decided first; for anyone without it no claim, grant or
 * contact is read, and the answer never says whether the Hunt or the venue exists.
 */
export async function readMerchantReport(deps: ReportDeps, input: ReportRequest): Promise<{ ok: true; report: MerchantReport; roster: RosterRow[] } | Refused> {
  if (!input.profileId) return { ok: false, reason: 'not_permitted' }
  const facts = await deps.loadStanding(input.profileId, input.huntId)
  const standing = facts ? venueStanding(facts, input.venueSpaceId, input.nowEpoch ?? Math.floor(Date.now() / 1000)) : null
  if (!standing) return { ok: false, reason: 'not_permitted' }
  const [rows, roster] = await Promise.all([deps.loadFacts(input.huntId), deps.loadRoster(input.venueSpaceId)])
  return { ok: true, report: buildMerchantReport(rows, input.venueSpaceId, standing, roster.length), roster }
}

// ── Exports ──────────────────────────────────────────────────────────────────────────────────────

/** One CSV cell. A leading formula character is defused so a reward title cannot run in a spreadsheet. */
export function csvCell(value: string | number): string {
  const text = typeof value === 'number' ? String(value) : /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const csv = (rows: (string | number)[][]): string => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'

/** How a possibly withheld count reads, on the page and in the file. */
export function shown(n: number | null, standing: Standing): string {
  if (n === null) return `Fewer than ${SMALL_CELL}`
  return standing === 'partner' ? `${n} or more` : String(n)
}

export function merchantReportCsv(r: MerchantReport): string {
  const rows: (string | number)[][] = [
    ['section', 'measure', 'value'],
    ['Stops here', 'Confirmed stops', r.visits.total],
    ['Stops here', 'Players', r.visits.visitors],
    ...ASSURANCES.map((a) => ['Stops here', `Proof: ${a}`, r.visits.byAssurance[a]]),
    ['Stops here', 'Waiting for review', r.visits.awaitingReview],
    ['Rewards', 'Handed over here', r.redeemedHere],
    ['Rewards', 'Issued on this Trail', shown(r.grants.issued, r.standing)],
    ['Rewards', 'Not yet used', shown(r.grants.open, r.standing)],
    ['Rewards', 'Used anywhere', shown(r.grants.redeemed, r.standing)],
    ['Rewards', 'Cancelled', shown(r.grants.cancelled, r.standing)],
    ['Rewards', 'Expired', shown(r.grants.expired, r.standing)],
    ...r.offers.flatMap((o) => [
      ['Offer', `${o.title}: issued`, shown(o.issued, r.standing)],
      ['Offer', `${o.title}: handed over here`, o.redeemedHere],
    ]),
    ...(r.onward
      ? [['Your players', 'Finished the Trail', r.onward.finished], ['Your players', 'Still playing', r.onward.still_playing], ['Your players', 'Stopped', r.onward.stopped]]
      : [['Your players', 'What they did next', 'Not enough players yet']]),
    ['Contacts', 'Opted in to hear from you', r.contacts],
  ]
  return csv(rows)
}

/**
 * The contact export for ONE Space. The reference is a hash keyed by that Space, so two venues cannot
 * line their files up to find the same person, and no profile id, name or address leaves.
 */
export function contactsCsv(spaceId: string, huntId: string, roster: readonly RosterRow[]): string {
  const ref = (profileId: string) => createHash('sha256').update(`hunt-lead:${spaceId}:${profileId}`).digest('hex').slice(0, 16)
  return csv([
    ['contact_ref', 'consent_version', 'opted_in_on', 'first_met_on_this_trail'],
    ...roster.map((row) => [ref(row.profileId), row.consentVersion, row.optedInAt ? row.optedInAt.slice(0, 10) : '', row.firstHuntId === huntId ? 'yes' : 'no']),
  ])
}
