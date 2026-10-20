// Pure check-in aggregation for the admin Scan stats page. Takes raw
// engagement_events rows (event_type = 'node_capture', already fetched by the page)
// and rolls them up by how the member arrived: a printed QR, a tapped NFC placard,
// or a member card at a counter scanner. No DB access here, so it unit-tests cleanly.

export interface CheckinRow {
  source: string
  context: unknown
  created_at: string
}

type CheckinMedium = 'qr' | 'nfc' | 'device'

interface SpaceCheckinStat {
  spaceId: string
  total: number
  qr: number
  nfc: number
  device: number
}

interface CheckinSummary {
  total: number
  /** Split by arrival channel. They sum to `total`. */
  byMedium: Record<CheckinMedium, number>
  /** Check-ins in the trailing `days` window, oldest to newest, one bucket per day. */
  daily: { date: string; count: number }[]
  /** Per Space, busiest first. Rows with no spaceId are left out of this list. */
  perSpace: SpaceCheckinStat[]
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** How a capture arrived, or null when it is not a QR/NFC/device check-in (geo).
 *  New rows carry context.medium; legacy rows only have the node-type source. */
function checkinMedium(row: Pick<CheckinRow, 'source' | 'context'>): CheckinMedium | null {
  if (row.source === 'geo') return null
  const medium = asRecord(row.context)?.medium
  if (medium === 'qr' || medium === 'nfc' || medium === 'device') return medium
  return row.source === 'nfc' ? 'nfc' : 'qr'
}

/** Summarize Space check-ins overall, per medium, per day, and per Space. */
export function summarizeCheckins(rows: CheckinRow[], days = 30, now = new Date()): CheckinSummary {
  const byMedium: Record<CheckinMedium, number> = { qr: 0, nfc: 0, device: 0 }
  const perSpace = new Map<string, SpaceCheckinStat>()
  let total = 0

  // Seed the daily buckets so quiet days render as zero, not gaps.
  const buckets = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - i)
    buckets.set(dayKey(d), 0)
  }

  for (const row of rows) {
    const medium = checkinMedium(row)
    if (!medium) continue
    total++
    byMedium[medium]++

    const spaceId = asRecord(row.context)?.spaceId
    if (typeof spaceId === 'string' && spaceId) {
      const s = perSpace.get(spaceId) ?? { spaceId, total: 0, qr: 0, nfc: 0, device: 0 }
      s.total++
      s[medium]++
      perSpace.set(spaceId, s)
    }

    const at = new Date(row.created_at)
    if (!Number.isNaN(at.getTime())) {
      const key = dayKey(at)
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
  }

  return {
    total,
    byMedium,
    daily: [...buckets.entries()].map(([date, count]) => ({ date, count })),
    perSpace: [...perSpace.values()].sort((a, b) => b.total - a.total || a.spaceId.localeCompare(b.spaceId)),
  }
}
