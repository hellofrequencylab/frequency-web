import { describe, it, expect } from 'vitest'
import { arrivalNames, newArrivals, type ArrivalMember } from './arrivals'

const member = (id: string, joined: string, name = id): ArrivalMember => ({
  joined_at: joined,
  profile: { id, display_name: name, handle: id, avatar_url: null },
})

const SINCE = '2026-09-03T00:00:00Z'

describe('newArrivals', () => {
  it('keeps only people inside the window', () => {
    const out = newArrivals(
      [member('new', '2026-09-10T00:00:00Z'), member('old', '2026-03-01T00:00:00Z')],
      SINCE,
    )
    expect(out.map((a) => a.id)).toEqual(['new'])
  })

  it('orders most recent first', () => {
    const out = newArrivals(
      [
        member('a', '2026-09-05T00:00:00Z'),
        member('c', '2026-09-15T00:00:00Z'),
        member('b', '2026-09-10T00:00:00Z'),
      ],
      SINCE,
    )
    expect(out.map((a) => a.id)).toEqual(['c', 'b', 'a'])
  })

  it('never includes the viewer, so nobody is told to greet themselves', () => {
    const out = newArrivals(
      [member('me', '2026-09-10T00:00:00Z'), member('them', '2026-09-11T00:00:00Z')],
      SINCE,
      { excludeProfileId: 'me' },
    )
    expect(out.map((a) => a.id)).toEqual(['them'])
  })

  it('caps at three by default and honours an explicit limit', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      member(`p${i}`, `2026-09-1${i % 9}T00:00:00Z`),
    )
    expect(newArrivals(many, SINCE)).toHaveLength(3)
    expect(newArrivals(many, SINCE, { limit: 5 })).toHaveLength(5)
  })

  // It names people out loud. A row it cannot date is worse than a row it drops.
  it('drops rows it cannot date rather than guessing', () => {
    const out = newArrivals(
      [member('junk', 'not-a-date'), member('good', '2026-09-10T00:00:00Z')],
      SINCE,
    )
    expect(out.map((a) => a.id)).toEqual(['good'])
  })

  it('is empty for an unparseable window rather than admitting everyone', () => {
    expect(newArrivals([member('a', '2026-09-10T00:00:00Z')], 'nonsense')).toEqual([])
  })

  it('survives a roster row with no profile', () => {
    const broken = { joined_at: '2026-09-10T00:00:00Z', profile: undefined } as unknown as ArrivalMember
    expect(newArrivals([broken, member('ok', '2026-09-10T00:00:00Z')], SINCE)).toHaveLength(1)
  })
})

describe('arrivalNames', () => {
  const a = (name: string) => ({ id: name, displayName: name, handle: name, avatarUrl: null })

  it('handles one, two and three names', () => {
    expect(arrivalNames([a('Sam')])).toBe('Sam')
    expect(arrivalNames([a('Sam'), a('Alex')])).toBe('Sam and Alex')
    expect(arrivalNames([a('Sam'), a('Alex'), a('Jo')])).toBe('Sam, Alex and Jo')
  })

  it('counts the rest instead of printing them', () => {
    expect(arrivalNames([a('Sam'), a('Alex')], 4)).toBe('Sam, Alex and 4 others')
    expect(arrivalNames([a('Sam'), a('Alex')], 1)).toBe('Sam, Alex and 1 other')
  })

  it('does not add an "and" clause for zero extras', () => {
    expect(arrivalNames([a('Sam'), a('Alex')], 0)).toBe('Sam and Alex')
  })

  it('is empty with nobody to name', () => {
    expect(arrivalNames([])).toBe('')
    expect(arrivalNames([], 3)).toBe('')
  })
})
