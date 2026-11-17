// FH-026: the merchant report. Done when: totals reconcile to claims and grants, and a revoked staff
// member and a cross-Space export both fail.
import { describe, expect, it, vi } from 'vitest'
import type { PartnerRow } from './authz'
import {
  SMALL_CELL,
  buildMerchantReport,
  coarse,
  contactsCsv,
  csvCell,
  merchantReportCsv,
  readMerchantReport,
  venueStanding,
  wholeSplit,
  type ReportDeps,
  type ReportFacts,
  type RosterRow,
} from './merchant-report'
import type { StationFacts } from './redemption'

const HUNT = 'hunt-1'
const OWNER_SPACE = 'space-owner'
const CAFE = 'space-cafe'
const BOOKS = 'space-books'
const NOW = Math.floor(Date.parse('2026-11-16T12:00:00Z') / 1000)

const partner = (spaceId: string, over: Partial<PartnerRow> = {}): PartnerRow => ({
  huntId: HUNT, spaceId, status: 'accepted', effectiveAt: '2026-11-01T00:00:00Z', revokedAt: null, permittedRoles: ['operator'], ...over,
})

function standing(staffVenueSpaceIds: string[], partners: PartnerRow[] = [partner(CAFE), partner(BOOKS)]): StationFacts {
  return {
    hunt: { id: HUNT, visibility: 'public', ownerProfileId: null, ownerSpaceId: OWNER_SPACE },
    grants: [],
    partners,
    actor: { profileId: 'staff-1' },
    venueSpaceId: staffVenueSpaceIds[0] ?? null,
    staffVenueSpaceIds,
  }
}

/** A Trail with three venues. Runs r1..r12; the cafe is stop `a`, the bookshop stop `b`, the owner's Space stop `c`. */
function fixture(): ReportFacts {
  const bindings = [
    { versionId: 'v1', missionKey: 'a', placementId: 'p-cafe', venueSpaceId: CAFE },
    { versionId: 'v1', missionKey: 'b', placementId: 'p-books', venueSpaceId: BOOKS },
    { versionId: 'v1', missionKey: 'c', placementId: 'p-own', venueSpaceId: OWNER_SPACE },
    // The same stop key in an older version pointed at the bookshop: a claim is read through ITS version.
    { versionId: 'v0', missionKey: 'a', placementId: 'p-cafe', venueSpaceId: BOOKS },
  ]
  const runs = Array.from({ length: 12 }, (_, i) => ({ id: `r${i + 1}`, state: i < 6 ? 'completed' : i < 11 ? 'active' : 'withdrawn' }))
  const claim = (runId: string, missionKey: string, placementId: string, over: Partial<ReportFacts['claims'][number]> = {}) => ({
    runId, versionId: 'v1', missionKey, state: 'accepted', assurance: 'signed_node', placementId, heldVenueSpaceId: null, ...over,
  })
  const claims = [
    ...runs.slice(0, 10).map((r) => claim(r.id, 'a', 'p-cafe')),
    claim('r11', 'a', 'p-cafe', { assurance: 'staff' }),
    claim('r12', 'a', 'p-cafe', { state: 'rejected' }),
    claim('r12', 'a', 'p-cafe', { state: 'needs_review', heldVenueSpaceId: CAFE }),
    claim('r1', 'a', 'p-cafe', { state: 'reversed' }),
    claim('r9', 'a', 'p-cafe', { versionId: 'v0' }),
    ...runs.slice(0, 3).map((r) => claim(r.id, 'b', 'p-books')),
    ...runs.slice(0, 7).map((r) => claim(r.id, 'c', 'p-own', { assurance: 'event_door' })),
  ]
  const rewards = [{ id: 'rw-coffee', title: 'Free coffee', kind: 'perk' }, { id: 'rw-badge', title: '=cmd|badge', kind: 'badge' }]
  const grants = [
    ...Array.from({ length: 4 }, () => ({ rewardId: 'rw-coffee', state: 'redeemed', redeemedVenueSpaceId: CAFE })),
    { rewardId: 'rw-coffee', state: 'redeemed', redeemedVenueSpaceId: BOOKS },
    { rewardId: 'rw-coffee', state: 'redeemed', redeemedVenueSpaceId: null },
    { rewardId: 'rw-coffee', state: 'granted', redeemedVenueSpaceId: null },
    { rewardId: 'rw-coffee', state: 'revoked', redeemedVenueSpaceId: null },
    { rewardId: 'rw-coffee', state: 'expired', redeemedVenueSpaceId: null },
    { rewardId: 'rw-badge', state: 'granted', redeemedVenueSpaceId: null },
    { rewardId: 'rw-badge', state: 'granted', redeemedVenueSpaceId: null },
  ]
  return { claims, bindings, runs, rewards, grants }
}

