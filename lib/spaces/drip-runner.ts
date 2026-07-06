// PER-SPACE DRIP RUNNER (the FIRE job, ADR-561). Drains DUE drip enrollments: for each enrollment whose
// next_run_at has passed, send the CURRENT step through the Space's system send seam (all anti-spam
// gates + consent), then advance current_step / next_run_at, or mark 'done' at the end. Called from
// /api/cron/space-drips on a Vercel Cron (every 5 min), guarded by CRON_SECRET. Server-only.
//
// IDEMPOTENCY IS THE WHOLE POINT (mirrors campaigns-send-due.ts). Two overlapping cron runs must never
// double-send the same step. The mechanism is a CLAIM: for each due enrollment we run a CONDITIONAL
// update that flips status 'enrolled' -> 'sending' AND re-asserts status='enrolled' in the WHERE clause,
// returning the claimed row. Postgres serializes the two concurrent updates, so exactly ONE run's update
// matches the (still-'enrolled') row and gets it back; the other's WHERE no longer matches and returns
// nothing. The winner alone proceeds to send. After the send it advances (back to 'enrolled' with the
// next step + due time) or completes ('done'); on a consent/unsubscribe stop it marks 'stopped'.
//
// The send goes through the SAME system seam the scheduled-campaign cron uses (sendSpaceCampaignSystem,
// lib/spaces/email.ts), which re-runs EVERY anti-spam gate (email function enabled, kill-switch, daily
// cap, per-recipient consent + suppression, the outreach_sends ledger) with NO caller session. So the
// drip runner adds NO new send path and inherits all gating for free.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendSpaceCampaignSystem, SPACE_UNSUBSCRIBE_PLACEHOLDER } from '@/lib/spaces/email'
import { normalizeDelayHours } from '@/lib/spaces/automation'
import { isError } from '@/lib/action-result'
import { log } from '@/lib/log'

/** What one drip-fire pass reports. */
export interface DripRunResult {
  /** Due enrollments the pass looked at (before claiming). */
  due: number
  /** Enrollments this pass successfully CLAIMED (enrolled -> sending) and processed. */
  claimed: number
  /** Steps delivered (a send accepted by the seam). */
  sent: number
  /** Enrollments completed this pass (reached the end of their sequence). */
  completed: number
  /** Enrollments stopped this pass (consent revoked / sequence gone / send failed terminally). */
  stopped: number
}

/** The subset of columns the fire path reads off a due enrollment. */
interface DueEnrollmentRow {
  id: string
  space_id: string | null
  sequence_id: string
  contact_id: string
  email: string
  current_step: number
}

/** One drip step, as read for a send. */
interface StepRow {
  step_order: number
  delay_hours: number
  subject: string
  body: string
  enabled: boolean
}

// Render a plain-text step body to the minimal HTML the campaign composer uses, with the per-Space
// unsubscribe placeholder the send seam swaps per recipient. Byte-compatible with campaigns-send-due.ts.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function renderStepHtml(body: string): string {
  const paras = body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 16px;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('')
  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px;">${paras}<hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/><p style="font-size:12px;color:#999;line-height:1.6;">You're receiving this because you are a contact of this space. <a href="${SPACE_UNSUBSCRIBE_PLACEHOLDER}" style="color:#999;">Unsubscribe</a>.</p></div>`
}

/** The enabled steps of a sequence, ascending by order. */
function orderedEnabled(steps: StepRow[]): StepRow[] {
  return steps.filter((s) => s.enabled !== false).sort((a, b) => a.step_order - b.step_order)
}

/**
 * Send every drip step whose enrollment is due. Idempotent: each enrollment is CLAIMED with a
 * conditional 'enrolled' -> 'sending' update before its step is sent, so two concurrent passes never
 * double-send. `limit` caps how many enrollments one pass claims. Fail-safe: a single enrollment's
 * error stops THAT enrollment ('stopped') and moves on; the pass never throws.
 */
