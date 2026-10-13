import { describe, it, expect } from 'vitest'
import { rankHomeEvents, slotFor, friendsLine, intentFor, wallNowMs, clockLabel, type HomeEventInput, type HomeHistory } from './home-rank'

// The Frequency home's ranker: each signal the design names either moves the order with a reason
// the member can read, or is absent because there is no data (see the header of home-rank.ts).

const NOW = Date.UTC(2026, 9, 12, 16, 20) // Monday 4:20pm, as wall-clock UTC parts
const at = (dayOffset: number, h: number, m = 0) => new Date(Date.UTC(2026, 9, 12 + dayOffset, h, m)).toISOString()

const empty: HomeHistory = { hostCounts: {}, spaceCounts: {}, hostNames: {}, weekdays: [], hours: [] }

function ev(over: Partial<HomeEventInput>): HomeEventInput {
  return {
    id: 'e',
    slug: 'e',
    title: 'Event',
    location: null,
    startsAt: at(1, 18),
    endsAt: null,
    category: null,
    energyTag: null,
    coverUrl: null,
    hostId: null,
    hostSpaceId: null,
    hostName: null,
    myCircleName: null,
    distanceMi: null,
    goingCount: 0,
    friends: [],
    myStatus: null,
    ...over,
  }
}

describe('slots', () => {
  it('a live event is Now, a later-today one is Tonight, then Tomorrow and This week', () => {
    expect(slotFor(at(0, 16), at(0, 18), NOW)).toMatchObject({ slot: 'now', live: true })
    expect(slotFor(at(0, 20), null, NOW)).toMatchObject({ slot: 'tonight', live: false })
    expect(slotFor(at(1, 6), null, NOW)).toMatchObject({ slot: 'tomorrow' })
    expect(slotFor(at(4, 6), null, NOW)).toMatchObject({ slot: 'week', dayOffset: 4 })
  })
  it('an ended event and one past the week drop out', () => {
    expect(slotFor(at(0, 10), at(0, 12), NOW)).toBeNull()
    expect(slotFor(at(9, 10), null, NOW)).toBeNull()
  })
})

describe('signals', () => {
  it('Can’t go removes an event; maybe keeps it', () => {
    const r = rankHomeEvents([ev({ id: 'a', myStatus: 'not_going' }), ev({ id: 'b', myStatus: 'maybe' })], empty, NOW)
    expect(r.map((e) => e.id)).toEqual(['b'])
  })

  it('friends going outrank a bare event, and the why names them', () => {
    const r = rankHomeEvents(
      [ev({ id: 'bare' }), ev({ id: 'friends', friends: [{ id: 'p1', name: 'Jonah Reyes', avatarUrl: null }, { id: 'p2', name: 'Priya Nair', avatarUrl: null }] })],
      empty,
      NOW,
    )
    expect(r[0]!.id).toBe('friends')
    expect(r[0]!.why).toContain('Jonah and Priya are going.')
  })

  it('closer ranks above farther, all else equal', () => {
    const r = rankHomeEvents([ev({ id: 'far', distanceMi: 12 }), ev({ id: 'near', distanceMi: 0.4 })], empty, NOW)
    expect(r[0]!.id).toBe('near')
  })

  it('past attendance with the host counts and says so', () => {
    const history: HomeHistory = { ...empty, hostCounts: { h1: 2 }, hostNames: { h1: 'Audrey' } }
    const r = rankHomeEvents([ev({ id: 'new' }), ev({ id: 'known', hostId: 'h1', hostName: 'Audrey' })], history, NOW)
    expect(r[0]!.id).toBe('known')
    expect(r[0]!.why).toContain('Audrey')
  })

  it('a Circle the member belongs to hosting is a badge and a reason', () => {
    const [e] = rankHomeEvents([ev({ myCircleName: 'Bird Rock Sunrise' })], empty, NOW)
    expect(e!.badge).toBe('Your Circle is hosting')
    expect(e!.why).toContain('Bird Rock Sunrise')
  })

  it('usual weekday lifts an event once there is enough history', () => {
    const tue = new Date(at(1, 18)).getUTCDay()
    const history: HomeHistory = { ...empty, weekdays: [tue, tue, tue, 0], hours: [18, 18, 18, 9] }
    const r = rankHomeEvents([ev({ id: 'other', startsAt: at(3, 9) }), ev({ id: 'usual', startsAt: at(1, 18) })], history, NOW)
    expect(r[0]!.id).toBe('usual')
  })
})

describe('copy', () => {
  it('friend lines read like the design', () => {
    expect(friendsLine([], 12, false)).toBe('12 going')
    expect(friendsLine([{ name: 'Ana Ruiz' }], 12, true)).toBe('Ana and 11 more here now')
    expect(friendsLine([{ name: 'Jonah' }, { name: 'Priya' }], 41, false)).toBe('Jonah, Priya and 39 more going')
    expect(friendsLine([{ name: 'A' }, { name: 'B' }, { name: 'C' }], 26, false)).toBe('A, B and 1 more friend going')
  })
  it('intent comes from the event’s own taxonomy', () => {
    expect(intentFor('movement', null)).toBe('move')
    expect(intentFor('service', null)).toBe('give')
    expect(intentFor(null, 'grounding')).toBe('sit')
    expect(intentFor(null, null)).toBeNull()
  })
  it('clock labels and the wall clock', () => {
    expect(clockLabel(at(0, 18))).toBe('6pm')
    expect(clockLabel(at(0, 19, 30))).toBe('7:30pm')
    const wall = wallNowMs(new Date(Date.UTC(2026, 9, 12, 23, 20)), 'America/Los_Angeles')
    expect(new Date(wall).getUTCHours()).toBe(16)
  })
})
