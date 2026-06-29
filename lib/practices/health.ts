// Practice Library health dashboard — Phase 4.3 server layer (BUILD-LIST Practice Library §4.3).
//
// The READ-ONLY metric layer behind the library health dashboard. Computed entirely from
// existing tables (practices / practices_ranked / practice_logs / member_practices /
// engagement_events / pillars / practice_subcategories / the review queue). NO writes, no
// migration — every signal already lives in the schema.
//
// Two layers, kept apart so the math is testable without a database (mirrors quality.ts /
// clean.ts, ADR-438):
//   • PURE functions (this file's top half) — bucketing, coverage gaps, the adoption funnel,
//     review-SLA aging, the contributor roll-up. Total + deterministic, unit-tested in
//     health.test.ts with a `now` injected for the time math.
//   • getLibraryHealth() (bottom) — the choreography: it reads through the admin handle with
//     the SAME curator guard the rest of the practices admin uses (authz-delegated: the
//     curator gate lives at the calling page, app/(main)/admin/content/practices/health), then
//     feeds the rows into the pure functions above.
//
// The practices/* tables + the practices_ranked view are ahead of the generated Database types
// for some computed columns, so this reads through the untyped admin handle (ADR-246), the same
// convention as lib/practices.ts and lib/practices/clean.ts.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

// ============================================================================
// Pure shapes
// ============================================================================

/** A practice row as the health math reads it (a minimal slice of practices_ranked + the
 *  table's review/freshness columns). */
export interface HealthPracticeRow {
  id: string
  title: string | null
  status: string | null
  is_public: boolean
  domain_id: string | null
  subcategory_id: string | null
  created_at: string | null
  created_by: string | null
  /** Set when the practice was reviewed (approved/rejected); null while pending. */
  reviewed_at: string | null
  adopters: number
  logs_30d: number
  logs_total: number
}

/** A Pillar, for the coverage matrix. */
export interface PillarRow {
  id: string
  name: string
  slug: string
}

/** A sub-category under a Pillar, for the coverage matrix. */
export interface SubcategoryRow {
  id: string
  name: string
  slug: string
  domain_id: string
}

/** A contributor's display identity, for the leaderboard. */
export interface ContributorProfile {
  id: string
  display_name: string | null
  handle: string | null
}

// ============================================================================
// 1. Growth over time
// ============================================================================

/**
 * Bucket a set of ISO timestamps into trailing whole weeks (oldest → current week last).
 * A timestamp outside the window (future, or older than `weeks` weeks) is dropped. Pure +
 * total; `now` is injectable so the boundaries are testable.
 */
export function weeklyCounts(timestamps: (string | null)[], weeks: number, now = Date.now()): number[] {
  const out = new Array<number>(Math.max(0, weeks)).fill(0)
  if (weeks <= 0) return out
  for (const ts of timestamps) {
    if (!ts) continue
    const t = Date.parse(ts)
    if (Number.isNaN(t)) continue
    const age = now - t
    if (age < 0 || age >= weeks * WEEK_MS) continue
    out[weeks - 1 - Math.floor(age / WEEK_MS)] += 1
  }
  return out
}

/** A cumulative series from a starting base + per-week additions (the running library size). */
export function cumulativeFrom(base: number, weekly: number[]): number[] {
  const out: number[] = []
  let total = base
  for (const w of weekly) {
    total += w
    out.push(total)
  }
  return out
}

/** The growth panel: the published-library size now, per-week additions, and the running total. */
export interface GrowthMetrics {
  /** Total published practices today. */
  totalPublished: number
  /** Published practices added per trailing week (oldest → current). */
  weeklyAdds: number[]
  /** Running library size per week (the cumulative curve the chart draws). */
  cumulative: number[]
  /** Additions in the most recent whole week. */
  addedThisWeek: number
}

/**
 * Build the growth panel from the published rows. `weeks` trailing buckets; the cumulative
 * curve is anchored so it ENDS at `totalPublished` (we walk the base back from today by the
 * windowed adds, so the curve reads as the true library size, not just the windowed slice).
 */
export function computeGrowth(published: HealthPracticeRow[], weeks: number, now = Date.now()): GrowthMetrics {
  const totalPublished = published.length
  const weeklyAdds = weeklyCounts(
    published.map((p) => p.created_at),
    weeks,
    now,
  )
  const addedInWindow = weeklyAdds.reduce((a, b) => a + b, 0)
  // Anchor the curve to end at the true total: base = total minus everything added in-window.
  const base = Math.max(0, totalPublished - addedInWindow)
  return {
    totalPublished,
    weeklyAdds,
    cumulative: cumulativeFrom(base, weeklyAdds),
    addedThisWeek: weeklyAdds.length ? weeklyAdds[weeklyAdds.length - 1] : 0,
  }
}

