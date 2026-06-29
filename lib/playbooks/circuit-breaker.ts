// The circuit breaker (Resonance Engine Phase 3 · ADR-384 · docs/NEXT-GEN-CRM.md
// "two safety rails"). It auto-PAUSES any playbook whose recent dismiss-rate (or unsubscribe-rate,
// once that signal lands) spikes above its LEARNED baseline, so the Today orchestrator + the execute
// path skip a misfiring playbook before it sprays the room. The structural defense against
// autonomy-theater spam, which is brand-fatal for a resonate-not-extract product.
//
// Two halves, deliberately split (the testability law, mirroring lib/ai/vera/today.ts +
// lib/traits/compute.ts):
//   • PURE threshold math (`computeBreakerState`, `tripsBreaker`) — no IO. Given recent run
//     COUNTS for a playbook + a baseline, decides paused/open. Unit-tested: a spike trips, calm
//     does not, cold-start (no runs) never trips.
//   • IO (`getPausedPlaybooks`, `isPlaybookPaused`) — reads playbook_runs through the untyped admin
//     client (ADR-246, the runs table is not in the generated DB types). FAIL-CLOSED for OUTBOUND:
//     an error reading breaker state for a `suggest`/outbound playbook SUPPRESSES it (treat as
//     paused), because a misfire there reaches a member; an `auto` in-product playbook (reversible,
//     no member touch) may proceed on a read error. The choice is documented below + in the ADR.
//
// authz-delegated: this is a READ helper. It performs no mutation; the only writes to playbook_runs
// go through lib/playbooks/runs.ts (the authz-delegated audit front door). The gate lives at the
// staff/owner-gated call sites that build Today + execute a playbook.

import { createAdminClient } from '@/lib/supabase/admin'
import { getPlaybook, type AutonomyTier } from './registry'

/** The recent-run tallies for ONE playbook (a window of playbook_runs rows). The pure math's input. */
export interface PlaybookRunTally {
  /** Total terminal runs in the window (done + dismissed + failed). The denominator. */
  total: number
  /** Dismissals in the window ("Not now" = a rejection signal). */
  dismissed: number
  /** Unsubscribes attributed to the playbook in the window (0 until that signal is wired). */
  unsubscribed: number
}

/** The breaker verdict for one playbook. PURE output. */
export interface BreakerState {
  paused: boolean
  /** The observed recent rejection rate (dismiss + unsub) / total, 0..1. */
  rate: number
  /** The baseline this was measured against, 0..1. */
  baseline: number
  /** A short, surface-ready reason (in voice, no dashes). */
  reason: string
}

// ── Tunable thresholds (pure constants; the only knobs) ──────────────────────────
// A playbook needs a MINIMUM number of recent runs before the breaker can trip, so a tiny sample
// (one unlucky dismissal out of two) never trips it. The spike is BOTH an absolute floor (a high
// rejection rate on its own is bad) AND a relative jump over the learned baseline (this playbook
// is doing markedly worse than its own norm).
export const BREAKER_MIN_RUNS = 8
/** An absolute rejection-rate ceiling: above this, the playbook trips regardless of baseline. */
export const BREAKER_ABSOLUTE_RATE = 0.6
/** The relative spike: tripping also requires the recent rate to exceed baseline by this margin. */
export const BREAKER_SPIKE_MARGIN = 0.25
/** The default baseline when a playbook has no learned history yet (a calm prior). */
export const BREAKER_DEFAULT_BASELINE = 0.2

/** The recent rejection rate for a tally: (dismissed + unsubscribed) / total. PURE. 0 when no runs
 *  (cold start), so a playbook with no history reads as perfectly calm. Clamped to [0, 1]. */
export function rejectionRate(t: PlaybookRunTally): number {
  if (!t || t.total <= 0) return 0
  const rejected = Math.max(0, t.dismissed) + Math.max(0, t.unsubscribed)
  return Math.max(0, Math.min(1, rejected / t.total))
}

