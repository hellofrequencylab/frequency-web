// Signup lead recovery: the one transactional note `signup_leads` was built for (LIVE-170, ADR-1274).
//
// A visitor who gives an email at /join and then stops partway leaves a `signup_leads` row
// (ADR-959). The operator can read those rows (lib/crm/signup-leads.ts, SCAN-634); until this
// module nothing followed one up. /api/cron/signup-lead-recovery runs `runSignupLeadRecovery`
// once a day, and it mails each cold lead ONE "finish setting up your account" note.
//
// WHO IS OWED THE NOTE. `selectRecoveryLeads` is the whole rule, pure and dependency-free so a
// test needs no database:
//   - converted_at is null      (they never finished; a member gets nothing from here)
//   - recovery_sent_at is null  (never mailed; the stamp is the claim and there is no second note)
//   - step_reached >= 2         (they gave an email AND went on: a bare address that never took a
//                                second step is not a half-finished signup, it is a typed address)
//   - updated_at is at least RECOVERY_QUIET_HOURS old (still mid-funnel an hour ago is not cold)
// The driving query asks the database the same four things, ordered oldest-first and limited to
// the cron's budget, and the runner applies the pure rule again to what comes back. The second
// pass costs nothing and is the one a test can prove.
//
// CLAIM, THEN SEND (ADR-1212). `recovery_sent_at` is stamped with a conditional update that
// only matches a row still at NULL, and the note is enqueued only when that update returned the
// row. Two overlapping runs, or a retry after a crash, cannot mail the same lead twice; the run
// that loses the claim skips. A claim is never undone on an enqueue failure: for a one-shot
// courtesy note a missed send is cheaper than a double.
//
// TRANSACTIONAL ONLY. The table carries no consent state by design (ADR-959), and this note does
// not need any: it is the same category as a password reset. That is also why there is exactly
// one, why it carries no marketing, and why it goes out on the transactional outbox lane. The
// global suppression list still applies at drain time (sendRawEmail checks it).

import { createAdminClient } from '@/lib/supabase/admin'
import { sendSignupRecoveryEmail } from '@/lib/email'
import { log } from '@/lib/log'
import type { Json } from '@/lib/database.types'

/** A lead is cold once its last touch is at least this old. */
export const RECOVERY_QUIET_HOURS = 24
/** The lowest `step_reached` that counts as a half-finished signup rather than a typed address. */
export const RECOVERY_MIN_STEP = 2

const HOUR_MS = 60 * 60 * 1000

/** The columns the rule reads. The runner selects a superset; a test passes exactly this. */
export interface RecoveryCandidate {
  id: string
  email: string
  step_reached: number
  updated_at: string
  converted_at: string | null
  recovery_sent_at: string | null
}

/** The row the runner reads: the rule's columns plus what the note needs. */
export interface RecoveryLeadRow extends RecoveryCandidate {
  first_name: string | null
  display_name: string | null
  payload: Json
}

export const RECOVERY_SELECT =
  'id, email, first_name, display_name, step_reached, updated_at, converted_at, recovery_sent_at, payload'

/** The newest `updated_at` a lead may have and still be cold, as an ISO string for the query. */
export function recoveryCutoff(now: number = Date.now()): string {
  return new Date(now - RECOVERY_QUIET_HOURS * HOUR_MS).toISOString()
}

/** Pure: true when this one lead is owed the note right now. */
export function isRecoveryDue(lead: RecoveryCandidate, now: number = Date.now()): boolean {
  if (lead.converted_at !== null) return false
  if (lead.recovery_sent_at !== null) return false
  if (!(lead.step_reached >= RECOVERY_MIN_STEP)) return false
  const touched = Date.parse(lead.updated_at)
  if (!Number.isFinite(touched)) return false
  return now - touched >= RECOVERY_QUIET_HOURS * HOUR_MS
}

/** Pure: the leads owed the note, in the order given (the query orders oldest touch first). */
export function selectRecoveryLeads<T extends RecoveryCandidate>(rows: readonly T[], now: number = Date.now()): T[] {
  return rows.filter((row) => isRecoveryDue(row, now))
}

