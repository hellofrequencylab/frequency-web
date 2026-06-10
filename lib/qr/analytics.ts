// Pure scan-analytics aggregation. Takes the raw scan rows (already fetched by the
// admin page on the service-role client) and rolls them up for the dashboard — no
// DB access here, so it unit-tests cleanly and the page stays a thin data-loader.

export interface ScanRow {
  qr_code_id: string
  profile_id: string | null
  scanned_at: string
  /** How the scan arrived. Absent on legacy rows → treated as 'qr'. */
  medium?: string | null
}

export interface ScanGeoRow {
  lat: number | null
  lng: number | null
  city: string | null
  country: string | null
}

export interface ScanLocation {
  /** Stable key (rounded lng,lat). */
  key: string
  city: string
  country: string | null
  lat: number
  lng: number
  scans: number
}

/** Cluster scans with coordinates into ~city-granular points for the locator map.
 *  Rounds to 2 decimals (~1km) so nearby scans group; rows without coords drop. */
export function summarizeLocations(rows: ScanGeoRow[]): ScanLocation[] {
  const byKey = new Map<string, ScanLocation>()
  for (const r of rows) {
    if (typeof r.lat !== 'number' || typeof r.lng !== 'number') continue
    const lat = Math.round(r.lat * 100) / 100
    const lng = Math.round(r.lng * 100) / 100
    const key = `${lng},${lat}`
    const e =
      byKey.get(key) ??
      { key, city: r.city ?? 'Unknown', country: r.country ?? null, lat, lng, scans: 0 }
    e.scans++
    if (e.city === 'Unknown' && r.city) e.city = r.city
    byKey.set(key, e)
  }
  return [...byKey.values()].sort((a, b) => b.scans - a.scans)
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
  /** Scans split by arrival channel. `qr` covers printed codes (and legacy rows);
   *  `nfc` is tapped tags. They sum to `total`. */
  byMedium: { qr: number; nfc: number }
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
  const byMedium = { qr: 0, nfc: 0 }

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

    if (s.medium === 'nfc') byMedium.nfc++
    else byMedium.qr++

    const key = dayKey(new Date(s.scanned_at))
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }

  return {
    total: scans.length,
    unique: uniqueProfiles.size,
    byMedium,
    daily: [...buckets.entries()].map(([date, count]) => ({ date, count })),
    perCode: new Map(
      [...perCode.entries()].map(([codeId, v]) => [
        codeId,
        { codeId, total: v.total, unique: v.profiles.size },
      ]),
    ),
  }
}

// ── Per-page rollup (PX.3) ────────────────────────────────────────────────────
// The Settings-panel summary for one page's codes (qr_codes.page_path, ADR-179):
// the same scan rows the Studio dashboards aggregate, scoped to a folder and
// reduced to the three numbers an operator scans in place.

export interface PageScanSummary {
  total: number
  /** Distinct signed-in scanners across this page's codes. */
  unique: number
  /** ISO timestamp of the most recent scan, or null when unscanned. */
  lastScanAt: string | null
  /** The page's most-scanned code (its top "source": each code = one placement). */
  topCode: CodeScanStat | null
}

/** Roll one page's scans up to total / last-scan / top code. Pure (no DB). */
export function summarizePageScans(scans: ScanRow[]): PageScanSummary {
  const s = summarizeScans(scans, 1) // daily series unused here; keep it cheap
  let lastScanAt: string | null = null
  let lastTs = -Infinity
  for (const r of scans) {
    const ts = Date.parse(r.scanned_at)
    if (Number.isFinite(ts) && ts > lastTs) {
      lastTs = ts
      lastScanAt = r.scanned_at
    }
  }
  let topCode: CodeScanStat | null = null
  for (const c of s.perCode.values()) {
    if (!topCode || c.total > topCode.total) topCode = c
  }
  return { total: s.total, unique: s.unique, lastScanAt, topCode }
}