const roster = (n: number): RosterRow[] => Array.from({ length: n }, (_, i) => ({ profileId: `profile-${i}`, consentVersion: 'v1', optedInAt: '2026-11-10T08:30:00Z', firstHuntId: i === 0 ? HUNT : null }))

describe('small-cell rules', () => {
  it('hides a cross-venue count under the floor and rounds the rest down', () => {
    expect(SMALL_CELL).toBe(5)
    expect([0, 1, 4, 5, 9, 10, 23].map(coarse)).toEqual([null, null, null, 5, 5, 10, 20])
  })

  it('shows a split whole or not at all', () => {
    expect(wholeSplit({ a: 6, b: 5, c: 0 })).toEqual({ a: 6, b: 5, c: 0 })
    expect(wholeSplit({ a: 6, b: 4, c: 0 })).toBeNull()
    expect(wholeSplit({ a: 1, b: 0, c: 0 })).toBeNull()
  })

  it('leaves no small part that subtraction from the exact total can recover', () => {
    // Everything a reader holds for a withheld split is its exact total. For every total, each part
    // that is small somewhere takes at least two different values among the splits that total hides.
    const N = 24
    const hidden = new Map<number, number[][]>()
    for (let a = 0; a <= N; a++) for (let b = 0; a + b <= N; b++) for (let c = 0; a + b + c <= N; c++) {
      if (wholeSplit({ a, b, c }) !== null) continue
      hidden.set(a + b + c, [...(hidden.get(a + b + c) ?? []), [a, b, c]])
    }
    expect(hidden.size).toBe(N)
    for (const splits of hidden.values()) {
      for (const index of [0, 1, 2]) expect(new Set(splits.map((s) => s[index])).size).toBeGreaterThan(1)
    }
  })
})

