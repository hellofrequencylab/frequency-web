import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

// Per-Pillar Zap attribution — the Pillar split's payoff (Practice Library Phase 4, ADR-1131;
// the split columns shipped Phase 1, ADR-438's two locked variables).
//
// A practice has one primary Pillar (`domain_id`) and optionally a secondary
// (`secondary_domain_id` + `primary_pct`, 50–100, default 75). The split ATTRIBUTES a log's
// earned Zaps across Pillars for per-Pillar progress — 12 Zaps at 75/25 → 9 primary, 3
// secondary — and NEVER changes the wallet total: the invariant this module owns is
// `primary + secondary === zaps_awarded`, exactly, in integers (no inflation lever).
//
// The ledger is FROZEN at log time: `logPractice` snapshots the split onto the log row
// (practice_logs.pillar_id / secondary_pillar_id / primary_pct, migration `20270323000000`)
// in the same write as `zaps_awarded`, for the same reason `zaps_awarded` itself is frozen —
// the practice can be re-categorized or re-balanced long after the log, and a ledger that
// re-attributes history on every curator edit is not a ledger. Rows that predate the freeze
// carry NULL and are attributed by the practice's CURRENT split (the documented fallback in
// `attributeLogs`), so history is covered without a backfill guess.
//
// Two layers, kept apart so the math is testable without a database (the quality.ts /
// health.ts pattern): the PURE half (normalize / split / rollup, unit-tested in
// attribution.test.ts) and the thin `getMemberPillarZaps` read at the bottom (untyped admin
// handle, ADR-246 — the snapshot columns are newer than the generated types).

// ============================================================================
// Pure: the split
// ============================================================================

/** A practice's Pillar split as the attribution math reads it. */
export interface PillarSplit {
  /** Primary Pillar id (`practices.domain_id`, or the log-row snapshot). */
  pillarId: string | null
  /** Secondary Pillar id; null = single-Pillar (100% primary). */
  secondaryPillarId: string | null
  /** Primary share 50–100; null falls back to the default. */
  primaryPct: number | null
}

/** ADR-438: the slider default (75/25). */
export const PRIMARY_PCT_DEFAULT = 75
/** ADR-438: floor 50 keeps the primary dominant ("one primary Pillar" holds). */
export const PRIMARY_PCT_FLOOR = 50

/** The effective primary share for a split: 100 with no (or a degenerate self-)secondary,
 *  else `primaryPct` clamped into [50, 100], defaulting to 75. Total function — any junk in,
 *  a valid share out. */
export function normalizePrimaryPct(split: PillarSplit): number {
  if (!split.secondaryPillarId || split.secondaryPillarId === split.pillarId) return 100
  const raw = split.primaryPct
  const pct = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : PRIMARY_PCT_DEFAULT
  return Math.min(100, Math.max(PRIMARY_PCT_FLOOR, pct))
}

/** Divide a log's earned Zaps across the split. CONSERVATION IS THE CONTRACT:
 *  `primary + secondary === total` exactly (integers). The secondary share floors, so the
 *  remainder rides with the primary — at 50/50 an odd total (15 → 8/7) still keeps the
 *  primary dominant, matching the ADR-438 floor's intent. */
export function splitZaps(total: number, split: PillarSplit): { primary: number; secondary: number } {
  const t = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0))
  const pct = normalizePrimaryPct(split)
  const secondary = Math.floor((t * (100 - pct)) / 100)
  return { primary: t - secondary, secondary }
}

// ============================================================================
// Pure: the rollup
// ============================================================================

/** A paid log row as the rollup reads it. `snapshot` is the frozen log-time split; null when
 *  the row predates the freeze (or the snapshot write failed), in which case the practice's
 *  current split from `fallbackByPractice` attributes it. */
export interface AttributedLogRow {
  practiceId: string | null
  zaps: number | null
  snapshot: PillarSplit | null
}

