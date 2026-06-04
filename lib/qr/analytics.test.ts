import { describe, it, expect } from 'vitest'
import { summarizeScans, type ScanRow } from './analytics'

const NOW = new Date('2026-06-05T12:00:00Z')

function scan(codeId: string, profile: string | null, daysAgo: number): ScanRow {
  const d = new Date(NOW)
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return { qr_code_id: codeId, profile_id: profile, scanned_at: d.toISOString() }
}

describe('summarizeScans', () => {
  it('counts totals and de-dupes unique signed-in scanners', () => {
    const scans = [
      scan('a', 'p1', 0),
      scan('a', 'p1', 1), // same member, still 1 unique on code a
      scan('a', 'p2', 2),
      scan('a', null, 0), // anonymous — counts to total, not unique
    ]
    const s = summarizeScans(scans, 30, NOW)
    expect(s.total).toBe(4)
    expect(s.unique).toBe(2)
    expect(s.perCode.get('a')).toEqual({ codeId: 'a', total: 4, unique: 2 })
  })

  it('rolls unique members across codes', () => {
    const s = summarizeScans([scan('a', 'p1', 0), scan('b', 'p1', 0), scan('b', 'p2', 0)], 30, NOW)
    expect(s.unique).toBe(2) // p1 + p2, p1 counted once across codes
  })

  it('produces one daily bucket per day, zero-filled, oldest→newest', () => {
    const s = summarizeScans([scan('a', 'p1', 0), scan('a', 'p2', 0), scan('a', 'p1', 3)], 30, NOW)
    expect(s.daily).toHaveLength(30)
    expect(s.daily[29].count).toBe(2) // today
    expect(s.daily[26].count).toBe(1) // 3 days ago
    expect(s.daily[0].count).toBe(0) // 29 days ago, quiet
  })

  it('ignores scans outside the window for the daily series but not totals', () => {
    const s = summarizeScans([scan('a', 'p1', 100)], 30, NOW)
    expect(s.total).toBe(1)
    expect(s.daily.every((d) => d.count === 0)).toBe(true)
  })
})