// ============================================================================
// 2. Coverage gaps by Pillar / subcategory
// ============================================================================

/** One sub-category's coverage: how many published practices sit under it (0 = a gap). */
export interface SubcategoryCoverage {
  id: string
  name: string
  count: number
}

/** One Pillar's coverage: its published count + per-subcategory breakdown + the empty ones. */
export interface PillarCoverage {
  id: string
  name: string
  count: number
  subcategories: SubcategoryCoverage[]
  /** Sub-categories under this Pillar with zero published practices (the gaps to fill). */
  emptySubcategories: SubcategoryCoverage[]
}

/** The coverage panel: per-Pillar rows + the count of practices with no Pillar at all. */
export interface CoverageMetrics {
  pillars: PillarCoverage[]
  /** Published practices with domain_id null (orphaned, not under any Pillar). */
  unpilared: number
  /** Total number of sub-categories with zero published practices, across all Pillars. */
  totalEmptySubcategories: number
}

/**
 * Build the coverage matrix: for each Pillar, how many published practices it holds and how
 * they spread across its sub-categories, flagging the empty sub-categories (the gaps). Pure;
 * counts only the published rows. A practice with a domain but no sub-category counts toward
 * the Pillar total but not into any sub-category bucket.
 */
export function computeCoverage(
  published: HealthPracticeRow[],
  pillars: PillarRow[],
  subcategories: SubcategoryRow[],
): CoverageMetrics {
  const byPillar = new Map<string, number>()
  const bySub = new Map<string, number>()
  let unpilared = 0
  for (const p of published) {
    if (!p.domain_id) {
      unpilared += 1
      continue
    }
    byPillar.set(p.domain_id, (byPillar.get(p.domain_id) ?? 0) + 1)
    if (p.subcategory_id) bySub.set(p.subcategory_id, (bySub.get(p.subcategory_id) ?? 0) + 1)
  }

  const subsByPillar = new Map<string, SubcategoryRow[]>()
  for (const s of subcategories) {
    if (!subsByPillar.has(s.domain_id)) subsByPillar.set(s.domain_id, [])
    subsByPillar.get(s.domain_id)!.push(s)
  }

  let totalEmpty = 0
  const pillarCoverage: PillarCoverage[] = pillars.map((pillar) => {
    const subs = (subsByPillar.get(pillar.id) ?? []).map<SubcategoryCoverage>((s) => ({
      id: s.id,
      name: s.name,
      count: bySub.get(s.id) ?? 0,
    }))
    const empty = subs.filter((s) => s.count === 0)
    totalEmpty += empty.length
    return {
      id: pillar.id,
      name: pillar.name,
      count: byPillar.get(pillar.id) ?? 0,
      subcategories: subs,
      emptySubcategories: empty,
    }
  })

  return { pillars: pillarCoverage, unpilared, totalEmptySubcategories: totalEmpty }
}

// ============================================================================
// 3. Adoption funnel
// ============================================================================

/** The adoption funnel: published → adopted by ≥1 member → logged at least once → logged
 *  in the trailing 30 days. Each step is a strict subset of the one before. */
export interface FunnelMetrics {
  published: number
  adopted: number
  logged: number
  loggedRecently: number
  /** adopted / published, 0..1 (0 when there are no published practices). */
  adoptedRate: number
  /** logged / published, 0..1. */
  loggedRate: number
  /** loggedRecently / published, 0..1 (the "alive right now" share). */
  activeRate: number
}

function ratio(n: number, d: number): number {
  return d > 0 ? n / d : 0
}

/**
 * The adoption funnel over the published library. A practice counts as:
 *   • adopted        — at least one member adopted it (adopters > 0)
 *   • logged         — logged at least once ever (logs_total > 0)
 *   • loggedRecently — logged in the trailing 30 days (logs_30d > 0)
 * Strict nesting holds by construction of the underlying signals (a recent log implies a
 * total log; the rates are reported against the published denominator so each step reads as a
 * share of the whole library, the operator's question: "of everything we shipped, what landed").
 */
export function computeFunnel(published: HealthPracticeRow[]): FunnelMetrics {
  const total = published.length
  let adopted = 0
  let logged = 0
  let loggedRecently = 0
  for (const p of published) {
    if ((p.adopters || 0) > 0) adopted += 1
    if ((p.logs_total || 0) > 0) logged += 1
    if ((p.logs_30d || 0) > 0) loggedRecently += 1
  }
  return {
    published: total,
    adopted,
    logged,
    loggedRecently,
    adoptedRate: ratio(adopted, total),
    loggedRate: ratio(logged, total),
    activeRate: ratio(loggedRecently, total),
  }
}

// ============================================================================
// 4. Top / bottom performers
// ============================================================================