/** The best short name the funnel learned, or null: the greeting is "Hi, " without one. */
export function recoveryFirstName(lead: Pick<RecoveryLeadRow, 'first_name' | 'display_name'>): string | null {
  const first = (lead.first_name ?? '').trim()
  if (first) return first
  const display = (lead.display_name ?? '').trim()
  return display ? display.split(/\s+/)[0] : null
}

/** Where the note sends them: /join, carrying the Funnel they were on when the payload names one
 *  (NAMING.md: `?seq=<slug>` carries the audience). A slug is only ever the shape the induction
 *  stores, so anything else falls back to the bare door. */
export function recoveryResumeUrl(baseUrl: string, payload: Json): string {
  const root = baseUrl.replace(/\/+$/, '')
  const seq =
    payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.sequence === 'string'
      ? payload.sequence
      : ''
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(seq) ? `${root}/join?seq=${seq}` : `${root}/join`
}

export interface RecoveryRunResult {
  /** Rows the driving query returned. */
  scanned: number
  /** Rows the pure rule kept (the query and the rule agree unless the clock moved between them). */
  due: number
  /** Leads this run claimed and enqueued a note for. */
  sent: number
  /** Leads another run claimed first. */
  lost: number
  /** Claims or enqueues that errored; the heartbeat must see these. */
  failed: number
  /** Due leads left unprocessed when the clock ran out. */
  remaining: number
}

export interface RecoveryRunOptions {
  /** The most leads one invocation takes: the cron budget's `items`. */
  limit: number
  /** True once the invocation's wall-clock is spent: the cron budget's `exhausted`. */
  exhausted?: () => boolean
  now?: () => number
  baseUrl?: string
}

/**
 * One invocation of the recovery cron: read the cold leads, claim each, enqueue its note.
 * Throws only when the driving query fails; a per-lead failure is counted and returned.
 */
export async function runSignupLeadRecovery(opts: RecoveryRunOptions): Promise<RecoveryRunResult> {
  const now = opts.now ?? Date.now
  const exhausted = opts.exhausted ?? (() => false)
  const baseUrl = opts.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('signup_leads')
    .select(RECOVERY_SELECT)
    .is('converted_at', null)
    .is('recovery_sent_at', null)
    .gte('step_reached', RECOVERY_MIN_STEP)
    .lte('updated_at', recoveryCutoff(now()))
    .order('updated_at', { ascending: true })
    .limit(opts.limit)
  if (error) throw new Error(`[signup-lead-recovery] read failed: ${error.message}`)

  const rows = (data ?? []) as RecoveryLeadRow[]
  const due = selectRecoveryLeads(rows, now())
  const result: RecoveryRunResult = { scanned: rows.length, due: due.length, sent: 0, lost: 0, failed: 0, remaining: 0 }

  for (const [i, lead] of due.entries()) {
    if (exhausted()) {
      result.remaining = due.length - i
      break
    }

    // The claim: only a row still at NULL matches, so exactly one run sees it come back.
    const { data: claimed, error: claimError } = await admin
      .from('signup_leads')
      .update({ recovery_sent_at: new Date(now()).toISOString() })
      .eq('id', lead.id)
      .is('recovery_sent_at', null)
      .select('id')
    if (claimError) {
      result.failed++
      log.error('cron.signup_lead_recovery.claim_failed', { lead_id: lead.id, error: claimError.message })
      continue
    }
    if (!Array.isArray(claimed) || claimed.length === 0) {
      result.lost++
      continue
    }

    try {
      await sendSignupRecoveryEmail({
        to: lead.email,
        firstName: recoveryFirstName(lead),
        resumeUrl: recoveryResumeUrl(baseUrl, lead.payload),
      })
      result.sent++
    } catch (e) {
      // The claim stands (header): a one-shot note is not re-sent, and the failure is loud.
      result.failed++
      log.error('cron.signup_lead_recovery.enqueue_failed', {
        lead_id: lead.id,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return result
}