/** Per-Pillar earned-Zap totals. `byPillar` is keyed by Pillar id; `unattributed` holds Zaps
 *  from logs with no resolvable Pillar (a no-Pillar practice, or a deleted one with no
 *  snapshot). `total` is the wallet-side sum, and the conservation invariant holds:
 *  Σ byPillar + unattributed === total. */
export interface PillarZapTotals {
  byPillar: Record<string, number>
  unattributed: number
  total: number
}

/** Roll paid logs up into per-Pillar totals. The FROZEN snapshot always wins; only a null
 *  snapshot consults `fallbackByPractice` (the practice's current split). */
export function attributeLogs(
  rows: readonly AttributedLogRow[],
  fallbackByPractice: ReadonlyMap<string, PillarSplit>,
): PillarZapTotals {
  const byPillar: Record<string, number> = {}
  let unattributed = 0
  let total = 0
  const add = (pillarId: string | null, zaps: number) => {
    if (zaps <= 0) return
    if (!pillarId) unattributed += zaps
    else byPillar[pillarId] = (byPillar[pillarId] ?? 0) + zaps
  }
  for (const row of rows) {
    const zaps = Math.max(0, Math.floor(row.zaps ?? 0))
    if (zaps <= 0) continue
    total += zaps
    const split =
      row.snapshot ?? (row.practiceId ? (fallbackByPractice.get(row.practiceId) ?? null) : null)
    if (!split || !split.pillarId) {
      unattributed += zaps
      continue
    }
    const { primary, secondary } = splitZaps(zaps, split)
    add(split.pillarId, primary)
    add(split.secondaryPillarId, secondary)
  }
  return { byPillar, unattributed, total }
}

// ============================================================================
// The read (server, untyped admin handle — ADR-246)
// ============================================================================

function db(): SupabaseClient {
  return createAdminClient()
}

const EMPTY: PillarZapTotals = { byPillar: {}, unattributed: 0, total: 0 }

/** A member's earned Zaps attributed per Pillar, from the frozen log-time ledger (with the
 *  current-split fallback for pre-freeze rows). Fail-safe: any read error returns zeros, the
 *  earned.ts convention — a progress panel must never break a page. */
export async function getMemberPillarZaps(profileId: string): Promise<PillarZapTotals> {
  try {
    const { data, error } = await db()
      .from('practice_logs')
      .select('practice_id, zaps_awarded, pillar_id, secondary_pillar_id, primary_pct')
      .eq('profile_id', profileId)
      .gt('zaps_awarded', 0)
    if (error) return EMPTY
    const raw = (data ?? []) as {
      practice_id: string | null
      zaps_awarded: number | null
      pillar_id: string | null
      secondary_pillar_id: string | null
      primary_pct: number | null
    }[]
    const rows: AttributedLogRow[] = raw.map((r) => ({
      practiceId: r.practice_id,
      zaps: r.zaps_awarded,
      snapshot: r.pillar_id
        ? { pillarId: r.pillar_id, secondaryPillarId: r.secondary_pillar_id, primaryPct: r.primary_pct }
        : null,
    }))

    // Pre-freeze rows: fetch the CURRENT split for just the practices they name.
    const needFallback = [...new Set(rows.filter((r) => !r.snapshot && r.practiceId).map((r) => r.practiceId as string))]
    const fallback = new Map<string, PillarSplit>()
    if (needFallback.length > 0) {
      const { data: practices } = await db()
        .from('practices')
        .select('id, domain_id, secondary_domain_id, primary_pct')
        .in('id', needFallback)
      for (const p of (practices ?? []) as {
        id: string
        domain_id: string | null
        secondary_domain_id: string | null
        primary_pct: number | null
      }[]) {
        fallback.set(p.id, {
          pillarId: p.domain_id,
          secondaryPillarId: p.secondary_domain_id,
          primaryPct: p.primary_pct,
        })
      }
    }
    return attributeLogs(rows, fallback)
  } catch {
    return EMPTY
  }
}