/** One ranked performer: the practice + its trailing-30-day usage and lifetime totals. */
export interface PerformerRow {
  id: string
  title: string
  logs_30d: number
  logs_total: number
  adopters: number
}

/** Top and bottom performers by trailing-30-day usage (the live signal, not lifetime). */
export interface PerformerMetrics {
  top: PerformerRow[]
  /** Published practices nobody has logged in 30 days, least-adopted first (the at-risk tail). */
  bottom: PerformerRow[]
}

/**
 * Rank the published library by trailing-30-day logs. Top = the busiest (ties broken by
 * lifetime logs, then adopters). Bottom = the idle tail (no logs in 30 days), ordered
 * fewest-adopters first so the most-neglected practices lead the "needs a push" list. Pure;
 * `limit` caps each side.
 */
export function computePerformers(published: HealthPracticeRow[], limit = 5): PerformerMetrics {
  const rows: PerformerRow[] = published.map((p) => ({
    id: p.id,
    title: p.title ?? 'Untitled',
    logs_30d: p.logs_30d || 0,
    logs_total: p.logs_total || 0,
    adopters: p.adopters || 0,
  }))

  const top = [...rows]
    .filter((r) => r.logs_30d > 0)
    .sort((a, b) => b.logs_30d - a.logs_30d || b.logs_total - a.logs_total || b.adopters - a.adopters)
    .slice(0, limit)

  const bottom = [...rows]
    .filter((r) => r.logs_30d === 0)
    .sort((a, b) => a.adopters - b.adopters || a.logs_total - b.logs_total || a.title.localeCompare(b.title))
    .slice(0, limit)

  return { top, bottom }
}

// ============================================================================
// 5. Review SLA
// ============================================================================

/** The review-SLA aging buckets for the pending queue (how long submissions have waited). */
export interface ReviewSlaMetrics {
  /** Total pending practices awaiting review. */
  pending: number
  /** Pending under 2 days old. */
  fresh: number
  /** Pending 2–6 days old (watch). */
  aging: number
  /** Pending 7+ days old (the SLA breach — submitters waiting over a week). */
  overdue: number
  /** Age in days of the oldest pending submission (0 when the queue is empty). */
  oldestDays: number
}

/** Aging thresholds (days). Under FRESH = fresh; FRESH..OVERDUE = aging; OVERDUE+ = breached. */
export const REVIEW_FRESH_DAYS = 2
export const REVIEW_OVERDUE_DAYS = 7

/**
 * Age the pending review queue into fresh / aging / overdue buckets from each submission's
 * created_at. Pure; `now` injectable. A submission with a null/invalid created_at is counted
 * as pending but contributes 0 age (it can't be aged, so it never falsely breaches the SLA).
 */
export function computeReviewSla(pending: { created_at: string | null }[], now = Date.now()): ReviewSlaMetrics {
  let fresh = 0
  let aging = 0
  let overdue = 0
  let oldestDays = 0
  for (const row of pending) {
    if (!row.created_at) continue
    const t = Date.parse(row.created_at)
    if (Number.isNaN(t)) continue
    const ageDays = Math.max(0, (now - t) / DAY_MS)
    if (ageDays > oldestDays) oldestDays = ageDays
    if (ageDays < REVIEW_FRESH_DAYS) fresh += 1
    else if (ageDays < REVIEW_OVERDUE_DAYS) aging += 1
    else overdue += 1
  }
  return { pending: pending.length, fresh, aging, overdue, oldestDays: Math.floor(oldestDays) }
}

// ============================================================================
// 6. Contributor leaderboard
// ============================================================================

/** One contributor row: who they are + how much of the published library they authored. */
export interface ContributorRow {
  id: string
  displayName: string
  handle: string | null
  /** Published practices this contributor authored. */
  published: number
  /** Sum of trailing-30-day logs across their published practices (their live reach). */
  reach30d: number
  /** Sum of lifetime adopters across their published practices. */
  adopters: number
}

/**
 * Roll the published library up by author into a contributor leaderboard, ordered by
 * published count, then live reach, then adopters. A practice with a null author is skipped
 * (no one to credit). `profiles` supplies the display identity; a missing profile falls back
 * to a short id so a row is never blank. Pure; `limit` caps the board.
 */
