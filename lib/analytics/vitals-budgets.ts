// Per-template Core Web Vitals budgets (UX-MATURITY-PLAN Lift 7a).
//
// "Performance is UX" only becomes a control when a number can fail. This file is that
// number, in code, so a design round reads ONE file instead of arguing from feel.
//
// The budgets attach to the path vocabulary the vitals stream ALREADY records: the
// client templates the LANDING pathname (lib/analytics/vitals.ts → templatePath) and
// stores it on the `interaction_events.path` of each `kind='web_vital'` row. So a
// budget needs no new field anywhere; it is a pure function of a string the collector
// has been writing since ADR-922.
//
// THREE CLASSES, because three different bargains:
//   marketing — anonymous, indexed, one shot at a stranger. Strictest.
//   app       — signed in, shell already warm, data-backed. LCP relaxes.
//   operator  — dense consoles doing real work. INP relaxes, nothing else does.
//
// PURE. No DB, no IO. The read that scores live p75 against these is
// lib/analytics/insights-read.ts → the `vitals_p75` RPC.

import type { VitalName } from './vitals'

export type BudgetClass = 'marketing' | 'app' | 'operator'

export interface VitalsBudget {
  /** Largest Contentful Paint, p75, ms. */
  lcpMs: number
  /** Interaction to Next Paint, p75, ms. */
  inpMs: number
  /** Cumulative Layout Shift, p75, unitless. */
  cls: number
}

export const BUDGET_CLASS_LABEL: Record<BudgetClass, string> = {
  marketing: 'Marketing and public pages',
  app: 'The app shell',
  operator: 'Operator consoles',
}

/**
 * The budgets. Lift 7a names marketing LCP 2.0s / INP 200ms / CLS 0.1, app-shell
 * LCP 2.5s / INP 200ms, and heavy operator surfaces INP 300ms.
 *
 * Two values the plan does not name are filled in rather than left blank, because a
 * budget table with holes cannot be scored: the app shell and the operator consoles
 * both inherit CLS 0.1 (layout stability is universal, not a marketing concern), and
 * the operator class inherits the app shell's 2.5s LCP. Only INP is relaxed for
 * operators, which is the exception the plan actually grants.
 */
export const VITALS_BUDGETS: Record<BudgetClass, VitalsBudget> = {
  marketing: { lcpMs: 2000, inpMs: 200, cls: 0.1 },
  app: { lcpMs: 2500, inpMs: 200, cls: 0.1 },
  operator: { lcpMs: 2500, inpMs: 300, cls: 0.1 },
}

/** The three metrics a budget governs. FCP and TTFB are collected but not budgeted:
 *  they are diagnostics for a failing LCP, not goals of their own. */
export const BUDGETED_METRICS = ['LCP', 'INP', 'CLS'] as const
export type BudgetedMetric = (typeof BUDGETED_METRICS)[number]

export function isBudgetedMetric(name: VitalName | string): name is BudgetedMetric {
  return (BUDGETED_METRICS as readonly string[]).includes(name)
}

export function budgetFor(cls: BudgetClass, metric: BudgetedMetric): number {
  const b = VITALS_BUDGETS[cls]
  return metric === 'LCP' ? b.lcpMs : metric === 'INP' ? b.inpMs : b.cls
}

// ── Classifying a templated path ────────────────────────────────────────────────
// Order matters: the operator test runs FIRST, because an operator surface can live
// underneath a public prefix (/spaces/<slug>/manage is a console, not a profile).

/** Anything under these, or containing /manage, is a console. */
const OPERATOR_PREFIXES = [
  '/admin',
  '/edit',
  '/email-studio',
  '/manage',
  '/studio',
  '/crew',
  '/outreach',
] as const

/** Contained anywhere in the path, not just at the front. */
const OPERATOR_SEGMENTS = ['/manage', '/edit'] as const

/**
 * Public, anonymous-reachable, indexed. The (marketing) route group plus the public
 * surfaces that sit outside it (the root landing, help, legal, the public entity
 * profiles). Anything not listed here and not an operator surface is app shell, which
 * is the safe default: a mislabelled app page gets the 2.5s budget, never the 2.0s one.
 */
