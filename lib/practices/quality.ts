// Practice quality score (Phase 2 "Clean" item 2.3, ADR-438; spec PRACTICE-LIBRARY §6).
//
// PURE math — no I/O, fully unit-tested. Turns the three signals an operator cares about
// (is the practice complete, is anyone using it, is it fresh) into one 0-100 score plus a
// plain-language issue list the "Needs attention" view surfaces. The DB read that gathers
// the inputs lives in lib/practices/clean.ts (needsAttention); this is the scoring rule it
// applies, kept separate so the boundaries are testable without a database.
//
// The score is ADVISORY: it drives sorting + a "needs attention" nudge, never a gate. It
// never blocks publish and never touches valuation (that is the log-time chokepoint, Phase 4).

/** The practice fields the quality score reads. A minimal shape (not the full Practice) so
 *  any read that has these columns can score a row. updated_at is the Phase-2 freshness column. */
export interface QualityInput {
  title: string | null
  summary: string | null
  body: string | null
  header_image: string | null
  domain_id: string | null
  subcategory_id: string | null
  duration_min: number | null
  /** Distinct members who adopted it. */
  adopters: number
  /** Logs in the trailing 30 days (the recency-of-use signal). */
  logs_30d: number
  /** Logs all time. */
  logs_total: number
  /** Last-touched timestamp (the freshness signal). ISO string or null for a legacy row. */
  updated_at: string | null
  /** "Now" for the freshness math, injectable so the boundaries are testable. Defaults to Date.now(). */
  now?: number
}

/** The scored result. `completeness`/`engagement`/`freshness` are the three 0-100 sub-scores
 *  the total is the weighted blend of; `issues` is the plain-language gap list for the UI. */
export interface QualityScore {
  /** 0-100, weighted blend of the three sub-scores (completeness 50, engagement 30, freshness 20). */
  score: number
  /** 0-100: how many of the seven content fields are present. */
  completeness: number
  /** 0-100: adoption + recent + all-time logs, saturating (a popular practice maxes out). */
  engagement: number
  /** 0-100: how recently the practice was touched (full marks under 30 days, decaying to ~180). */
  freshness: number
  /** Plain-language gaps an operator can act on. Empty = nothing flagged. */
  issues: string[]
}

// The seven fields that make a practice "complete" — the same gaps the facet rail tracks,
// plus the ones a published practice should carry (a summary, a length, a sub-category).
const COMPLETENESS_FIELDS = 7

const DAY_MS = 86_400_000
/** Full freshness under this many days; linear decay to zero at FRESHNESS_FLOOR_DAYS. */
const FRESHNESS_FULL_DAYS = 30
const FRESHNESS_FLOOR_DAYS = 180

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Score one practice 0-100 from its completeness, engagement, and freshness. Pure + total:
 * a row with every gap scores low (with a full issue list), a complete + used + fresh one
 * scores high (with no issues). Never throws; missing inputs read as "absent / zero".
 *
 *   completeness (weight 50) — fraction of the 7 content fields present.
 *   engagement   (weight 30) — adopters + 30-day logs + all-time logs, each saturating so a
 *                              very popular practice can't drown out the other axes.
 *   freshness    (weight 20) — full marks under 30 days since updated_at, linear decay to 0
 *                              by ~180 days; a null updated_at (legacy row) reads as "old".
 */
export function computeQualityScore(p: QualityInput): QualityScore {
  const issues: string[] = []

  // --- Completeness: count the present content fields, flag the missing ones. ---
  const has = (v: unknown) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')
  let present = 0
  if (has(p.title)) present += 1
  else issues.push('No title')
  if (has(p.summary)) present += 1
  else issues.push('No summary')
  if (has(p.body)) present += 1
  else issues.push('No body')
  if (has(p.header_image)) present += 1
  else issues.push('No image')
  if (has(p.domain_id)) present += 1
  else issues.push('No Pillar')
  if (has(p.subcategory_id)) present += 1
  else issues.push('No sub-category')
  if (p.duration_min != null && p.duration_min > 0) present += 1
  else issues.push('No length')
  const completeness = Math.round((present / COMPLETENESS_FIELDS) * 100)

  // --- Engagement: each signal saturates so one big number can't dominate the blend. ---
  const adopters = Math.max(0, p.adopters || 0)
  const logs30 = Math.max(0, p.logs_30d || 0)
  const logsAll = Math.max(0, p.logs_total || 0)
  // Saturating curves: adopters max at 20, 30-day logs at 30, all-time logs at 100.
  const adoptScore = clamp(adopters / 20, 0, 1)
  const recentScore = clamp(logs30 / 30, 0, 1)
  const totalScore = clamp(logsAll / 100, 0, 1)
  // Recent use is the strongest staying-power signal, then adoption, then raw total.
  const engagement = Math.round((recentScore * 0.45 + adoptScore * 0.35 + totalScore * 0.2) * 100)
  if (logsAll === 0) issues.push('Never logged')
  else if (logs30 === 0) issues.push('No logs in 30 days')

  // --- Freshness: decay from the last-touched timestamp. ---
  let freshness: number
  if (!p.updated_at) {
    freshness = 0
    issues.push('No freshness date')
  } else {
    const touched = Date.parse(p.updated_at)
    if (Number.isNaN(touched)) {
      freshness = 0
    } else {
      const ageDays = Math.max(0, ((p.now ?? Date.now()) - touched) / DAY_MS)
      if (ageDays <= FRESHNESS_FULL_DAYS) freshness = 100
      else if (ageDays >= FRESHNESS_FLOOR_DAYS) freshness = 0
      else {
        const span = FRESHNESS_FLOOR_DAYS - FRESHNESS_FULL_DAYS
        freshness = Math.round((1 - (ageDays - FRESHNESS_FULL_DAYS) / span) * 100)
      }
      if (ageDays >= FRESHNESS_FLOOR_DAYS) issues.push('Not touched in 6 months')
    }
  }

  const score = Math.round(completeness * 0.5 + engagement * 0.3 + freshness * 0.2)

  return { score, completeness, engagement, freshness, issues }
}

/** Is this practice "stale"? Old (past the freshness floor) AND barely used — the signal the
 *  Needs-attention view adds on top of the facet gaps (an orphaned-but-busy practice is fine;
 *  an old one nobody logs is the one to revisit). Pure; mirrors the freshness math above. */
export function isStale(p: Pick<QualityInput, 'updated_at' | 'logs_30d' | 'now'>): boolean {
  if (!p.updated_at) return (p.logs_30d || 0) === 0
  const touched = Date.parse(p.updated_at)
  if (Number.isNaN(touched)) return (p.logs_30d || 0) === 0
  const ageDays = ((p.now ?? Date.now()) - touched) / DAY_MS
  return ageDays >= FRESHNESS_FLOOR_DAYS && (p.logs_30d || 0) === 0
}
