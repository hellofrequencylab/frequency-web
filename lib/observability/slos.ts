// Service-level objectives as code (H0-8 · docs/SLOs.md, docs/OBSERVABILITY-BASELINES.md §4).
//
// The SLO targets in OBSERVABILITY-BASELINES.md §4 are prose: a human reads the
// table and decides whether a deploy is within budget. This module makes the same
// contract MACHINE-READABLE so the targets stop drifting from the doc and can be
// consumed by code — a status/health endpoint, the cron heartbeat monitor, a CI
// check, or a dashboard — without re-typing a number that then rots.
//
// PURE DATA + PURE FUNCTIONS. This module holds no I/O, reads no env var, no secret,
// no DB. It is the single source of truth for "what good looks like"; deciding
// whether a live measurement meets an SLO is the caller's job, using the helpers
// here. Importing it has zero side effects.
//
// Authority order (unchanged): running code + supabase/migrations/ > the docs > Notion.
// docs/SLOs.md is the prose companion to this module; when they disagree, this code
// (being executable) is the one that gets checked against — keep the doc in step.

/** How a breached SLO is handled (OBSERVABILITY-BASELINES.md §4b). */
export type SloAction =
  | 'page' // wired signal + a human is expected to respond immediately
  | 'track' // drift is reviewed; a sustained breach opens an investigation

/** The kind of objective, so consumers can group/format them sensibly. */
export type SloKind = 'availability' | 'latency' | 'error-rate' | 'freshness'

export type Slo = {
  /** Stable identifier, dot-namespaced like log events (e.g. `latency.read-hot-paths`). */
  id: string
  /** Human label matching the OBSERVABILITY-BASELINES §4 row. */
  label: string
  kind: SloKind
  /** The target as a number, paired with `unit` (e.g. 99.9 + '%', 800 + 'ms'). */
  target: number
  /** Unit for `target`: '%' for ratios, 'ms' for latency, 'min' for lag. */
  unit: '%' | 'ms' | 'min'
  /**
   * Whether a measurement that is *higher* than target is good ('higher-is-better',
   * e.g. uptime) or bad ('lower-is-better', e.g. latency/error-rate/lag). Drives
   * the `meetsSlo` comparison so callers never get the direction wrong.
   */
  direction: 'higher-is-better' | 'lower-is-better'
  /** Rolling window the target is measured over (e.g. '28d', 'live', 'per-job'). */
  window: string
  /** Where the live number is read from (all already wired or read from the vendor). */
  signal: string
  /** What happens on breach (§4b). */
  onBreach: SloAction
  /** Why this target — kept short; the full rationale lives in the doc. */
  rationale: string
}

/**
 * The service SLOs. Mirrors OBSERVABILITY-BASELINES.md §4 exactly; that table and
 * this array must stay in lockstep (the doc points here as the executable copy).
 */
export const SLOS: readonly Slo[] = [
  {
    id: 'availability.uptime',
    label: 'Uptime (app reachable, 2xx/3xx on health path)',
    kind: 'availability',
    target: 99.9,
    unit: '%',
    direction: 'higher-is-better',
    window: '28d',
    signal: 'Vercel + uptime monitor',
    onBreach: 'page',
    rationale:
      '~43 min/month error budget. Honest for single-region serverless; not five-nines we cannot yet back.',
  },
  {
    id: 'latency.read-hot-paths',
    label: 'p95 latency, read hot paths (feed, circle, directory, events)',
    kind: 'latency',
    target: 800,
    unit: 'ms',
    direction: 'lower-is-better',
    window: '28d',
    signal: 'Sentry perf / Vercel Analytics',
    onBreach: 'track',
    rationale:
      'A member-facing read over ~800ms feels slow. This is the bar the H0-6 plans must beat at 10x load.',
  },
  {
    id: 'latency.practice-log-write',
    label: 'p95 latency, practice-log write',
    kind: 'latency',
    target: 1000,
    unit: 'ms',
    direction: 'lower-is-better',
    window: '28d',
    signal: 'Sentry perf',
    onBreach: 'track',
    rationale:
      'The write does an insert + idempotent ledger award; a looser bar than reads, still sub-second-ish.',
  },
  {
    id: 'error-rate.requests',
    label: 'Error rate (5xx + unhandled, per request)',
    kind: 'error-rate',
    target: 0.5,
    unit: '%',
    direction: 'lower-is-better',
    window: '28d',
    signal: 'Sentry (H0-4)',
    onBreach: 'page',
    rationale:
      '1 in 200 requests. Tight enough that a real regression pages; loose enough to absorb transient blips.',
  },
  {
    id: 'freshness.queue-lag',
    label: 'Queue lag (process-queue email worker backlog age)',
    kind: 'freshness',
    target: 10,
    unit: 'min',
    direction: 'lower-is-better',
    window: 'live',
    signal: 'worker log + heartbeat',
    onBreach: 'page',
    rationale:
      'The worker runs every 2 min; a backlog older than ~5 cycles means it is falling behind (H4-2).',
  },
  {
    id: 'freshness.cron',
    label: 'Cron freshness (each of 18 jobs ran within its schedule + grace)',
    kind: 'freshness',
    target: 100,
    unit: '%',
    direction: 'higher-is-better',
    window: 'per-job',
    signal: "cron heartbeat (H0-5) dead-man's-switch",
    onBreach: 'page',
    rationale:
      'A silently-dead cron is the exact future problem H0-5 exists to prevent. Any stale job = page.',
  },
]

