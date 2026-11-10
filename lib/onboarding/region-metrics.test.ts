import { describe, expect, it } from 'vitest'
import { chosenAreaOf, computeRegionMetrics, placeOf, regionMetricsCsv } from './region-metrics'

const NOW = new Date('2026-11-10T12:00:00Z')
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString()

describe('placeOf', () => {
  it('lets a chosen area win over the city', () => {
    expect(placeOf('temecula', 'Oceanside')).toEqual({ region: 'inland-north', area: 'temecula' })
  })
  it('matches cities loosely, and plain San Diego to the region only', () => {
    expect(placeOf(null, '  Cardiff By The Sea, CA')).toEqual({ region: 'north-county-sd', area: 'encinitas' })
    expect(placeOf(null, 'San Diego')).toEqual({ region: 'san-diego', area: null })
    expect(placeOf(null, 'Phoenix')).toEqual({ region: null, area: null })
  })
})

describe('computeRegionMetrics', () => {
  it('counts hosts over 28 days back and 14 ahead, events ahead, coverage at 4 Channels, and weekly members', () => {
    const channels = ['movement', 'meditation', 'creative', 'food']
    const events = [
      // Oceanside: 4 Channels in the next 14 days, so covered.
      ...channels.map((c, i) => ({ startsAt: inDays(i + 1), hostId: `h${i}`, city: 'Oceanside', channel: c })),
      // Vista: 3 Channels, not covered.
      ...channels.slice(0, 3).map((c) => ({ startsAt: inDays(2), hostId: 'h9', city: 'Vista', channel: c })),
      // A past event: its host counts, the event does not.
      { startsAt: inDays(-10), hostId: 'h20', city: 'Carlsbad', channel: 'movement' },
      // Too old, and too far ahead: ignored.
      { startsAt: inDays(-40), hostId: 'h21', city: 'Carlsbad', channel: 'movement' },
      { startsAt: inDays(20), hostId: 'h22', city: 'Carlsbad', channel: 'movement' },
      // A host who chose Temecula pulls the event there whatever the city says.
      { startsAt: inDays(3), hostId: 'h30', city: 'Oceanside', channel: 'movement' },
    ]
    const rows = computeRegionMetrics({
      now: NOW,
      events,
      hostAreas: new Map([['h30', 'temecula']]),
      weeklyMembers: [
        { city: 'Escondido', chosenArea: null },
        { city: 'Phoenix', chosenArea: 'irvine' },
        { city: 'Phoenix', chosenArea: null },
      ],
    })
    expect(rows).toEqual([
      { territory_id: 'north-county-sd', hosts_active_28d: 6, events_next_14d: 7, sub_areas_covered_14d: 1, wam: 1 },
      { territory_id: 'orange-county', hosts_active_28d: 0, events_next_14d: 0, sub_areas_covered_14d: 0, wam: 1 },
      { territory_id: 'inland-north', hosts_active_28d: 1, events_next_14d: 1, sub_areas_covered_14d: 0, wam: 0 },
      { territory_id: 'san-diego', hosts_active_28d: 0, events_next_14d: 0, sub_areas_covered_14d: 0, wam: 0 },
    ])
  })
})

describe('regionMetricsCsv', () => {
  it('writes the exact header FlowWeb requires, one row per region', () => {
    const csv = regionMetricsCsv(computeRegionMetrics({ now: NOW, events: [], hostAreas: new Map(), weeklyMembers: [] }))
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('territory_id,hosts_active_28d,events_next_14d,sub_areas_covered_14d,wam')
    expect(lines.slice(1).map((l) => l.split(',')[0])).toEqual(['north-county-sd', 'orange-county', 'inland-north', 'san-diego'])
    expect(lines[1]).toBe('north-county-sd,0,0,0,0')
  })
})

describe('chosenAreaOf', () => {
  it('reads the host form first, then the invite link, and ignores unknown ids', () => {
    expect(chosenAreaOf({ host: { area: 'vista' }, funnel: { area: 'irvine' } })).toBe('vista')
    expect(chosenAreaOf({ funnel: { area: 'irvine' } })).toBe('irvine')
    expect(chosenAreaOf({ funnel: { area: 'atlantis' } })).toBeNull()
    expect(chosenAreaOf(null)).toBeNull()
  })
})
