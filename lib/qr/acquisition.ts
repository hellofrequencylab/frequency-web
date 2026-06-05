// Acquisition analytics (ADR-114) — roll up the first-touch snapshots persisted on
// profiles.acquisition (ADR-107) into "how did signups arrive": by channel, by
// campaign/source, and by the specific code/poster. Pure + DB-free so the stats
// page stays a thin loader and this unit-tests cleanly.

export interface AcquisitionRow {
  /** High-level channel hint (e.g. 'qr_scan', 'referral', 'event_guest'). */
  channel: string | null
  /** UTM source (e.g. 'qr_scan'). */
  source: string | null
  /** Campaign / operator source_tag (e.g. 'downtown-poster-a'). */
  campaign: string | null
  /** The dynamic-code slug that brought them. */
  code: string | null
}

export interface AcquisitionBucket {
  key: string
  count: number
}

export interface AcquisitionSummary {
  /** Signups that carried any acquisition snapshot. */
  total: number
  byChannel: AcquisitionBucket[]
  /** campaign when present, else source — the "where from" label. */
  bySource: AcquisitionBucket[]
  /** Per-code-slug signup counts (for scan→signup conversion). */
  byCode: AcquisitionBucket[]
}

function tally(values: (string | null | undefined)[]): AcquisitionBucket[] {
  const m = new Map<string, number>()
  for (const v of values) {
    const key = (v ?? '').trim()
    if (!key) continue
    m.set(key, (m.get(key) ?? 0) + 1)
  }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
}

export function summarizeAcquisition(rows: AcquisitionRow[]): AcquisitionSummary {
  return {
    total: rows.length,
    byChannel: tally(rows.map((r) => r.channel)),
    bySource: tally(rows.map((r) => r.campaign || r.source)),
    byCode: tally(rows.map((r) => r.code)),
  }
}
