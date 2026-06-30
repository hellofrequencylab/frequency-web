// PER-SPACE OUTCOME METERING (Resonance Engine Phase 6 · ADR-387). We meter the engine on
// OUTCOME-SHAPED units that fit the resonate-not-extract ethos, NEVER on extractive per-message
// counts charged to a member tier (that would feel like a shakedown). The three units, all read off
// the audit trail the engine already writes:
//   • playbook actions run   — playbook_runs with status 'done' in the period (the work the engine did)
//   • members re-activated    — distinct subjects of a 'done' run whose playbook is a re-activation one
//   • advocacy invites accepted — distinct subjects of a 'done' advocacy/referral run
// These are DELIVERED VALUE for the operator, so consumption metering is reserved for Space / operator
// plans (this module), never the personal member tiers.
//
// EVERYTHING IS DISPLAY-ONLY + FAIL-SAFE. This is a READ: it never charges, never blocks an action,
// never throws into a caller. A DB error / pre-seed state yields a zeroed usage with no limit reached,
// so a transient hiccup can NEVER lock an operator out of their engine or wrongly claim a ceiling hit.
// The limit it carries is the SOFT, plan-shaped ceiling that powers the contextual upsell (the
// ceiling event the cockpit reads), not a hard gate.
//
// The `playbook_runs` table is service-role only (RLS enabled, no client policy) and not in the
// generated DB types yet (ADR-246), so it is reached untyped. EVERY read is BOUND to space_id (the
// tenancy invariant), so a Space A read can never count Space B's runs. The caller gates authorization
// (the cockpit reads this only for an owner/admin who already passed canUseCrm); this module is a pure
// scoped READER (no mutation), so it is not a confused-deputy write.

import { createAdminClient } from '@/lib/supabase/admin'
import { asSpacePlan, type SpacePlan } from '@/lib/pricing/plans'

// ── The outcome units + plan-shaped monthly ceilings (PURE config) ───────────────────────────────

/** The three outcome-shaped units we meter on. */
export type OutcomeUnit = 'playbook_actions' | 'members_reactivated' | 'advocacy_accepted'

/** The plan-shaped MONTHLY ceiling for playbook actions run, the volume lever in the tier ladder
 *  (Pro gets "larger action volume"). `null` = unlimited (no ceiling, no upsell trigger). These are
 *  SOFT ceilings that power the contextual upsell, not hard gates: hitting one never blocks an action,
 *  it only surfaces a tasteful "ready for more room" nudge. The free wedge gets a generous starter
 *  volume so the engine is genuinely useful before any upsell. PURE.
 *
 *  Four-tier ladder (ADR-472): free / pro / business / nonprofit / organization. Pro carries the
 *  generous 2000 volume (so no legacy Space regresses once it narrows to pro); the full-depth tiers
 *  (Business / Nonprofit / Organization) are unlimited. */
const PLAN_PLAYBOOK_ACTION_CEILING: Record<SpacePlan, number | null> = {
  free: 50,
  pro: 2000,
  business: null,
  nonprofit: null,
  organization: null,
}

/** The monthly playbook-action ceiling for a plan (the soft volume lever). `null` = unlimited.
 *  PURE, fail-safe: an unknown plan reads as `free` (asSpacePlan), the most conservative ceiling. */
export function playbookActionCeiling(plan: string | null | undefined): number | null {
  return PLAN_PLAYBOOK_ACTION_CEILING[asSpacePlan(plan)]
}

// Which playbook ids count as re-activation / advocacy outcomes. v1 matches on the slug prefix the
// registry uses (lib/playbooks/registry.ts owned by Phase 5), so this stays decoupled: a substring
// match, lowercased, so a new winback/advocacy playbook id is counted with no change here. PURE.
const REACTIVATION_MARKERS = ['winback', 'reengage', 'reactivat', 'streak', 'dunning'] as const
const ADVOCACY_MARKERS = ['advocacy', 'advocate', 'referral', 'refer', 'invite', 'connect', 'intro'] as const

/** Does a playbook id read as a re-activation outcome? PURE, fail-safe (a non-string reads false). */
export function isReactivationPlaybook(playbookId: unknown): boolean {
  return typeof playbookId === 'string' && REACTIVATION_MARKERS.some((m) => playbookId.toLowerCase().includes(m))
}

/** Does a playbook id read as an advocacy outcome? PURE, fail-safe. */
export function isAdvocacyPlaybook(playbookId: unknown): boolean {
  return typeof playbookId === 'string' && ADVOCACY_MARKERS.some((m) => playbookId.toLowerCase().includes(m))
}

