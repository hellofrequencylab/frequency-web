import { describe, expect, it } from 'vitest'
import { createSpaceFunnel, formatMedian, median, nameToSavedMs } from './funnel'
import { CREATE_SPACE_SIGNALS } from './signal'

// LIVE-1970: the funnel the admin page shows, and the median the "12 minutes" claim rests on.

describe('createSpaceFunnel', () => {
  it('counts visits for the builder steps and members for the launch steps, without claiming conversion between populations', () => {
    const f = createSpaceFunnel([
      { eventType: 'createspace.view', events: 100, actors: 0 },
      { eventType: 'createspace.name_started', events: 60, actors: 0 },
      { eventType: 'createspace.accent_picked', events: 45, actors: 0 },
      { eventType: 'createspace.offer', events: 30, actors: 0 },
      { eventType: 'createspace.lead', events: 20, actors: 0 },
      { eventType: 'createspace.photos', events: 18, actors: 0 },
      { eventType: 'launch_started', events: 40, actors: 12 },
      { eventType: 'launch_completed', events: 9, actors: 9 },
    ])
    expect(f.map((s) => [s.eventType, s.actors, s.dropPct])).toEqual([
      ['createspace.view', 100, null],
      ['createspace.name_started', 60, null],
      ['createspace.accent_picked', 45, null],
      ['createspace.offer', 30, null],
      ['createspace.lead', 20, null],
      ['createspace.photos', 18, null],
      ['launch_started', 12, null],
      ['launch_completed', 9, null],
    ])
  })
  it('is all zeros with no drop when the ledger is empty', () => {
    const f = createSpaceFunnel([])
    expect(f).toHaveLength(8)
    expect(f.every((s) => s.actors === 0 && s.dropPct === null)).toBe(true)
  })
  it('only reads signals that exist', () => {
    const named = new Set<string>(CREATE_SPACE_SIGNALS)
    for (const s of createSpaceFunnel([])) if (s.eventType.startsWith('createspace.')) expect(named.has(s.eventType), s.eventType).toBe(true)
  })
})

describe('the median name-to-saved time', () => {
  it('is the middle of the handed-over drafts, from the first letter', () => {
    const rows = [
      { started_at: '2026-11-02T10:00:00Z', converted_at: '2026-11-02T10:11:00Z' },
      { started_at: '2026-11-02T10:00:00Z', converted_at: '2026-11-02T10:05:00Z' },
      { started_at: '2026-11-02T10:00:00Z', converted_at: '2026-11-02T10:20:00Z' },
      { started_at: null, converted_at: '2026-11-02T10:20:00Z' },
      { started_at: '2026-11-02T10:00:00Z', converted_at: null },
      { started_at: '2026-11-02T10:30:00Z', converted_at: '2026-11-02T10:20:00Z' },
    ]
    expect(nameToSavedMs(rows)).toEqual([660_000, 300_000, 1_200_000])
    expect(median(nameToSavedMs(rows))).toBe(660_000)
    expect(median([2, 4])).toBe(3)
    expect(median([])).toBeNull()
  })
  it('says it plainly', () => {
    expect(formatMedian(null)).toBe('no draft handed over yet')
    expect(formatMedian(48_000)).toBe('48 sec')
    expect(formatMedian(660_000)).toBe('11 min')
  })
})