const MARKETING_PREFIXES = [
  '/about',
  '/beta',
  '/build',
  '/calm-down-fast',
  '/demo',
  '/discover',
  '/feel-less-awkward-in-groups',
  '/find-like-minded-people',
  '/for',
  '/friendship-as-an-adult',
  '/help',
  '/host-a-recurring-gathering',
  '/how-it-works',
  '/how-to-be-more-social',
  '/how-to-build-community',
  '/how-to-reconnect-with-old-friends',
  '/how-to-run-a-community-space',
  '/how-to-start-a-circle',
  '/join',
  '/lead-funnel-kit',
  '/life-after-the-feed',
  '/listings',
  '/loneliness',
  '/meet-people-new-city',
  '/onboarding',
  '/podcasts',
  '/practice',
  '/pricing',
  '/print',
  '/privacy',
  '/rsvp',
  '/sign-in',
  '/sites',
  '/social-life-without-drinking',
  '/spotlight',
  '/spread',
  '/start',
  '/subscribe',
  '/terms',
  '/the-community',
  '/the-lab',
  '/the-quest',
  '/tools-for-community-builders',
  '/vs',
  '/waitlist',
  '/what-is-a-third-space',
  '/what-is-frequency',
] as const

/** Public entity profiles: indexed pages a stranger can land on cold. */
const PUBLIC_ENTITY_PREFIXES = ['/spaces/', '/events/', '/people/', '/u/', '/g/', '/q/'] as const

function startsWithSegment(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

/**
 * Map a templated path onto its budget class. PURE, and total: every string gets a
 * class, so the readout can join budgets to p75 rows with no null handling.
 */
export function budgetClassFor(path: string | null | undefined): BudgetClass {
  const p = (path ?? '/').split('?')[0] || '/'

  if (OPERATOR_SEGMENTS.some((seg) => p.includes(seg))) return 'operator'
  if (OPERATOR_PREFIXES.some((pre) => startsWithSegment(p, pre))) return 'operator'

  if (p === '/' || p === '/spaces' || p === '/practice') return 'marketing'
  if (MARKETING_PREFIXES.some((pre) => startsWithSegment(p, pre))) return 'marketing'
  // A bare public-entity prefix (/spaces, /events) is the app's own index; only a page
  // BELOW it is the public profile.
  if (PUBLIC_ENTITY_PREFIXES.some((pre) => p.startsWith(pre) && p.length > pre.length)) {
    return 'marketing'
  }

  return 'app'
}

// ── Scoring ─────────────────────────────────────────────────────────────────────

/** docs/PRESENTATION.md's legend. `unknown` = not enough samples to say anything. */
export type BudgetStatus = 'pass' | 'watch' | 'fail' | 'unknown'

export const BUDGET_STATUS_ICON: Record<BudgetStatus, string> = {
  pass: '✅',
  watch: '⚠️',
  fail: '🔴',
  unknown: '⏳',
}

export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = {
  pass: 'Within budget',
  watch: 'Close to the limit',
  fail: 'Over budget',
  unknown: 'Not enough data',
}

/** Below this many samples a p75 is noise, not a measurement. Web Vitals field
 *  guidance wants far more; this is the floor at which we will show a number at all. */
export const MIN_SAMPLES = 5

/** Within 10% under the budget is a warning: it is one regression from a breach. */
const WATCH_MARGIN = 0.9

/** Pure: score one p75 against its budget. */
export function scoreVital(
  p75: number | null,
  budget: number,
  samples: number,
): BudgetStatus {
  if (p75 === null || !Number.isFinite(p75) || samples < MIN_SAMPLES) return 'unknown'
  if (p75 > budget) return 'fail'
  if (p75 >= budget * WATCH_MARGIN) return 'watch'
  return 'pass'
}

/** The worst status in a set, for a per-route or per-class roll-up. `unknown` never
 *  outranks a real result: a route with one failing metric fails. */
export function worstStatus(statuses: readonly BudgetStatus[]): BudgetStatus {
  const rank: Record<BudgetStatus, number> = { fail: 0, watch: 1, pass: 2, unknown: 3 }
  return statuses.reduce<BudgetStatus>(
    (worst, s) => (rank[s] < rank[worst] ? s : worst),
    'unknown',
  )
}

/** Pure: format a p75 for display. Times round to 10ms under a second and to 2dp of a
 *  second above it; CLS keeps 3dp. */
export function formatVital(metric: BudgetedMetric, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '–'
  if (metric === 'CLS') return value.toFixed(3)
  return value < 1000 ? `${Math.round(value / 10) * 10}ms` : `${(value / 1000).toFixed(2)}s`
}

/** Pure: the trend between this window and the one before it, as a signed percentage
 *  of the previous value. Positive means the metric got WORSE (all three are
 *  lower-is-better). Null when there is no comparable previous window. */
export function trendPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || !Number.isFinite(previous) || previous <= 0) {
    return null
  }
  return Math.round(((current - previous) / previous) * 100)
}