export async function runDueSpaceDrips(limit = 200): Promise<DripRunResult> {
  const empty: DripRunResult = { due: 0, claimed: 0, sent: 0, completed: 0, stopped: 0 }
  const db = createAdminClient() as unknown as { from: (t: string) => Record<string, (...a: unknown[]) => unknown> }
  const nowIso = new Date().toISOString()

  // Find due enrollments (status enrolled, next_run_at reached). Read-only; the claim below is the gate.
  let dueRows: DueEnrollmentRow[] = []
  try {
    const q = db.from('space_drip_enrollments') as unknown as {
      select: (c: string) => {
        eq: (c: string, v: string) => {
          lte: (c: string, v: string) => {
            order: (c: string, o: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: DueEnrollmentRow[] | null; error: unknown }>
            }
          }
        }
      }
    }
    const { data, error } = await q
      .select('id, space_id, sequence_id, contact_id, email, current_step')
      .eq('status', 'enrolled')
      .lte('next_run_at', nowIso)
      .order('next_run_at', { ascending: true })
      .limit(limit)
    if (error) {
      log.error('cron.space_drips.fetch_failed', { error: String(error) })
      return empty
    }
    dueRows = data ?? []
  } catch (err) {
    log.error('cron.space_drips.fetch_threw', { error: String(err) })
    return empty
  }
  if (dueRows.length === 0) return empty

  let claimed = 0
  let sent = 0
  let completed = 0
  let stopped = 0

  for (const row of dueRows) {
    if (!row.space_id) {
      // An enrollment with no Space can never resolve a send. Stop it so it is not re-scanned.
      await markStatus(db, row.id, 'stopped')
      stopped++
      continue
    }

    // CLAIM: flip enrolled -> sending, re-asserting status='enrolled' so only one pass wins. A null
    // returned row means another pass already claimed it (or it changed status); skip it.
    let won = false
    try {
      won = await claimEnrollment(db, row.id)
    } catch (err) {
      log.error('cron.space_drips.claim_threw', { id: row.id, error: String(err) })
      continue
    }
    if (!won) continue // lost the race, or a transient claim miss.
    claimed++

    try {
      // Load the sequence's steps (SPACE-scoped) and pick the CURRENT step: the first enabled step
      // at-or-after the enrollment's cursor (skips a since-disabled/deleted step instead of stalling).
      const steps = await readSteps(db, row.space_id, row.sequence_id)
      const enabled = orderedEnabled(steps)
      const step = enabled.find((s) => s.step_order >= row.current_step) ?? null
      if (!step) {
        // No step left at-or-after the cursor: the sequence is done for this contact.
        await markStatus(db, row.id, 'done')
        completed++
        continue
      }

      // Send the step through the system seam (all anti-spam gates + consent). One recipient: this
      // contact. The seam skips a suppressed/unconsented recipient (logged), so a non-consenting
      // contact simply doesn't receive this step; we still advance so the sequence progresses (the
      // NEXT step re-checks consent). A hard seam error stops the enrollment.
      const res = await sendSpaceCampaignSystem(row.space_id, {
        subject: step.subject,
        html: renderStepHtml(step.body),
        recipients: [{ contactId: row.contact_id, email: row.email }],
      })
      if (isError(res)) {
        // The seam refused entirely (kill-switch off, plan lost email, cap hit). STOP this enrollment
        // so it is not retried forever; the operator re-enables + re-enrolls. Logged for visibility.
        await markStatus(db, row.id, 'stopped')
        stopped++
        log.error('cron.space_drips.send_refused', { id: row.id, error: res.error })
        continue
      }
      if (res.data.sent > 0) sent++

      // Advance to the next enabled step after the one we just sent, or complete.
      const next = enabled.find((s) => s.step_order > step.step_order) ?? null
      if (next) {
        const nextRunAt = new Date(Date.now() + normalizeDelayHours(next.delay_hours) * 3_600_000).toISOString()
        await advance(db, row.id, next.step_order, nextRunAt)
      } else {
        await markStatus(db, row.id, 'done')
        completed++
      }
    } catch (err) {
      // A per-enrollment error: stop it (it is claimed in 'sending', so leaving it would strand it) and
      // move on. The pass never throws.
      await markStatus(db, row.id, 'stopped')
      stopped++
      log.error('cron.space_drips.enrollment_threw', { id: row.id, error: String(err) })
    }
  }

  return { due: dueRows.length, claimed, sent, completed, stopped }
}

// ── IO helpers (untyped admin-client seam; space_drip_enrollments not in generated types yet) ──────

/** CLAIM one enrollment: conditional 'enrolled' -> 'sending', re-asserting status='enrolled'. Returns
 *  true iff THIS pass won the claim (exactly one concurrent pass can). */
async function claimEnrollment(
  db: { from: (t: string) => Record<string, (...a: unknown[]) => unknown> },
  id: string,
): Promise<boolean> {
  const q = db.from('space_drip_enrollments') as unknown as {
    update: (p: Record<string, unknown>) => {
      eq: (c: string, v: string) => {
        eq: (c: string, v: string) => {
          select: (c: string) => { maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }> }
        }
      }
    }
  }
  const { data, error } = await q
    .update({ status: 'sending' })
    .eq('id', id)
    .eq('status', 'enrolled')
    .select('id')
    .maybeSingle()
  return !error && !!data
}

/** Read a sequence's steps, SPACE-scoped, ascending. FAIL-SAFE to []. */
async function readSteps(
  db: { from: (t: string) => Record<string, (...a: unknown[]) => unknown> },
  spaceId: string,
  sequenceId: string,
): Promise<StepRow[]> {
  const q = db.from('space_drip_steps') as unknown as {
    select: (c: string) => {
      eq: (c: string, v: string) => {
        eq: (c: string, v: string) => {
          order: (c: string, o: { ascending: boolean }) => Promise<{ data: StepRow[] | null; error: unknown }>
        }
      }
    }
  }
  const { data } = await q
    .select('step_order, delay_hours, subject, body, enabled')
    .eq('space_id', spaceId)
    .eq('sequence_id', sequenceId)
    .order('step_order', { ascending: true })
  return data ?? []
}

/** Advance a claimed enrollment to the next step: set current_step + next_run_at, back to 'enrolled'
 *  (releasing the 'sending' claim) and stamp last_sent_at. */
async function advance(
  db: { from: (t: string) => Record<string, (...a: unknown[]) => unknown> },
  id: string,
  nextStep: number,
  nextRunAt: string,
): Promise<void> {
  const q = db.from('space_drip_enrollments') as unknown as {
    update: (p: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> }
  }
  await q
    .update({
      status: 'enrolled',
      current_step: nextStep,
      next_run_at: nextRunAt,
      last_sent_at: new Date().toISOString(),
    })
    .eq('id', id)
}

/** Mark a claimed enrollment to a terminal status ('done' or 'stopped'). Best-effort. */
async function markStatus(
  db: { from: (t: string) => Record<string, (...a: unknown[]) => unknown> },
  id: string,
  status: 'done' | 'stopped',
): Promise<void> {
  try {
    const q = db.from('space_drip_enrollments') as unknown as {
      update: (p: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> }
    }
    const patch: Record<string, unknown> =
      status === 'done' ? { status, last_sent_at: new Date().toISOString() } : { status }
    await q.update(patch).eq('id', id)
  } catch {
    // best-effort: a status write failure is non-critical (the row stays 'sending' and is not re-scanned
    // by the due query, which only reads 'enrolled').
  }
}
