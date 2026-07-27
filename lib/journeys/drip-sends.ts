// JOURNEY DRIP SENDS (ADR-840). Delivers each enrollee's phase-unlock notice when the phase
// drip schedule (lib/journeys/schedule.ts, ADR-252) opens a new phase: an in-app notification
// plus an opt-in push, through the SAME seams the daily journey-prompt cron uses (the
// notifications table + sendPushToProfile). Called from /api/cron/journey-drips, guarded by
// CRON_SECRET. Server-only.
//
// IDEMPOTENCY mirrors the space-drips runner (lib/spaces/drip-runner.ts, ADR-561), with the
// CLAIM moved into the LEDGER: journey_drip_sends holds one row per enrollment × phase with a
// UNIQUE (enrollment_id, phase_index). A pass claims a delivery by INSERTING the row (status
// 'sending' + claimed_at) with ignore-duplicates; Postgres serializes concurrent passes, so
// exactly one pass gets its row back and proceeds to send, then stamps status 'sent' + sent_at.
// The loser's insert returns nothing and it moves on. No enrollment status flip is needed
// because due-ness is DERIVED (started_at + drip_interval_days), not stored.
//
// CATCH-UP RULE: a member who enrolls late (or a runner that was down) may owe several phases at
// once. We notify only the NEWEST due phase and record the earlier ones as 'skipped' ledger rows,
// so nobody gets a stack of stale unlock notices and nothing is re-scanned forever.
//
// DORMANT UNTIL THE MIGRATION APPLIES: the journey_drip_sends table ships as a DRAFT migration
// (supabase/migrations/20261229000000_journey_drip_sends.sql, not yet applied). Every ledger read
// and claim here fails safe, so until the table exists the runner delivers NOTHING and reports
// zeros — by design, never an error page or a double-send.

import { createAdminClient } from '@/lib/supabase/admin'
import { unlockedPhaseCount } from '@/lib/journeys/schedule'
import { sendPushToProfile } from '@/lib/push'
import { log } from '@/lib/log'

// ── PURE: due-step selection (unit-tested, no IO) ────────────────────────────────────────────────

/** What the due-phase selector needs to know about one enrollment. */
export interface DueSelectionInput {
  /** The drip anchor: the Run's started_at (cohort) or the enrollment's started_at (solo). */
  startedAt: string
  /** Days between phase unlocks; <= 0 means no drip (everything open, nothing to announce). */
  dripIntervalDays: number
  /** Phases in the Journey (>= 1; a flat Journey counts as one implicit phase). */
  totalPhases: number
  /** Phase indexes already in the ledger for this enrollment (any status). */
  deliveredPhases: readonly number[]
  now?: Date
}

/**
 * The 0-based phase indexes that have UNLOCKED by `now` but have no ledger row yet, ascending.
 * Phase 0 is never included (it opens at enrollment; the enrollment itself is the notice).
 * PURE. Interval <= 0 (no drip) or a single-phase Journey yields []. An unparseable anchor
 * yields [] (fail-safe: no anchor, no sends).
 */
export function selectDueDripPhases(input: DueSelectionInput): number[] {
  const { dripIntervalDays, totalPhases, deliveredPhases } = input
  if (dripIntervalDays <= 0 || totalPhases <= 1) return []
  const anchorMs = Date.parse(input.startedAt)
  if (!Number.isFinite(anchorMs)) return []
  const unlocked = unlockedPhaseCount(
    new Date(anchorMs),
    dripIntervalDays,
    totalPhases,
    input.now ?? new Date(),
  )
  const seen = new Set(deliveredPhases)
  const due: number[] = []
  for (let i = 1; i < unlocked; i++) if (!seen.has(i)) due.push(i)
  return due
}

// ── Types the fire path reads ────────────────────────────────────────────────────────────────────

/** What one drip-fire pass reports (mirrors DripRunResult in lib/spaces/drip-runner.ts). */
export interface JourneyDripRunResult {
  /** Active enrollments the pass scanned. */
  scanned: number
  /** Enrollments with at least one due, unrecorded phase. */
  due: number
  /** Deliveries this pass CLAIMED (won the ledger insert) and processed. */
  claimed: number
  /** Phase-unlock notices delivered (notification written). */
  sent: number
  /** Older phases recorded as 'skipped' by the catch-up rule. */
  skipped: number
}

