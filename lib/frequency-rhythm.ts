// Descriptive practice-day evidence. No rewards, health assessment, IO or inferred supports.
import { PILLAR_SLUGS, type PillarSlug } from './pillars/slugs.ts'

export const PRACTICE_WINDOW_DATES = 21

export interface PracticeWindow {
  start: string
  end: string
  timezone: string
  timezoneSource: 'profile' | 'utc_fallback'
  dates: number
}
export interface RhythmLog {
  id: string
  logged_for: string | null
  /** Future immutable log snapshots. Not selected until the schema-gated release. */
  support_pillar_ids?: readonly string[] | null
  support_evidence_version?: number | null
  pillar_id: string | null
  secondary_pillar_id: string | null
  primary_pct: number | null
  practice: { domain_id: string | null; secondary_domain_id: string | null; primary_pct: number | null } | null
}
export interface PracticeRhythm {
  state: 'complete' | 'empty' | 'partial' | 'unavailable' | 'restricted'
  complete: boolean
  window: PracticeWindow | null
  /** Nonexclusive distinct dates. Their sum is not the number of days practiced. */
  days: Record<PillarSlug, number>
  activeDays: number
  coverage: { frozenLogs: number; estimatedLogs: number; unmappedLogs: number }
}
const emptyDays = (): Record<PillarSlug, number> => ({ mind: 0, body: 0, spirit: 0, expression: 0 })

/** Same home-zone then UTC convention as member-day.ts. Calendar subtraction is DST-safe. */
export function practiceWindow(now: Date, rawZone?: string | null): PracticeWindow {
  let timezone = 'UTC'
  let timezoneSource: PracticeWindow['timezoneSource'] = 'utc_fallback'
  if (rawZone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: rawZone }).format(now)
      timezone = rawZone
      timezoneSource = 'profile'
    } catch { /* Stored invalid/absent zones use the existing UTC fallback. */ }
  }
  const end = now.toLocaleDateString('en-CA', { timeZone: timezone })
  const start = new Date(`${end}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - (PRACTICE_WINDOW_DATES - 1))
  return { start: start.toISOString().slice(0, 10), end, timezone, timezoneSource, dates: PRACTICE_WINDOW_DATES }
}

export function missingPracticeRhythm(state: 'unavailable' | 'restricted', window: PracticeWindow | null = null): PracticeRhythm {
  return { state, complete: false, window, days: emptyDays(), activeDays: 0, coverage: { frozenLogs: 0, estimatedLogs: 0, unmappedLogs: 0 } }
}

/** Frozen snapshots win even after category edits/deletion. Legacy estimates are labelled separately. */
export function computePracticeRhythm(
  rows: readonly RhythmLog[],
  pillars: ReadonlyMap<string, PillarSlug>,
  window: PracticeWindow,
  complete = true,
): PracticeRhythm {
  const days = emptyDays()
  const sets = Object.fromEntries(PILLAR_SLUGS.map((key) => [key, new Set<string>()])) as Record<PillarSlug, Set<string>>
  const active = new Set<string>()
  const coverage = { frozenLogs: 0, estimatedLogs: 0, unmappedLogs: 0 }
  for (const row of rows) {
    const day = row.logged_for
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < window.start || day > window.end) continue
    const instant = Date.parse(`${day}T00:00:00Z`)
    if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== day) continue
    active.add(day)
    if (row.support_evidence_version != null) {
      // Explicit future evidence wins; malformed/unknown versions are not backfilled.
      const ids = row.support_evidence_version === 1 && Array.isArray(row.support_pillar_ids) ? [...new Set(row.support_pillar_ids)] : []
      let mapped = 0
      let unknown = ids.length === 0
      for (const id of ids) {
        const slug = typeof id === 'string' ? pillars.get(id) : undefined
        if (slug && PILLAR_SLUGS.includes(slug)) { sets[slug].add(day); mapped++ }
        else unknown = true
      }
      if (mapped) coverage.frozenLogs++
      if (unknown) coverage.unmappedLogs++
      continue
    }
    const frozen = typeof row.pillar_id === 'string' && row.pillar_id.length > 0
    const primary = frozen ? row.pillar_id : row.practice?.domain_id
    const secondary = frozen ? row.secondary_pillar_id : row.practice?.secondary_domain_id
    const pct = frozen ? row.primary_pct : row.practice?.primary_pct
    let mapped = 0
    let unknown = false
    const add = (id: string | null | undefined) => {
      const slug = id ? pillars.get(id) : undefined
      if (slug && PILLAR_SLUGS.includes(slug)) { sets[slug].add(day); mapped++ }
      else unknown = true
    }
    add(primary)
    if (secondary && secondary !== primary) {
      // The existing frozen ledger stores a validated 50..100 percentage. An absent or
      // malformed split is unknown evidence, not permission to guess a second support.
      if (typeof pct === 'number' && Number.isInteger(pct) && pct >= 50 && pct <= 100) {
        if (pct < 100) add(secondary)
      } else unknown = true
    }
    if (mapped > 0) {
      if (frozen) coverage.frozenLogs++
      else coverage.estimatedLogs++
    }
    if (unknown || mapped === 0) coverage.unmappedLogs++
  }
  for (const key of PILLAR_SLUGS) days[key] = sets[key].size
  return { state: !complete ? 'partial' : active.size === 0 ? 'empty' : 'complete', complete, window, days, activeDays: active.size, coverage }
}
