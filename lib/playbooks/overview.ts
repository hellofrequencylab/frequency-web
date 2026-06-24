// The Playbooks SURFACE read layer (Resonance Engine · ADR-389 · docs/ADMIN-BUILD-PLAN.md Phase 3a).
// The fail-safe reads the /admin/crm/playbooks registry page composes: the run-history rows + the
// week's run tallies. The playbook CATALOG itself is the code registry (lib/playbooks/registry.ts,
// the source of truth); this module only reads the RUNTIME signal the registry cannot know: what
// actually ran, and how it landed.
//
// FAIL-SAFE BY CONSTRUCTION. playbook_runs is service-role only (RLS on, no client policy) and is not
// in the generated DB types until they regenerate (ADR-246), so it is reached through the untyped
// admin client. Every read swallows any error (a missing table pre-migration, an RLS hiccup, an empty
// prod table) and returns zeros / an empty list, so the page degrades to a calm empty state and never
// crashes. The autonomy engine defaults to suggest_only platform-wide, so "no runs yet" is the honest
// expected first state.
//
// authz-delegated: these are READ helpers (no mutation). The gate lives at the call site (the
// staff-gated /admin/crm/playbooks page, requireAdmin('janitor')).

import { createAdminClient } from '@/lib/supabase/admin'
import { getPlaybook, PLAYBOOK_REGISTRY } from './registry'
import type { PlaybookRunStatus } from './runs'

// ── Types ─────────────────────────────────────────────────────────────────────

/** One recent playbook run, projected for the history list. */
export interface PlaybookRunRow {
  /** The playbook slug (the registry id). */
  playbookId: string
  /** The operator-facing playbook name (from the registry), or the raw slug when unknown. */
  playbookName: string
  /** The run lifecycle status. */
  status: PlaybookRunStatus
  /** A short, plain outcome detail when one was recorded, else null. */
  outcome: string | null
  /** When the run started (ISO), or null when absent. */
  startedAt: string | null
}

/** The registry + run tallies the StatCard row reads, all fail-safe to zeros. */
export interface PlaybookOverview {
  /** How many playbooks the code registry declares (always available, never an IO read). */
  totalPlaybooks: number
  /** Terminal runs (done + dismissed + failed) recorded in the last 7 days. */
  runsThisWeek: number
  /** Completed runs ("done") in the last 7 days. */
  doneThisWeek: number
  /** True when the run read DEGRADED (the table is absent or the read failed), so the counts are
   *  not authoritative and the page should say "nothing yet" rather than imply real zeros. */
  degraded: boolean
}

const STATUS_VALUES: readonly PlaybookRunStatus[] = ['proposed', 'done', 'dismissed', 'failed']
function asStatus(v: unknown): PlaybookRunStatus {
  return typeof v === 'string' && (STATUS_VALUES as readonly string[]).includes(v) ? (v as PlaybookRunStatus) : 'proposed'
}

const WEEK_MS = 7 * 86_400_000

/** Resolve a run's display name from the code registry (the source of truth for names), falling back
 *  to the raw slug so an unknown / retired slug still reads. PURE. */
export function playbookDisplayName(playbookId: string): string {
  return getPlaybook(playbookId)?.name ?? playbookId
}

type RunReadRow = { playbook_id: string | null; status: string | null; outcome: string | null; started_at: string | null }

// ── IO: the fail-safe platform read over playbook_runs ──────────────────────────

/**
 * The recent run history + the week's tallies in one fail-safe read. Reads the last `limit` runs
 * (newest first) across the platform and counts the terminal ones inside the 7-day window. FAIL-SAFE:
 * any error (a missing table, an RLS hiccup) returns an empty list + a zeroed, degraded overview, so
 * the registry page shows its empty state. The caller MUST have passed the staff floor first.
 */
export async function getPlaybookActivity(opts: { limit?: number; now?: number } = {}): Promise<{
  overview: PlaybookOverview
  runs: PlaybookRunRow[]
}> {
  const limit = Math.max(1, Math.min(100, opts.limit ?? 20))
  const now = opts.now ?? Date.now()
  const totalPlaybooks = PLAYBOOK_REGISTRY.length
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (col: string, o: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: RunReadRow[] | null; error: unknown }>
          }
        }
      }
    }
    const { data, error } = await admin
      .from('playbook_runs')
      .select('playbook_id, status, outcome, started_at')
      .order('started_at', { ascending: false })
      .limit(limit)
    if (error || !data) {
      return { overview: { totalPlaybooks, runsThisWeek: 0, doneThisWeek: 0, degraded: true }, runs: [] }
    }

    const weekFloor = new Date(now - WEEK_MS).toISOString()
    let runsThisWeek = 0
    let doneThisWeek = 0
    const runs: PlaybookRunRow[] = data.map((r) => {
      const status = asStatus(r.status)
      const playbookId = typeof r.playbook_id === 'string' ? r.playbook_id : ''
      const startedAt = typeof r.started_at === 'string' ? r.started_at : null
      const terminal = status === 'done' || status === 'dismissed' || status === 'failed'
      if (terminal && startedAt && startedAt >= weekFloor) {
        runsThisWeek += 1
        if (status === 'done') doneThisWeek += 1
      }
      return {
        playbookId,
        playbookName: playbookId ? playbookDisplayName(playbookId) : 'A playbook',
        status,
        outcome: typeof r.outcome === 'string' && r.outcome.trim().length ? r.outcome.trim().slice(0, 200) : null,
        startedAt,
      }
    })

    return { overview: { totalPlaybooks, runsThisWeek, doneThisWeek, degraded: false }, runs }
  } catch {
    return { overview: { totalPlaybooks, runsThisWeek: 0, doneThisWeek: 0, degraded: true }, runs: [] }
  }
}