/**
 * Does this tally TRIP the breaker against its baseline? PURE + deterministic. Three gates, ALL
 * required, so the breaker is conservative (a false pause silences a good playbook):
 *   1. enough runs to be meaningful (>= BREAKER_MIN_RUNS), else never trips (cold-start safe);
 *   2. the recent rate clears the absolute ceiling (BREAKER_ABSOLUTE_RATE); AND
 *   3. it also exceeds the learned baseline by the spike margin (a real regression, not a high norm).
 */
export function tripsBreaker(tally: PlaybookRunTally, baseline: number): boolean {
  if (!tally || tally.total < BREAKER_MIN_RUNS) return false
  const rate = rejectionRate(tally)
  const base = Number.isFinite(baseline) ? Math.max(0, Math.min(1, baseline)) : BREAKER_DEFAULT_BASELINE
  return rate >= BREAKER_ABSOLUTE_RATE && rate >= base + BREAKER_SPIKE_MARGIN
}

/** The full breaker state for one playbook (the pure verdict + the numbers for the surface). PURE. */
export function computeBreakerState(tally: PlaybookRunTally, baseline: number): BreakerState {
  const rate = rejectionRate(tally)
  const base = Number.isFinite(baseline) ? Math.max(0, Math.min(1, baseline)) : BREAKER_DEFAULT_BASELINE
  const paused = tripsBreaker(tally, base)
  const reason = paused
    ? 'Paused for now. Too many people are waving this one off lately.'
    : 'Running normally.'
  return { paused, rate, baseline: base, reason }
}

// ── IO: read playbook_runs, compute every playbook's breaker state (fail-safe read) ──
// The breaker measures a RECENT window against a LEARNED baseline (the playbook's own older norm),
// so a playbook that is suddenly doing worse than itself trips, while one with a steadily high (but
// expected) rejection rate does not.

/** How many days of runs make up the "recent" window the breaker watches. */
const RECENT_WINDOW_DAYS = 14
/** How many days BEFORE the recent window make up the learned-baseline window. */
const BASELINE_WINDOW_DAYS = 60

type RunRow = { playbook_id: string; status: string; created_at: string }

/** Tally the recent + baseline windows per playbook from raw run rows + compute the paused set. PURE
 *  (no IO): the read side feeds it rows, so the windowing + threshold logic is unit-testable. */
export function pausedFromRuns(rows: RunRow[], now: number): Set<string> {
  const recentSince = new Date(now - RECENT_WINDOW_DAYS * 86_400_000).toISOString()
  const recent = new Map<string, PlaybookRunTally>()
  const baseline = new Map<string, PlaybookRunTally>()
  const bump = (m: Map<string, PlaybookRunTally>, id: string, status: string) => {
    const t = m.get(id) ?? { total: 0, dismissed: 0, unsubscribed: 0 }
    if (status === 'done' || status === 'dismissed' || status === 'failed') t.total += 1
    if (status === 'dismissed') t.dismissed += 1
    if (status === 'unsubscribed') t.unsubscribed += 1
    m.set(id, t)
  }
  for (const r of rows) {
    if (!r.playbook_id) continue
    if (r.created_at >= recentSince) bump(recent, r.playbook_id, r.status)
    else bump(baseline, r.playbook_id, r.status)
  }
  const paused = new Set<string>()
  for (const [id, tally] of recent) {
    const baseTally = baseline.get(id)
    const baseRate = baseTally && baseTally.total > 0 ? rejectionRate(baseTally) : BREAKER_DEFAULT_BASELINE
    if (tripsBreaker(tally, baseRate)) paused.add(id)
  }
  return paused
}

/** The throwing core read: load the run window + compute the paused set, or THROW on any read error
 *  (so `readBreakerStatus` can distinguish a clean empty from a failure for fail-closed-for-outbound). */