export function computeContributors(
  published: HealthPracticeRow[],
  profiles: ContributorProfile[],
  limit = 10,
): ContributorRow[] {
  const profileById = new Map(profiles.map((p) => [p.id, p]))
  const byAuthor = new Map<string, { published: number; reach30d: number; adopters: number }>()
  for (const p of published) {
    if (!p.created_by) continue
    const agg = byAuthor.get(p.created_by) ?? { published: 0, reach30d: 0, adopters: 0 }
    agg.published += 1
    agg.reach30d += p.logs_30d || 0
    agg.adopters += p.adopters || 0
    byAuthor.set(p.created_by, agg)
  }

  const rows: ContributorRow[] = [...byAuthor.entries()].map(([id, agg]) => {
    const profile = profileById.get(id)
    return {
      id,
      displayName: profile?.display_name?.trim() || `Member ${id.slice(0, 8)}`,
      handle: profile?.handle ?? null,
      published: agg.published,
      reach30d: agg.reach30d,
      adopters: agg.adopters,
    }
  })

  rows.sort(
    (a, b) => b.published - a.published || b.reach30d - a.reach30d || b.adopters - a.adopters,
  )
  return rows.slice(0, limit)
}

// ============================================================================
// The assembled dashboard payload + the guarded read
// ============================================================================

/** Everything the health dashboard page renders, computed in one pass. */
export interface LibraryHealth {
  growth: GrowthMetrics
  coverage: CoverageMetrics
  funnel: FunnelMetrics
  performers: PerformerMetrics
  reviewSla: ReviewSlaMetrics
  contributors: ContributorRow[]
  /** How many trailing weeks the growth chart covers (for its caption). */
  weeks: number
}

function db(): SupabaseClient {
  return createAdminClient()
}

/**
 * Read the library + its signals and compute every health metric in one pass. READ-ONLY: no
 * writes, no migration — every input already exists (practices_ranked carries adopters /
 * logs_30d / logs_total; the table carries created_at / reviewed_at; pillars +
 * practice_subcategories define the coverage grid; profiles name the contributors).
 *
 * authz-delegated: the curator gate lives at the calling page
 * (app/(main)/admin/content/practices/health, requireAdmin('host', { staff: 'community' })).
 */
export async function getLibraryHealth(opts: { weeks?: number } = {}): Promise<LibraryHealth> {
  const weeks = Math.min(52, Math.max(4, Math.floor(opts.weeks ?? 12)))
  const now = Date.now()
  const client = db()

  // The whole library with its usage signals (the ranking view), the Pillar/sub-category grid,
  // and the pending queue — read concurrently. A high cap keeps the read bounded if the library
  // grows large; the dashboard is an aggregate, so we read the rows and roll them up in memory
  // (the same shape as needsAttention, but across every status to also see the funnel + growth).
  const [{ data: practiceRows }, { data: pillarRows }, { data: subRows }, { data: pendingRows }] =
    await Promise.all([
      client
        .from('practices_ranked')
        .select(
          'id, title, status, is_public, domain_id, subcategory_id, created_at, created_by, adopters, logs_30d, logs_total',
        )
        .limit(5000),
      client.from('pillars').select('id, name, slug').eq('is_active', true).order('display_order'),
      client.from('practice_subcategories').select('id, name, slug, domain_id').order('display_order'),
      client
        .from('practices')
        .select('id, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1000),
    ])

  const allRows =
    ((practiceRows as
      | {
          id: string; title: string | null; status: string | null; is_public: boolean
          domain_id: string | null; subcategory_id: string | null; created_at: string | null
          created_by: string | null; adopters: number | null; logs_30d: number | null; logs_total: number | null
        }[]
      | null) ?? []).map<HealthPracticeRow>((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      is_public: r.is_public,
      domain_id: r.domain_id,
      subcategory_id: r.subcategory_id,
      created_at: r.created_at,
      created_by: r.created_by,
      reviewed_at: null,
      adopters: r.adopters ?? 0,
      logs_30d: r.logs_30d ?? 0,
      logs_total: r.logs_total ?? 0,
    }))

  // The public library is the surface members actually see — growth, coverage, the funnel, and
  // performers all read it (merged/archived rows are is_public=false and never count).
  const published = allRows.filter((r) => r.is_public)

  const pillars = ((pillarRows as PillarRow[] | null) ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
  }))
  const subcategories = ((subRows as SubcategoryRow[] | null) ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    domain_id: s.domain_id,
  }))
  const pending = ((pendingRows as { id: string; created_at: string | null }[] | null) ?? [])

  // The contributor identities — one batched read of the distinct authors in the published set.
  const authorIds = [...new Set(published.map((p) => p.created_by).filter((c): c is string => !!c))]
  const { data: profileRows } = authorIds.length
    ? await client.from('profiles').select('id, display_name, handle').in('id', authorIds)
    : { data: [] as ContributorProfile[] }
  const profiles = (profileRows as ContributorProfile[] | null) ?? []

  return {
    growth: computeGrowth(published, weeks, now),
    coverage: computeCoverage(published, pillars, subcategories),
    funnel: computeFunnel(published),
    performers: computePerformers(published, 5),
    reviewSla: computeReviewSla(pending, now),
    contributors: computeContributors(published, profiles, 10),
    weeks,
  }
}
