import { describe, it, expect } from 'vitest'
import { computeUserHasEvents, countFacetOptions, dateRangeWindow, type FacetKey } from './index-data'

describe('This weekend uses community wall-clock days', () => {
  it.each([
    ['Friday', '2026-10-16T19:00:00Z', '2026-10-17', '2026-10-18'],
    ['Saturday', '2026-10-17T19:00:00Z', '2026-10-17', '2026-10-18'],
    ['Sunday', '2026-10-18T19:00:00Z', '2026-10-18', '2026-10-18'],
    ['Monday', '2026-10-19T19:00:00Z', '2026-10-24', '2026-10-25'],
    // UTC has advanced to Monday; the community is still on Sunday evening.
    ['Sunday evening', '2026-10-19T02:00:00Z', '2026-10-18', '2026-10-18'],
    ['DST Sunday', '2026-11-02T03:00:00Z', '2026-11-01', '2026-11-01'],
  ])('%s includes only the remaining weekend', (_label, now, from, to) => {
    const window = dateRangeWindow('weekend', new Date(now))!
    expect(window.from.toISOString()).toBe(`${from}T00:00:00.000Z`)
    expect(window.to.toISOString()).toBe(`${to}T23:59:59.999Z`)
    // Stored event timestamps carry the event's local wall-clock parts as UTC.
    const nextMonday = new Date(`${to}T00:00:00Z`)
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 1)
    expect(nextMonday.getTime()).toBeGreaterThan(window.to.getTime())
  })
})

// The Manage + My drafts actions on the member's own /events home appear ONLY once the member has
// added an event (owner rule). computeUserHasEvents is the pure gate over the head-count of events
// they host or posted; it must be FAIL-SAFE (a null count reads as "none", hiding the actions).
describe('computeUserHasEvents', () => {
  it('is true when the member hosts or posted at least one event', () => {
    expect(computeUserHasEvents(1)).toBe(true)
    expect(computeUserHasEvents(5)).toBe(true)
  })

  it('is false when the member has added no events', () => {
    expect(computeUserHasEvents(0)).toBe(false)
  })

  it('fails safe to false on a null count (read error / unknown)', () => {
    expect(computeUserHasEvents(null)).toBe(false)
  })
})

// The counts beside every category tab and facet option (Frequency body). Each one is "the cards
// the list would draw with this option chosen and every other active facet as it stands", so the
// helper must hold the OTHER facets while it swaps the one it is counting, and count with the
// caller's own counter (the list's series fold), never a raw row length.
describe('countFacetOptions', () => {
  type Row = { id: string; cat: string; fmt: string }
  const rows: Row[] = [
    { id: 'a', cat: 'social', fmt: 'online' },
    { id: 'b', cat: 'social', fmt: 'in_person' },
    { id: 'c', cat: 'movement', fmt: 'in_person' },
  ]
  const active: Partial<Record<FacetKey, string>> = { format: 'in_person' }
  const passes = (r: Row, over: { key: FacetKey; value: string | null }) => {
    const v = (k: FacetKey) => (over.key === k ? over.value : active[k])
    const cat = v('category')
    const fmt = v('format')
    return (!cat || r.cat === cat) && (!fmt || r.fmt === fmt)
  }

  it('counts each option against the other facets as they stand, and the cleared facet as ""', () => {
    const out = countFacetOptions(
      rows,
      [
        { key: 'category', values: ['social', 'movement', 'retreat'] },
        { key: 'format', values: ['online', 'in_person'] },
      ],
      passes,
      (rs) => rs.length,
    )
    expect(out.category).toEqual({ '': 2, social: 1, movement: 1, retreat: 0 })
    expect(out.format).toEqual({ '': 3, online: 1, in_person: 2 })
  })

  it('counts with the caller counter (the series fold), not the raw rows', () => {
    const out = countFacetOptions(rows, [{ key: 'category', values: ['social'] }], passes, () => 7)
    expect(out.category.social).toBe(7)
  })
})
