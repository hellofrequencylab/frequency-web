import { describe, it, expect } from 'vitest'
import { summarizeCheckins, checkinMedium, type CheckinRow } from './checkin-stats'

const NOW = new Date('2026-10-20T12:00:00Z')
const at = (day: string) => `${day}T10:00:00Z`

describe('checkinMedium', () => {
  it('reads context.medium on new rows', () => {
    expect(checkinMedium({ source: 'qr', context: { nodeId: 'n', medium: 'nfc' } })).toBe('nfc')
    expect(checkinMedium({ source: 'qr', context: { nodeId: 'n', medium: 'device' } })).toBe('device')
  })

  it('falls back to source on legacy rows', () => {
    expect(checkinMedium({ source: 'nfc', context: { nodeId: 'n' } })).toBe('nfc')
    expect(checkinMedium({ source: 'qr', context: { nodeId: 'n' } })).toBe('qr')
    expect(checkinMedium({ source: 'beacon', context: null })).toBe('qr')
  })

  it('drops geo captures', () => {
    expect(checkinMedium({ source: 'geo', context: { nodeId: 'n', medium: 'qr' } })).toBeNull()
  })
})

describe('summarizeCheckins', () => {
  it('counts legacy, nfc and device rows and excludes geo', () => {
    const rows: CheckinRow[] = [
      { source: 'qr', context: { nodeId: 'a' }, created_at: at('2026-10-19') }, // legacy qr
      { source: 'nfc', context: { nodeId: 'a' }, created_at: at('2026-10-19') }, // legacy nfc
      { source: 'qr', context: { nodeId: 'a', medium: 'device', spaceId: null }, created_at: at('2026-10-20') },
      { source: 'nfc', context: { nodeId: 'a', medium: 'nfc', spaceId: null }, created_at: at('2026-10-20') },
      { source: 'geo', context: { nodeId: 'g' }, created_at: at('2026-10-20') }, // excluded
    ]
    const s = summarizeCheckins(rows, 30, NOW)
    expect(s.total).toBe(4)
    expect(s.byMedium).toEqual({ qr: 1, nfc: 2, device: 1 })
    expect(s.perSpace).toEqual([])
  })

  it('seeds zero daily buckets and counts in-window rows', () => {
    const rows: CheckinRow[] = [
      { source: 'qr', context: { medium: 'qr' }, created_at: at('2026-10-20') },
      { source: 'qr', context: { medium: 'qr' }, created_at: at('2026-10-20') },
      { source: 'qr', context: { medium: 'qr' }, created_at: at('2026-01-01') }, // outside window
    ]
    const s = summarizeCheckins(rows, 7, NOW)
    expect(s.daily).toHaveLength(7)
    expect(s.daily[0]).toEqual({ date: '2026-10-14', count: 0 })
    expect(s.daily[6]).toEqual({ date: '2026-10-20', count: 2 })
    expect(s.total).toBe(3)
  })

  it('groups per Space by medium, busiest first', () => {
    const rows: CheckinRow[] = [
      { source: 'qr', context: { medium: 'qr', spaceId: 's1' }, created_at: at('2026-10-20') },
      { source: 'nfc', context: { medium: 'nfc', spaceId: 's2' }, created_at: at('2026-10-20') },
      { source: 'nfc', context: { medium: 'nfc', spaceId: 's2' }, created_at: at('2026-10-20') },
      { source: 'qr', context: { medium: 'device', spaceId: 's2' }, created_at: at('2026-10-20') },
      { source: 'geo', context: { medium: 'qr', spaceId: 's1' }, created_at: at('2026-10-20') }, // excluded
    ]
    const s = summarizeCheckins(rows, 30, NOW)
    expect(s.perSpace).toEqual([
      { spaceId: 's2', total: 3, qr: 0, nfc: 2, device: 1 },
      { spaceId: 's1', total: 1, qr: 1, nfc: 0, device: 0 },
    ])
  })
})
