import { describe, it, expect } from 'vitest'
import { matchesFacets, type MemberSummary } from '@/lib/people/member-viewer'
import { rsvpStatusByProfileId, withRsvpBadges, RSVP_FACET } from './crm-roster'

// The PURE half of the Message Attendees roster (CRM Everywhere plan 3.2): raw event_rsvps rows
// into the going/maybe status map, and the namespaced rsvp:* badge append the viewer's facet
// filter reads. The IO half (admin-client reads) stays fail-safe by construction and is not
// unit-tested here, per the roster-module convention.

function member(over: Partial<MemberSummary>): MemberSummary {
  return {
    id: 'p1',
    handle: 'ada',
    displayName: 'Ada Lovelace',
    ...over,
  }
}

describe('rsvpStatusByProfileId', () => {
  it('keeps going and maybe rows, keyed by profile id', () => {
    const map = rsvpStatusByProfileId([
      { profile_id: 'p1', status: 'going' },
      { profile_id: 'p2', status: 'maybe' },
    ])
    expect(map.get('p1')).toBe('going')
    expect(map.get('p2')).toBe('maybe')
    expect(map.size).toBe(2)
  })

  it('drops waitlist, declined, junk statuses, and rows without a profile id', () => {
    const map = rsvpStatusByProfileId([
      { profile_id: 'p1', status: 'waitlist' },
      { profile_id: 'p2', status: 'declined' },
      { profile_id: 'p3', status: 42 },
      { profile_id: '', status: 'going' },
      { profile_id: null, status: 'maybe' },
      { status: 'going' },
    ])
    expect(map.size).toBe(0)
  })

  it('keeps the FIRST standing when a profile id repeats, and survives null/undefined input', () => {
    const map = rsvpStatusByProfileId([
      { profile_id: 'p1', status: 'going' },
      { profile_id: 'p1', status: 'maybe' },
    ])
    expect(map.get('p1')).toBe('going')
    expect(rsvpStatusByProfileId(null).size).toBe(0)
    expect(rsvpStatusByProfileId(undefined).size).toBe(0)
  })
})

describe('withRsvpBadges', () => {
  it('appends the namespaced rsvp token after the existing badges', () => {
    const statusById = new Map([['p1', 'going' as const]])
    const [row] = withRsvpBadges([member({ badges: ['resonant', 'role:host'] })], statusById)
    expect(row.badges).toEqual(['resonant', 'role:host', 'rsvp:going'])
  })

  it('badges a row with no badges yet, and leaves an unknown row untouched', () => {
    const statusById = new Map([['p1', 'maybe' as const]])
    const rows = withRsvpBadges(
      [member({ id: 'p1' }), member({ id: 'p2', badges: ['cooling'] })],
      statusById,
    )
    expect(rows[0].badges).toEqual(['rsvp:maybe'])
    expect(rows[1].badges).toEqual(['cooling'])
  })

  it('writes tokens the RSVP facet actually filters on (matchesFacets round-trip)', () => {
    const statusById = new Map([
      ['p1', 'going' as const],
      ['p2', 'maybe' as const],
    ])
    const [going, maybe] = withRsvpBadges([member({ id: 'p1' }), member({ id: 'p2' })], statusById)
    const goingValue = RSVP_FACET.options[0].value
    const maybeValue = RSVP_FACET.options[1].value
    expect(matchesFacets(going, { [RSVP_FACET.key]: goingValue })).toBe(true)
    expect(matchesFacets(going, { [RSVP_FACET.key]: maybeValue })).toBe(false)
    expect(matchesFacets(maybe, { [RSVP_FACET.key]: maybeValue })).toBe(true)
  })
})