async function getPausedPlaybooksOrThrow(opts: { spaceId?: string | null; now?: number } = {}): Promise<Set<string>> {
  const now = opts.now ?? Date.now()
  const baselineSince = new Date(now - BASELINE_WINDOW_DAYS * 86_400_000).toISOString()
  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        gte: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{ data: RunRow[] | null; error: unknown }>
          then: (onfulfilled: (r: { data: RunRow[] | null; error: unknown }) => unknown) => Promise<unknown>
        }
      }
    }
  }
  // One read over the whole baseline window (it contains the recent window); split client-side.
  const base = admin.from('playbook_runs').select('playbook_id, status, created_at').gte('created_at', baselineSince)
  const { data, error } = opts.spaceId
    ? await base.eq('space_id', opts.spaceId)
    : await (base as unknown as Promise<{ data: RunRow[] | null; error: unknown }>)
  if (error) throw error
  return pausedFromRuns(data ?? [], now)
}

/**
 * The set of playbook ids the breaker currently has PAUSED, computed from playbook_runs. FAIL-SAFE:
 * on any read error this returns an empty set (no playbook reported paused HERE); the per-playbook
 * fail-CLOSED decision for outbound lives in `isPlaybookPaused` / `readBreakerStatus`, which treat a
 * read failure as paused for a suggest/outbound playbook. Pass a `spaceId` to scope to one Space's runs.
 */
export async function getPausedPlaybooks(opts: { spaceId?: string | null; now?: number } = {}): Promise<Set<string>> {
  try {
    return await getPausedPlaybooksOrThrow(opts)
  } catch {
    return new Set()
  }
}

/** The breaker read for a scope, carrying whether the read DEGRADED (failed). The Today filter +
 *  execute path use `degraded` to make the fail-closed-for-outbound choice explicit: on a degraded
 *  read, an outbound playbook is suppressed, an in-product `auto` one may proceed. */
export interface BreakerStatus {
  paused: Set<string>
  /** True when the underlying playbook_runs read FAILED (so `paused` is not authoritative). */
  degraded: boolean
}

/**
 * Read the breaker status for a scope, distinguishing a clean empty result from a failed read.
 * On success: { paused, degraded: false }. On any error: { paused: empty, degraded: true } so the
 * caller can fail-closed for outbound. Pass a `spaceId` to scope to one Space's runs.
 */
export async function readBreakerStatus(opts: { spaceId?: string | null; now?: number } = {}): Promise<BreakerStatus> {
  try {
    const paused = await getPausedPlaybooksOrThrow(opts)
    return { paused, degraded: false }
  } catch {
    return { paused: new Set(), degraded: true }
  }
}

/**
 * Is ONE playbook paused right now? The single gate the Today candidate filter + the execute path
 * consult. FAIL-CLOSED for OUTBOUND: when the breaker read fails AND the playbook is outbound
 * (autonomyTier !== 'auto', i.e. a suggest/never_auto member-facing sequence), this returns true
 * (suppress), because a misfire there reaches a member. An `auto` in-product playbook (reversible,
 * no member touch) may proceed on a read error (returns false). Documented in ADR-384.
 *
 * Pass a precomputed `pausedSet` (from getPausedPlaybooks) to avoid re-reading in a loop; omit it to
 * read on demand.
 */
export async function isPlaybookPaused(
  playbookId: string,
  opts: { spaceId?: string | null; pausedSet?: Set<string>; now?: number } = {},
): Promise<boolean> {
  const tier: AutonomyTier = getPlaybook(playbookId)?.autonomyTier ?? 'suggest'
  // A precomputed set means the caller already read the breaker; trust it (no degraded signal here).
  if (opts.pausedSet) return opts.pausedSet.has(playbookId)
  const { paused, degraded } = await readBreakerStatus({ spaceId: opts.spaceId, now: opts.now })
  // A degraded read: fail-closed for outbound (suppress), proceed for in-product auto.
  if (degraded) return failClosedForTier(tier)
  return paused.has(playbookId)
}

/** Whether an UNKNOWN-state breaker read should suppress a playbook of this tier. PURE helper the
 *  execute path uses to make the fail-closed choice explicit + testable (outbound suppresses). */
export function failClosedForTier(tier: AutonomyTier): boolean {
  return tier !== 'auto'
}
