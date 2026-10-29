// THE COME-BACK RUNNER (VLS-26, VLS-27). One invocation of /api/cron/launch-reminders: read the launches that have been
// quiet for at least an hour, ask lib/launch/comeback.ts which email each is owed, and send it. The rule is that
// file's; this one is the reads, the send gate and the claim.
//
// SERVICE ROLE, WHY: the cron has no session, and launch_email_log is service-only by design (its migration revokes the
// browser roles). The reads are the launch row, the owner's profile and Space zone, and the log; the writes are the log
// and the outbox. Nothing here returns a row to a browser.
//
// SEND GATE, THEN CLAIM, THEN SEND (ADR-1212). The lifecycle send gate (preference, consent and suppression in one
// decision) is asked first. A "no" is written to the log as a skipped kind, so an opt-out ends the sequence: the person is
// not asked again on every run, and a resume after it ends the rest like any other. A transient read error is not a "no"
// and is retried next run. Then the log row is inserted: launch_email_log is unique per (launch, kind), so two overlapping
// runs cannot both send. The claim is never undone on an enqueue failure: a missed reminder costs less than a double.
//
// space_launch's clock columns (clock_active_ms, clock_last_beat_at) come from the clock lane. They are read off a
// select('*') row and typed loosely, so this runs before they exist (activity then falls back to updated_at and the email
// leaves the time out) and picks them up the moment they do.

import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { log } from '@/lib/log'
import { isValidTimeZone } from '@/lib/time/zone'
import { comebackDue, isComebackKind, type ComebackSent } from './comeback'
import { buildComebackEmail, comebackClock } from './comeback-email'
import { resumeView } from './resume'
import { launchStep } from './steps'
import { toSnapshot } from './state'

const HOUR_MS = 3_600_000
/** Launches quiet for longer than this are past the last email's wait (3 days plus the 24 hour grace plus slack). */
const LOOKBACK_MS = 5 * 24 * HOUR_MS
/** Postgres unique_violation: the claim row already exists. */
const UNIQUE_VIOLATION = '23505'

interface ComebackRunResult {
  scanned: number
  sent: number
  /** Due, but the person's preferences, consent or suppression said no (logged, never retried). */
  skipped: number
  /** Another run claimed the kind first. */
  lost: number
  failed: number
  /** Launches left unprocessed when the clock ran out. */
  remaining: number
  /** Why launches that were not due were not due, for the heartbeat line. */
  held: Record<string, number>
}

interface ComebackRunOptions {
  limit: number
  exhausted?: () => boolean
  now?: () => Date
  baseUrl?: string
}

type Row = Record<string, unknown>

const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)

