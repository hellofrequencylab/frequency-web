// FH-020Y: a resident Trail names a partner venue for a staff-confirmed stop.
import { describe, expect, it } from 'vitest'
import { remapChallenges } from './challenges'
import { canonicalContent, parseTrailDraft, publishChecklist, stopVenue } from './draft'
import { publishVenueBlocks } from './partners'

const CAFE = '00000000-0000-4000-a020-0000000000c1'
const BOOKS = '00000000-0000-4000-a020-0000000000b2'
const stop = (n: number, over: Record<string, unknown> = {}) => ({ place: `Place ${n}`, clue: `Clue ${n}`, placementReady: true, ...over })
const draft = (over: Record<string, unknown> = {}) => parseTrailDraft({
  title: 'Harbor walk', stops: [stop(1), stop(2, { staffConfirmed: true }), stop(3)], routeTestedAtRevision: 2, permissionConfirmed: true, ...over,
})

describe('parsing the venues a draft names', () => {
  it('keeps one well formed venue per real stop, and none at all when there are none', () => {
    const d = draft({ venues: [{ stop: 1, venueSpaceId: CAFE.toUpperCase() }, { stop: 1, venueSpaceId: BOOKS }, { stop: 7, venueSpaceId: BOOKS }, { stop: 0, venueSpaceId: 'not-a-space' }] })
    expect(d.venues).toEqual([{ stop: 1, venueSpaceId: CAFE }])
    expect(stopVenue(d, 1)).toBe(CAFE)
    expect(stopVenue(d, 0)).toBeNull()
    expect(draft()).not.toHaveProperty('venues')
  })

  it('moves a venue with its stop', () => {
    expect(remapChallenges([{ stop: 1, venueSpaceId: CAFE }], [1, 0, 2])).toEqual([{ stop: 0, venueSpaceId: CAFE }])
  })
})

describe('the publish checklist for a resident Trail', () => {
  const staffItem = (d: ReturnType<typeof draft>) => publishChecklist(d, 2, { venue: false }).items.find((i) => i.code === 'stop_staff_venue')

  it('refuses a staff-confirmed stop with no venue, in plain words', () => {
    expect(staffItem(draft())).toMatchObject({ ok: false, stop: 1, message: 'Staff can confirm visits only where a venue runs the stop. Pick a partner venue for this stop, or turn off staff confirming.' })
  })

  it('passes once that stop names a partner venue', () => {
    const d = draft({ venues: [{ stop: 1, venueSpaceId: CAFE }] })
    expect(staffItem(d)?.ok).toBe(true)
    expect(publishChecklist(d, 2, { venue: false }).ok).toBe(true)
  })

  it('leaves the content hash of a Trail with no venues as it was', () => {
    expect(canonicalContent(draft({ venues: [] }))).toBe(canonicalContent(draft()))
  })
})

describe('publish checks the named venue is a live partner', () => {
  const partner = (spaceId: string, over: Record<string, unknown> = {}) => ({
    huntId: 'hunt-1', spaceId, status: 'accepted' as const, effectiveAt: '2026-11-01T00:00:00Z', revokedAt: null, permittedRoles: ['operator'], ...over,
  })
  it('blocks a venue that is not a partner, or withdrew', () => {
    const now = '2026-11-18T12:00:00Z'
    expect(publishVenueBlocks({ huntId: 'hunt-1', ownerSpaceId: null, venueSpaceIds: [CAFE], partners: [partner(CAFE)], now })).toEqual([])
    expect(publishVenueBlocks({ huntId: 'hunt-1', ownerSpaceId: null, venueSpaceIds: [BOOKS], partners: [partner(CAFE)], now })).toEqual([BOOKS])
    expect(publishVenueBlocks({ huntId: 'hunt-1', ownerSpaceId: null, venueSpaceIds: [CAFE], partners: [partner(CAFE, { status: 'withdrawn', revokedAt: '2026-11-10T00:00:00Z' })], now })).toEqual([CAFE])
  })
})
