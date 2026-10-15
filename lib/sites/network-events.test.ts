import { describe, expect, it } from 'vitest'
import { filterNetworkEvents, networkChapterLabel, networkEventAvailability, networkMonthDays, networkMonthOffset } from './network-events'

describe('Network public calendar filters', () => {
  const rows = [{ day: '2026-10-16', chapter: 'Encinitas' }, { day: '2026-10-20', chapter: 'North Park' }, { day: '2026-10-20', chapter: 'Encinitas' }]
  it('combines chapter and day and retains all rows on reset', () => {
    expect(filterNetworkEvents(rows, 'Encinitas', '2026-10-20')).toEqual([rows[2]])
    expect(filterNetworkEvents(rows, 'North Park', '2026-10-16')).toEqual([])
    expect(filterNetworkEvents(rows, null, null)).toEqual(rows)
  })
  it('draws a complete calendar including a six-row month and leap day', () => {
    expect(networkMonthDays('2026-08')).toHaveLength(42)
    expect(networkMonthDays('2028-02')).toContain('2028-02-29')
    expect(networkMonthDays('2026-10')[0]).toBe('2026-09-27')
  })
  it('navigates across year boundaries without dropping a month', () => {
    expect(networkMonthOffset('2026-12', 1)).toBe('2027-01')
    expect(networkMonthOffset('2027-01', -1)).toBe('2026-12')
  })
  it('uses canonical host IDs over ambiguous words and refuses unknown configured hosts', () => {
    const chapters = [{ label: 'Veterans', match: ['veteran'], spaceId: 'veterans-id' }, { label: 'Oceanside', match: ['oceanside'], spaceId: 'oceanside-id' }]
    expect(networkChapterLabel({ title: 'Oceanside gathering', hostingSpaceId: 'veterans-id' }, chapters)).toBe('Veterans')
    expect(networkChapterLabel({ title: 'Oceanside gathering', hostingSpaceId: 'unknown' }, chapters)).toBeNull()
    expect(networkChapterLabel({ title: 'Veteran conversation', location: 'Oceanside' }, chapters)).toBe('Veterans')
    expect(networkChapterLabel({ title: 'Oceanside veteran conversation' }, chapters)).toBeNull()
  })
  it('never advertises an ended or invalid event as next while preserving valid ongoing windows', () => {
    expect(networkEventAvailability({ startsAtInstant: 100, endsAtInstant: 200 }, 250)).toBe('ended')
    expect(networkEventAvailability({ startsAtInstant: 100, endsAtInstant: 300 }, 250)).toBe('ongoing')
    expect(networkEventAvailability({ startsAtInstant: 300, endsAtInstant: 400 }, 250)).toBe('future')
    expect(networkEventAvailability({ startsAtInstant: 100, endsAtInstant: null }, 250)).toBe('ended')
    expect(networkEventAvailability({ startsAtInstant: null, endsAtInstant: null }, 250)).toBe('ended')
  })
})