describe('totals reconcile to claims and grants', () => {
  it('counts the cafe from its own claim rows and nobody else\'s', () => {
    const facts = fixture()
    const r = buildMerchantReport(facts, CAFE, 'partner', 3)
    const mine = facts.claims.filter((c) => c.state === 'accepted' && c.versionId === 'v1' && c.placementId === 'p-cafe')
    expect(r.visits.total).toBe(mine.length)
    expect(r.visits.total).toBe(11)
    expect(Object.values(r.visits.byAssurance).reduce((a, b) => a + b, 0)).toBe(r.visits.total)
    expect(r.visits.byAssurance).toEqual({ none: 0, signed_node: 10, staff: 1, event_door: 0 })
    expect(r.visits.visitors).toBe(new Set(mine.map((c) => c.runId)).size)
    expect(r.visits.awaitingReview).toBe(1)
    expect(r.contacts).toBe(3)
  })

  it('reads a claim through the version it was made on', () => {
    const r = buildMerchantReport(fixture(), BOOKS, 'partner', 0)
    // Three v1 stops at the bookshop plus the one v0 claim whose version bound that placement to it.
    expect(r.visits.total).toBe(4)
  })

  it('every venue total sums to the accepted claims, with none counted twice', () => {
    const facts = fixture()
    const totals = [CAFE, BOOKS, OWNER_SPACE].map((v) => buildMerchantReport(facts, v, 'owner_space', 0).visits.total)
    expect(totals.reduce((a, b) => a + b, 0)).toBe(facts.claims.filter((c) => c.state === 'accepted').length)
  })

  it('gives the Hunt\'s own Space exact grant totals that add up', () => {
    const facts = fixture()
    const r = buildMerchantReport(facts, OWNER_SPACE, 'owner_space', 0)
    expect(r.grants).toEqual({ issued: 11, open: 3, redeemed: 6, cancelled: 1, expired: 1 })
    expect(r.grants.issued).toBe(facts.grants.length)
    expect((r.grants.open ?? 0) + (r.grants.redeemed ?? 0) + (r.grants.cancelled ?? 0) + (r.grants.expired ?? 0)).toBe(r.grants.issued)
    expect(r.offers.map((o) => o.issued).reduce<number>((a, b) => a + (b ?? 0), 0)).toBe(facts.grants.length)
  })

  it('counts hand-overs at each counter exactly, and they never exceed the redeemed grants', () => {
    const facts = fixture()
    const here = [CAFE, BOOKS, OWNER_SPACE].map((v) => buildMerchantReport(facts, v, 'partner', 0))
    expect(here.map((r) => r.redeemedHere)).toEqual([4, 1, 0])
    for (const r of here) expect(r.offers.reduce((a, o) => a + o.redeemedHere, 0)).toBe(r.redeemedHere)
    // One grant was handed over by a Trail role holder with no venue: it belongs to no counter.
    expect(here.reduce((a, r) => a + r.redeemedHere, 0)).toBe(facts.grants.filter((g) => g.state === 'redeemed' && g.redeemedVenueSpaceId).length)
  })

  it('coarsens Hunt-wide totals for a partner and withholds a small split', () => {
    const r = buildMerchantReport(fixture(), CAFE, 'partner', 0)
    expect(r.grants).toEqual({ issued: 10, open: null, redeemed: 5, cancelled: null, expired: null })
    expect(r.offers).toEqual([
      { title: 'Free coffee', kind: 'perk', issued: 5, redeemedHere: 4 },
      { title: '=cmd|badge', kind: 'badge', issued: null, redeemedHere: 0 },
    ])
    // Cafe visitors: r1..r11. Six finished and five are still playing, so the split is whole.
    expect(r.onward).toEqual({ finished: 6, still_playing: 5, stopped: 0 })
    // Bookshop visitors: r1..r3 and r9. Too few to split.
    expect(buildMerchantReport(fixture(), BOOKS, 'partner', 0).onward).toBeNull()
  })
})