/**
 * Per-cron freshness windows (OBSERVABILITY-BASELINES.md §4a). A job is FRESH when
 * its last success heartbeat (H0-5) arrived within `freshByMinutes` of now — defined
 * as `schedule interval + 1 interval` of grace. The full 18-job schedule list is the
 * source of truth in `vercel.json`; this is the freshness CONTRACT the heartbeat
 * monitor pages against, grouped by the urgency of each job's silence.
 *
 * `jobs` lists the route segments under app/api/cron/ that share each window, so the
 * mapping back to vercel.json (and to withCronHeartbeat's `jobName`) stays obvious.
 */
export type CronFreshnessWindow = {
  /** Group label, e.g. 'every 2 min', 'daily'. */
  group: string
  /** Minutes within which a fresh job must have last succeeded (interval + grace). */
  freshByMinutes: number
  /** Cron route segments (match app/api/cron/<job> and vercel.json `path`). */
  jobs: readonly string[]
  /** Why silence here is dangerous. */
  why: string
}

export const CRON_FRESHNESS: readonly CronFreshnessWindow[] = [
  {
    group: 'every 2 min',
    freshByMinutes: 4,
    jobs: ['process-queue'],
    why: 'email + async work backlog (H4-2)',
  },
  {
    group: 'every 5 min',
    freshByMinutes: 10,
    jobs: ['publish-scheduled'],
    why: 'scheduled content goes live on time',
  },
  {
    group: 'every 10 min',
    freshByMinutes: 20,
    jobs: ['season-go-live', 'embed-room-messages'],
    why: 'season transitions; silent failure breaks the economy',
  },
  {
    group: 'every 15 min',
    freshByMinutes: 30,
    jobs: ['nurture', 'event-reminders'],
    why: 'member re-engagement + event attendance',
  },
  {
    group: 'every 30 min',
    freshByMinutes: 60,
    jobs: ['referral-release', 'embed-events'],
    why: 'referral payouts + event search freshness',
  },
  {
    group: 'daily / weekly',
    freshByMinutes: 60 * 24 + 60, // one day + one hour grace
    jobs: [
      'journey-prompt',
      'embed-help',
      'lifecycle-triggers',
      'event-occurrences',
      'refresh-traits',
      'enforce-retention',
      'weekly-digest',
      'demo-decay',
      'embed-practices',
      'summarize-vera-memory',
    ],
    why: 'digest delivery, retention, embeddings',
  },
]

/** Look up a single SLO by id, or undefined if unknown. */
export function getSlo(id: string): Slo | undefined {
  return SLOS.find((s) => s.id === id)
}

/**
 * Does a measured value meet the SLO? Direction-aware: for 'lower-is-better' the
 * value must be <= target; for 'higher-is-better' it must be >= target. Returns
 * false for a non-finite measurement (a missing signal is not a pass).
 */
export function meetsSlo(slo: Slo, value: number): boolean {
  if (!Number.isFinite(value)) return false
  return slo.direction === 'lower-is-better' ? value <= slo.target : value >= slo.target
}

// ── Error-budget calculator (OBSERVABILITY-BASELINES.md §4 · docs/SLOs.md) ──────
//
// An SLO target of 99.9% does not mean "never fail"; it allocates an *error budget*
// — the small fraction of failure the target tolerates over its window. SRE practice
// (Google SRE Workbook, ch. 5) spends that budget deliberately: while budget remains
// you ship; once it's exhausted you freeze risky changes until the window rolls off.
//
// This is the same idea made executable from the contract above, so the burn number
// on a dashboard or in CI is derived from the SLO config — not a figure re-typed (and
// then rotted) somewhere else. PURE FUNCTIONS, no I/O: the caller supplies the live
// measurement; we only do the arithmetic the target implies.
//
// Only RATIO SLOs (`unit: '%'`) have a meaningful error budget — a percentage target
// defines an allowed-failure fraction. Latency/lag targets (ms, min) are thresholds,
// not budgets, so `errorBudget` returns null for them rather than inventing a number.

