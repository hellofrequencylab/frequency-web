// Pure scan-analytics aggregation. Takes the raw scan rows (already fetched by the
// admin page on the service-role client) and rolls them up for the dashboard — no
// DB access here, so it unit-tests cleanly and the page stays a thin data-loader.

export interface ScanRow {
  qr_code_id: string
  profile_id: string | null
  scanned_at: string
}

export interface CodeScanStat {
  codeId: string
  total: number
  /** Distinct signed-in scanners (anonymous scans can't be de-duped). */
  unique: number
}

export interface ScanSummary {
  total: number
  unique: number
  /** Scans in the trailing `days` window, oldest → newest, one bucket per day. */
  daily: { date: string; count: number }[]
  perCode: Map<string, CodeScanStat>
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Summarize scans across all codes + per code, plus a trailing daily series. */
export function summarizeScans(scans: ScanRow[], days = 30, now = new Date()): ScanSummary {
  const perCode = new Map<string, { total: number; profiles: Set<string> }>()
  const uniqueProfiles = new Set<string>()

  // Seed the daily buckets so quiet days render as zero, not gaps.
  const buckets = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - i)
    buckets.set(dayKey(d), 0)
  }

  for (const s of scans) {
    const entry = perCode.get(s.qr_code_id) ?? { total: 0, profiles: new Set<string>() }
    entry.total++
    if (s.profile_id) {
      entry.profiles.add(s.profile_id)
      uniqueProfiles.add(s.profile_id)
    }
    perCode.set(s.qr_code_id, entry)

    const key = dayKey(new Date(s.scanned_at))
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }

  return {
    total: scans.length,
    unique: uniqueProfiles.size,
    daily: [...buckets.entries()].map(([date, count]) => ({ date, count })),
    perCode: new Map(
      [...perCode.entries()].map(([codeId, v]) => [
        codeId,
        { codeId, total: v.total, unique: v.profiles.size },
      ]),
    ),
  }
}