export async function runLaunchComebacks(opts: ComebackRunOptions): Promise<ComebackRunResult> {
  const now = opts.now ?? (() => new Date())
  const exhausted = opts.exhausted ?? (() => false)
  const baseUrl = opts.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
  const admin = createAdminClient()
  const t0 = now().getTime()

  const { data, error } = await admin
    .from('space_launch')
    .select('*')
    .is('cancelled_at', null)
    .is('completed_at', null)
    .lte('updated_at', new Date(t0 - HOUR_MS).toISOString())
    .gte('updated_at', new Date(t0 - LOOKBACK_MS).toISOString())
    .order('updated_at', { ascending: true })
    .limit(opts.limit)
  if (error) throw new Error(`[launch-reminders] read failed: ${error.message}`)

  const rows = (data ?? []) as Row[]
  const result: ComebackRunResult = { scanned: rows.length, sent: 0, skipped: 0, lost: 0, failed: 0, remaining: 0, held: {} }
  if (rows.length === 0) return result

  const ids = rows.map((r) => r.id as string)
  const { data: logRows, error: logError } = await admin.from('launch_email_log').select('launch_id, trigger_kind, sent_at').in('launch_id', ids)
  if (logError) throw new Error(`[launch-reminders] log read failed: ${logError.message}`)
  const sentBy = new Map<string, ComebackSent[]>()
  for (const r of logRows ?? []) {
    if (!isComebackKind(r.trigger_kind)) continue
    const list = sentBy.get(r.launch_id) ?? []
    list.push({ kind: r.trigger_kind, sentAt: r.sent_at })
    sentBy.set(r.launch_id, list)
  }
  const hold = (why: string) => {
    result.held[why] = (result.held[why] ?? 0) + 1
  }

  for (const [i, row] of rows.entries()) {
    if (exhausted()) {
      result.remaining = rows.length - i
      break
    }
    const snap = toSnapshot(row)
    if (!snap) continue
    const launch = { ...snap, clockLastBeatAt: strOrNull(row.clock_last_beat_at) }
    const sent = sentBy.get(snap.id) ?? []
    const at = now()
    try {
      // Everything but the zone first: the profile and Space reads are spent only on a launch that is otherwise due.
      const early = comebackDue(at, launch, sent, 'UTC')
      if (early.kind === null && early.why !== 'outside_hours') {
        hold(early.why)
        continue
      }
      const owner = await readOwner(admin, snap.ownerId, snap.spaceId)
      const decision = comebackDue(at, launch, sent, owner.timeZone)
      if (decision.kind === null) {
        hold(decision.why)
        continue
      }
      const kind = decision.kind

      const gate = owner.email ? await resolveSendGate(snap.ownerId, 'email', 'lifecycle', { email: owner.email }) : null
      if (gate && !gate.allowed && gate.reason === 'error') {
        hold('gate_error')
        continue
      }
      const skipReason = !owner.email ? 'skipped:no_email' : gate && !gate.allowed ? `skipped:${gate.reason}` : null

      // The claim: a unique (launch, kind) row. A skipped kind is claimed too, so it is never asked again.
      const { error: claimError } = await admin.from('launch_email_log').insert({ launch_id: snap.id, trigger_kind: kind, message_ref: skipReason })
      if (claimError) {
        if (claimError.code === UNIQUE_VIOLATION) result.lost++
        else {
          result.failed++
          log.error('cron.launch_reminders.claim_failed', { launch_id: snap.id, kind, error: claimError.message })
        }
        continue
      }
      if (skipReason || !owner.email) {
        result.skipped++
        continue
      }

      const view = resumeView(snap, at)
      const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl, profileId: snap.ownerId, category: 'lifecycle' })
      const payload = buildComebackEmail({
        kind,
        to: owner.email,
        firstName: owner.firstName,
        clock: comebackClock(row.clock_active_ms),
        made: view.kind === 'step' ? view.made : [],
        nextLabel: view.kind === 'step' ? launchStep(view.step).label : null,
        baseUrl,
        unsubscribeUrl,
      })
      await enqueueEmail({ ...payload, headers: listUnsubscribeHeaders(unsubscribeUrl) }, { dedupeKey: `launch_comeback:${snap.id}:${kind}` })
      result.sent++
    } catch (e) {
      result.failed++
      log.error('cron.launch_reminders.failed', { launch_id: snap.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return result
}

/** The owner's address, first name and time zone. The zone is the person's own, then their Space's, else null: the rule
 *  then holds the email rather than guess an hour. */
async function readOwner(admin: ReturnType<typeof createAdminClient>, ownerId: string, spaceId: string | null) {
  const { data: p } = await admin.from('profiles').select('display_name, auth_user_id, home_timezone').eq('id', ownerId).maybeSingle()
  let email: string | null = null
  if (p?.auth_user_id) {
    const { data: u } = await admin.auth.admin.getUserById(p.auth_user_id)
    email = u?.user?.email ?? null
  }
  let timeZone: string | null = isValidTimeZone(p?.home_timezone) ? p.home_timezone : null
  if (!timeZone && spaceId) {
    const { data: s } = await admin.from('spaces').select('time_zone').eq('id', spaceId).maybeSingle()
    const z = (s as { time_zone?: string | null } | null)?.time_zone
    if (isValidTimeZone(z)) timeZone = z
  }
  const first = (p?.display_name ?? '').trim().split(/\s+/)[0]
  return { email, firstName: first || null, timeZone }
}