interface EnrollmentRow {
  id: string
  profile_id: string
  plan_id: string
  run_id: string | null
  started_at: string
}

interface PlanRow {
  id: string
  slug: string
  title: string
  drip_interval_days: number
}

interface PhaseRow {
  plan_id: string
  title: string | null
  sort_order: number
}

// ── The ledger handle: journey_drip_sends (ADR-840) ─────────────────────────────────────────────
// Typed. The table's migration (20261229000000) applied 2026-07-27 and the generated types carry
// it, so the pre-regen untyped seam this file shipped with is retired. One accessor still, so
// every caller reaches the ledger the same way.

function dripSendsTable() {
  return createAdminClient().from('journey_drip_sends')
}

// ── The fire pass ───────────────────────────────────────────────────────────────────────────────

/**
 * Deliver every due phase-unlock notice. Idempotent via the ledger claim (see the module
 * header). `limit` caps how many enrollments one pass scans. FAIL-SAFE: a single enrollment's
 * error is logged and skipped; a missing ledger table (migration not applied yet) short-circuits
 * the whole pass to zeros. The pass never throws.
 */
export async function runDueJourneyDripSends(limit = 200): Promise<JourneyDripRunResult> {
  const empty: JourneyDripRunResult = { scanned: 0, due: 0, claimed: 0, sent: 0, skipped: 0 }
  const admin = createAdminClient()

  // 1. Active enrollments (not yet completed), oldest first so long-running cohorts stay served.
  const { data: enrollData, error: enrollErr } = await admin
    .from('journey_enrollments')
    .select('id, profile_id, plan_id, run_id, started_at')
    .is('completed_at', null)
    .order('started_at', { ascending: true })
    .limit(limit)
  if (enrollErr || !enrollData || enrollData.length === 0) return empty
  const enrollments: EnrollmentRow[] = enrollData

  // 2. The plans behind them: drip interval + identity for the notice copy/link.
  const planIds = [...new Set(enrollments.map((e) => e.plan_id))]
  const { data: planData } = await admin
    .from('journey_plans')
    .select('id, slug, title, drip_interval_days')
    .in('id', planIds)
  const plans = new Map<string, PlanRow>()
  for (const p of (planData ?? []) as PlanRow[]) plans.set(p.id, p)

  // 3. Phase blocks per plan (ordered). A plan with no explicit phase blocks is one implicit
  //    phase (the tree's legacy/flat rule) — nothing to drip.
  const { data: phaseData } = await admin
    .from('journey_plan_items')
    .select('plan_id, title, sort_order')
    .in('plan_id', planIds)
    .eq('block_type', 'phase')
    .order('sort_order', { ascending: true })
  const phasesByPlan = new Map<string, PhaseRow[]>()
  for (const row of (phaseData ?? []) as PhaseRow[]) {
    const arr = phasesByPlan.get(row.plan_id) ?? []
    arr.push(row)
    phasesByPlan.set(row.plan_id, arr)
  }

  // 4. Cohort anchors: a Run enrollment drips from the Run's start, not the personal one.
  const runIds = [...new Set(enrollments.map((e) => e.run_id).filter((id): id is string => !!id))]
  const runStarts = new Map<string, string>()
  if (runIds.length > 0) {
    const { data: runData } = await admin.from('journey_runs').select('id, started_at').in('id', runIds)
    for (const r of (runData ?? []) as { id: string; started_at: string | null }[]) {
      if (r.started_at) runStarts.set(r.id, r.started_at)
    }
  }

  // 5. Ledger state for the scanned enrollments. FAIL-SAFE: any error (including the table not
  //    existing before the draft migration is applied) makes the pass DORMANT — with no ledger
  //    there is no claim, and without a claim nothing may send.
  let ledger: { enrollment_id: string; phase_index: number }[] = []
  try {
    const { data, error } = await dripSendsTable()
      .select('enrollment_id, phase_index')
      .in('enrollment_id', enrollments.map((e) => e.id))
    if (error) {
      log.info('cron.journey_drips.ledger_unavailable', { note: 'migration not applied yet; pass dormant' })
      return { ...empty, scanned: enrollments.length }
    }
    ledger = data ?? []
  } catch {
    return { ...empty, scanned: enrollments.length }
  }
  const recordedByEnrollment = new Map<string, number[]>()
  for (const row of ledger) {
    const arr = recordedByEnrollment.get(row.enrollment_id) ?? []
    arr.push(row.phase_index)
    recordedByEnrollment.set(row.enrollment_id, arr)
  }

  const now = new Date()
  let due = 0
  let claimed = 0
  let sent = 0
  let skipped = 0

  for (const enrollment of enrollments) {
    try {
      const plan = plans.get(enrollment.plan_id)
      if (!plan) continue
      const phases = phasesByPlan.get(enrollment.plan_id) ?? []
      if (phases.length <= 1) continue

      const anchor = (enrollment.run_id && runStarts.get(enrollment.run_id)) || enrollment.started_at
      const duePhases = selectDueDripPhases({
        startedAt: anchor,
        dripIntervalDays: plan.drip_interval_days,
        totalPhases: phases.length,
        deliveredPhases: recordedByEnrollment.get(enrollment.id) ?? [],
        now,
      })
      if (duePhases.length === 0) continue
      due++

      // CLAIM: insert the ledger rows with ignore-duplicates. The NEWEST due phase is the one
      // we deliver ('sending'); older ones are recorded 'skipped' (the catch-up rule). Exactly
      // one concurrent pass gets the newest row back and proceeds.
      const newest = duePhases[duePhases.length - 1]
      const nowIso = new Date().toISOString()
      const rows = duePhases.map((phaseIndex) => ({
        enrollment_id: enrollment.id,
        plan_id: enrollment.plan_id,
        profile_id: enrollment.profile_id,
        phase_index: phaseIndex,
        status: phaseIndex === newest ? 'sending' : 'skipped',
        claimed_at: nowIso,
      }))
      const { data: won, error: claimErr } = await dripSendsTable()
        .upsert(rows, { onConflict: 'enrollment_id,phase_index', ignoreDuplicates: true })
        .select('id, phase_index')
      if (claimErr || !won) continue
      const winner = won.find((r) => r.phase_index === newest)
      skipped += won.filter((r) => r.phase_index !== newest).length
      if (!winner) continue // another pass claimed the newest phase; nothing to send.
      claimed++

      // DELIVER through the existing notification seam (the journey-prompt cron's shape): an
      // in-app notification (defaults on) plus a push for members who opted in (lifecycle
      // category; sendPushToProfile re-checks preference + consent).
      const phaseTitle = phases[newest]?.title?.trim() || `Phase ${newest + 1}`
      const body = `${phaseTitle} is now open in ${plan.title}. Pick up where you left off.`
      const { error: notifyErr } = await admin.from('notifications').insert({
        recipient_id: enrollment.profile_id,
        actor_id: null,
        reference_type: 'journey',
        reference_id: enrollment.plan_id,
        type: 'journey_phase_unlocked',
        body,
      })
      if (notifyErr) {
        // STAMP the claim failed so the row is visible in the ledger; the unique constraint
        // still prevents a retry storm (an operator can clear 'failed' rows to retry).
        await dripSendsTable().update({ status: 'failed' }).eq('id', winner.id)
        log.error('cron.journey_drips.notify_failed', { enrollment: enrollment.id, error: notifyErr.message })
        continue
      }
      sent++

      await sendPushToProfile(
        enrollment.profile_id,
        {
          title: `New phase open in ${plan.title}`,
          body: phaseTitle,
          url: `/journeys/${plan.slug}/learn`,
          tag: `journey-drip-${enrollment.id}-${newest}`,
        },
        'lifecycle',
      ).catch(() => 0)

      // STAMP: the delivery is done; release the 'sending' claim to its terminal state.
      await dripSendsTable().update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', winner.id)
    } catch (err) {
      log.error('cron.journey_drips.enrollment_threw', { enrollment: enrollment.id, error: String(err) })
    }
  }

  return { scanned: enrollments.length, due, claimed, sent, skipped }
}