// ── The usage read-model + the ceiling math (PURE) ───────────────────────────────────────────────

/** A Space's outcome usage for the current period + the soft ceiling state. Display-only. */
export interface SpaceOutcomeUsage {
  /** Playbook actions run (status 'done') in the period. The metered volume unit. */
  playbookActions: number
  /** Distinct members re-activated by a re-activation playbook in the period. */
  membersReactivated: number
  /** Distinct advocacy invites accepted (advocacy playbook done) in the period. */
  advocacyAccepted: number
  /** The plan's soft monthly playbook-action ceiling, or null (unlimited). */
  ceiling: number | null
  /** Fraction of the ceiling used [0..1+], 0 when unlimited. PURE-derived. */
  ratio: number
  /** Has the soft ceiling been reached? Always false when unlimited. Powers the upsell trigger. */
  atCeiling: boolean
  /** Did the read DEGRADE (an error / pre-seed state)? When true, every count is 0 and atCeiling is
   *  false, so a hiccup never claims a ceiling hit. The cockpit can choose to show nothing. */
  degraded: boolean
}

/** A zeroed, never-at-ceiling usage. The fail-safe shape: a degrade returns this, so a read error
 *  can never block an action or wrongly trigger the upsell. PURE. */
export function emptyUsage(plan: string | null | undefined, degraded = false): SpaceOutcomeUsage {
  return {
    playbookActions: 0,
    membersReactivated: 0,
    advocacyAccepted: 0,
    ceiling: playbookActionCeiling(plan),
    ratio: 0,
    atCeiling: false,
    degraded,
  }
}

/** The usage ratio against the ceiling [0..1+]. PURE. Unlimited (null ceiling) or a zero/negative
 *  ceiling reads as 0 (never "at ceiling"). */
export function usageRatio(used: number, ceiling: number | null): number {
  if (ceiling == null || ceiling <= 0) return 0
  return Math.max(0, used) / ceiling
}

/** Is the soft ceiling reached? PURE. Unlimited (null) OR a non-positive ceiling never is (it reads
 *  as "no meaningful ceiling", consistent with usageRatio). The upsell trigger reads this. */
export function isAtCeiling(used: number, ceiling: number | null): boolean {
  if (ceiling == null || ceiling <= 0) return false
  return Math.max(0, used) >= ceiling
}

// One UTC-month window for the period (mirrors lib/ai/usage.ts's day-window style, scaled to a month).
function monthStartIso(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
  return d.toISOString()
}

// ── IO: the fail-safe scoped read over playbook_runs (untyped, ADR-246) ──────────────────────────

type RunRow = { playbook_id: string | null; status: string | null; subject_id: string | null }

/**
 * Read a Space's outcome usage for the current month. DISPLAY-ONLY + FAIL-SAFE: any error / missing
 * table / empty data yields a zeroed `emptyUsage(plan, degraded=true)`, so it never blocks an action
 * or wrongly trips the upsell. Every read is BOUND to space_id (tenancy) AND to status 'done' (only
 * completed work counts). The caller gates authorization (owner/admin who passed canUseCrm).
 */
export async function getSpaceOutcomeUsage(
  spaceId: string,
  plan: string | null | undefined,
): Promise<SpaceOutcomeUsage> {
  if (!spaceId) return emptyUsage(plan, true)
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              gte: (col: string, val: string) => Promise<{ data: RunRow[] | null; error: unknown }>
            }
          }
        }
      }
    }
    const { data, error } = await db
      .from('playbook_runs')
      .select('playbook_id, status, subject_id')
      .eq('space_id', spaceId)
      .eq('status', 'done')
      .gte('started_at', monthStartIso())
    if (error || !data) return emptyUsage(plan, true)

    let playbookActions = 0
    const reactivated = new Set<string>()
    const advocacy = new Set<string>()
    for (const r of data) {
      if (r.status !== 'done') continue
      playbookActions += 1
      const sid = typeof r.subject_id === 'string' ? r.subject_id : null
      if (sid && isReactivationPlaybook(r.playbook_id)) reactivated.add(sid)
      if (sid && isAdvocacyPlaybook(r.playbook_id)) advocacy.add(sid)
    }

    const ceiling = playbookActionCeiling(plan)
    return {
      playbookActions,
      membersReactivated: reactivated.size,
      advocacyAccepted: advocacy.size,
      ceiling,
      ratio: usageRatio(playbookActions, ceiling),
      atCeiling: isAtCeiling(playbookActions, ceiling),
      degraded: false,
    }
  } catch {
    return emptyUsage(plan, true)
  }
}
