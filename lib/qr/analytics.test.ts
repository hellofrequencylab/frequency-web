import { describe, it, expect } from 'vitest'
import { summarizeScans, summarizeLocations, type ScanRow } from './analytics'

describe('summarizeLocations', () => {
  it('clusters nearby coords, counts, sorts desc, and drops rows without coords', () => {
    const locs = summarizeLocations([
      { lat: 33.123, lng: -117.281, city: 'Vista', country: 'US' },
      { lat: 33.1228, lng: -117.2809, city: 'Vista', country: 'US' }, // ~same cluster
      { lat: 40.71, lng: -74.0, city: 'New York', country: 'US' },
      { lat: null, lng: null, city: null, country: null }, // dropped (no coords)
    ])
    expect(locs).toHaveLength(2)
    expect(locs[0]).toMatchObject({ city: 'Vista', scans: 2 }) // biggest first
    expect(locs[1]).toMatchObject({ city: 'New York', scans: 1 })
  })

  it('returns empty for no located scans', () => {
    expect(summarizeLocations([{ lat: null, lng: null, city: null, country: null }])).toEqual([])
  })
})

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

  it('splits scans by medium, treating absent/legacy medium as qr', () => {
    const s = summarizeScans(
      [
        { ...scan('a', 'p1', 0), medium: 'nfc' },
        { ...scan('a', 'p2', 0), medium: 'qr' },
        { ...scan('a', null, 0), medium: null }, // legacy row → qr
        scan('a', 'p3', 0), // no medium field → qr
      ],
      30,
      NOW,
    )
    expect(s.byMedium).toEqual({ qr: 3, nfc: 1 })
    expect(s.byMedium.qr + s.byMedium.nfc).toBe(s.total)
  })
})