describe('who may read', () => {
  it('gives standing to current staff of the owner Space and of an active partner', () => {
    expect(venueStanding(standing([OWNER_SPACE]), OWNER_SPACE, NOW)).toBe('owner_space')
    expect(venueStanding(standing([CAFE]), CAFE, NOW)).toBe('partner')
  })

  it('refuses a revoked staff member, a revoked or pending partner, and another Space', () => {
    // Removed from the Space: the fresh read no longer lists it.
    expect(venueStanding(standing([]), CAFE, NOW)).toBeNull()
    expect(venueStanding(standing([CAFE], [partner(CAFE, { revokedAt: '2026-11-16T11:59:00Z' })]), CAFE, NOW)).toBeNull()
    expect(venueStanding(standing([CAFE], [partner(CAFE, { status: 'suspended' })]), CAFE, NOW)).toBeNull()
    expect(venueStanding(standing([CAFE], [partner(CAFE, { effectiveAt: '2026-12-01T00:00:00Z' })]), CAFE, NOW)).toBeNull()
    expect(venueStanding(standing([CAFE]), BOOKS, NOW)).toBeNull()
    expect(venueStanding(standing([CAFE]), OWNER_SPACE, NOW)).toBeNull()
    // Staff of a Space that is no venue of this Trail.
    expect(venueStanding(standing(['space-elsewhere']), 'space-elsewhere', NOW)).toBeNull()
    expect(venueStanding({ ...standing([CAFE]), actor: { profileId: null } }, CAFE, NOW)).toBeNull()
  })

  function deps(facts: StationFacts | null): ReportDeps & { loadFacts: ReturnType<typeof vi.fn>; loadRoster: ReturnType<typeof vi.fn> } {
    return {
      loadStanding: vi.fn(async () => facts),
      loadFacts: vi.fn(async () => fixture()),
      loadRoster: vi.fn(async (spaceId: string) => (spaceId === CAFE ? roster(2) : roster(7))),
    }
  }

  it('reads nothing for a revoked staff member', async () => {
    const d = deps(standing([]))
    expect(await readMerchantReport(d, { profileId: 'staff-1', huntId: HUNT, venueSpaceId: CAFE, nowEpoch: NOW })).toEqual({ ok: false, reason: 'not_permitted' })
    expect(d.loadFacts).not.toHaveBeenCalled()
    expect(d.loadRoster).not.toHaveBeenCalled()
  })

  it('refuses a cross-Space export and never reads the other Space\'s roster', async () => {
    const d = deps(standing([CAFE]))
    expect(await readMerchantReport(d, { profileId: 'staff-1', huntId: HUNT, venueSpaceId: BOOKS, nowEpoch: NOW })).toEqual({ ok: false, reason: 'not_permitted' })
    expect(d.loadFacts).not.toHaveBeenCalled()
    expect(d.loadRoster).not.toHaveBeenCalled()

    const own = await readMerchantReport(d, { profileId: 'staff-1', huntId: HUNT, venueSpaceId: CAFE, nowEpoch: NOW })
    expect(own.ok && own.report.contacts).toBe(2)
    expect(d.loadRoster.mock.calls).toEqual([[CAFE]])
  })

  it('refuses a signed-out caller and an unreadable Hunt the same way', async () => {
    const signedOut = deps(standing([CAFE]))
    expect((await readMerchantReport(signedOut, { profileId: null, huntId: HUNT, venueSpaceId: CAFE, nowEpoch: NOW })).ok).toBe(false)
    expect(signedOut.loadStanding).not.toHaveBeenCalled()
    expect((await readMerchantReport(deps(null), { profileId: 'staff-1', huntId: HUNT, venueSpaceId: CAFE, nowEpoch: NOW })).ok).toBe(false)
  })
})

describe('exports', () => {
  it('defuses formulas and quotes separators', () => {
    expect(csvCell('=cmd|badge')).toBe("'=cmd|badge")
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('Tea, "hot"')).toBe('"Tea, ""hot"""')
    expect(csvCell(12)).toBe('12')
  })

  it('writes the report with withheld cells in words, never a hidden number', () => {
    const file = merchantReportCsv(buildMerchantReport(fixture(), CAFE, 'partner', 2))
    expect(file).toContain('Stops here,Confirmed stops,11\r\n')
    expect(file).toContain('Rewards,Issued on this Trail,10 or more\r\n')
    expect(file).toContain(`Rewards,Not yet used,Fewer than ${SMALL_CELL}\r\n`)
    expect(file).toContain("Offer,'=cmd|badge: issued,Fewer than 5\r\n")
    expect(file).toContain('Contacts,Opted in to hear from you,2\r\n')
    expect(merchantReportCsv(buildMerchantReport(fixture(), BOOKS, 'partner', 0))).toContain('Your players,What they did next,Not enough players yet')
  })

  it('exports contacts with a per-Space reference and no profile id, name or address', () => {
    const rows = roster(2)
    const cafe = contactsCsv(CAFE, HUNT, rows)
    const books = contactsCsv(BOOKS, HUNT, rows)
    const lines = cafe.trim().split('\r\n')
    expect(lines[0]).toBe('contact_ref,consent_version,opted_in_on,first_met_on_this_trail')
    expect(lines[1]).toMatch(/^[0-9a-f]{16},v1,2026-11-10,yes$/)
    expect(lines[2]).toMatch(/^[0-9a-f]{16},v1,2026-11-10,no$/)
    expect(cafe).not.toMatch(/profile-|@/)
    // The same person has a different reference in each Space's file, so two files cannot be joined.
    expect(books.split('\r\n')[1].split(',')[0]).not.toBe(lines[1].split(',')[0])
  })
})