/** A computed error-budget snapshot for one ratio SLO at one measured value. */
export type ErrorBudget = {
  /** The SLO this budget is derived from. */
  sloId: string
  /**
   * Allowed failure fraction the target tolerates, as a ratio in [0, 1]
   * (e.g. a 99.9% target → 0.001; a 0.5% error-rate target → 0.005).
   */
  budget: number
  /**
   * Observed failure fraction implied by `value`, in [0, 1]. For a
   * higher-is-better target (uptime 99.9%) a value of 99.95 → 0.0005 failing;
   * for a lower-is-better target (error rate) the value *is* the failure ratio.
   */
  used: number
  /** Remaining budget fraction (`budget - used`), clamped at 0 when overspent. */
  remaining: number
  /**
   * Fraction of the budget consumed, in [0, ∞). 1 means exactly spent; >1 means
   * the SLO is breached (more failure than the budget allows). 0 means none used.
   */
  consumedRatio: number
  /** Convenience: is any budget left? (`consumedRatio < 1`). Mirrors meetsSlo. */
  withinBudget: boolean
}

/**
 * The allowed-failure fraction a ratio SLO's target implies, in [0, 1], or null
 * for a non-ratio (latency/lag) SLO. For higher-is-better (uptime 99.9%) the budget
 * is `1 - target/100`; for lower-is-better (error rate 0.5%) the target *is* the
 * allowed failure, so the budget is `target/100`.
 */
export function sloBudgetFraction(slo: Slo): number | null {
  if (slo.unit !== '%') return null
  return slo.direction === 'higher-is-better' ? 1 - slo.target / 100 : slo.target / 100
}

/**
 * Compute the error-budget snapshot for a ratio SLO given a live measurement (the
 * same units as `target`, i.e. a percentage). Returns null for a non-ratio SLO (no
 * budget concept) or a non-finite measurement (a missing signal is not "0% used" —
 * the caller must distinguish unknown from healthy). Never throws.
 *
 *   const eb = errorBudget(getSlo('availability.uptime')!, 99.95)
 *   // → { budget: 0.001, used: 0.0005, remaining: 0.0005, consumedRatio: 0.5, withinBudget: true }
 */
export function errorBudget(slo: Slo, value: number): ErrorBudget | null {
  const budget = sloBudgetFraction(slo)
  if (budget == null || !Number.isFinite(value)) return null

  // Observed failure fraction. higher-is-better: the gap below 100%. lower-is-better:
  // the value itself is the failure ratio. Clamp negatives (e.g. value > 100) to 0.
  const usedRaw = slo.direction === 'higher-is-better' ? (100 - value) / 100 : value / 100
  const used = Math.max(0, usedRaw)

  // Guard the divide: a zero-budget target (100% with no slack) treats any failure as
  // fully consumed, and exactly-zero failure as none consumed — never NaN/Infinity.
  const consumedRatio = budget > 0 ? used / budget : used > 0 ? Infinity : 0
  const remaining = Math.max(0, budget - used)

  return {
    sloId: slo.id,
    budget,
    used,
    remaining,
    consumedRatio,
    withinBudget: consumedRatio < 1,
  }
}

/**
 * Resolve the freshness window (in minutes) for a cron job by its route segment.
 * Returns null for an unknown job so the caller can decide how to treat it (an
 * unmapped job is a doc gap, not silently "always fresh").
 */
export function cronFreshnessMinutes(jobName: string): number | null {
  for (const w of CRON_FRESHNESS) {
    if (w.jobs.includes(jobName)) return w.freshByMinutes
  }
  return null
}

/**
 * Is a cron job fresh, given when it last succeeded? A job is fresh if the gap
 * between `now` and `lastSuccessMs` is within its freshness window. Unknown jobs
 * and a never-succeeded job (`lastSuccessMs` null) are NOT fresh.
 */
export function isCronFresh(
  jobName: string,
  lastSuccessMs: number | null,
  nowMs: number = Date.now(),
): boolean {
  const windowMin = cronFreshnessMinutes(jobName)
  if (windowMin == null || lastSuccessMs == null) return false
  const ageMin = (nowMs - lastSuccessMs) / 60_000
  return ageMin >= 0 && ageMin <= windowMin
}
