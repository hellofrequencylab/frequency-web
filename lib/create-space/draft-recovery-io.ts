// THE DRAFT REMINDER RUNNER (LIVE-1968, ADR-1933). One invocation of /api/cron/create-space-draft-reminders: read the
// drafts that have been quiet for at least an hour, ask lib/create-space/draft-recovery.ts which reminder each is owed,
// and send it. The rule is that file's; the words are draft-recovery-email.ts; this one is the reads, the suppression
// check, the claim and the purge. It mirrors lib/launch/comeback-io.ts, the launch's own come-back runner.
//
// SERVICE ROLE, WHY: the cron has no session, and both tables are service-only by design. The reads are the draft row
// and the log; the writes are the log, the outbox and the purge. Nothing here returns a row to a browser.
//
// CHECK, THEN CLAIM, THEN SEND (ADR-1212). A draft has no account, so the member send gate (preferences, consent) has
// nothing to read; the one thing that can say no is the hard suppression list (a bounce, a complaint, a manual block),
// and it is asked first. A "no" is written to the log as a skipped kind, so the sequence ends and the address is not
// asked again on every run. The day-3 email is about the handle, so the handle is re-checked right before it and a
// taken one is claimed as skipped too. Then the log row is inserted: create_space_draft_email_log is unique per
// (draft, kind), so two overlapping runs cannot both send. The claim is never undone on an enqueue failure: a missed
// reminder costs less than a double.
//
// THE PURGE: every run also deletes the drafts past their purge_after (90 days from the save), log rows with them, so
// nothing here lives forever (ADR-1933). Converted drafts go the same way; the launch holds what it needs.

import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { isSuppressed } from '@/lib/suppression'
import { log } from '@/lib/log'
import { isSpaceSlugTaken } from '@/lib/spaces/store'
import { WIZARD_THEMES } from '@/lib/spaces/create-wizard'
import { parseDraft, progressOf } from './builder'
import { draftLinkToken } from './draft-io'
import { draftReminderDue, isDraftReminderKind, type DraftReminderSent } from './draft-recovery'
import { buildDraftReminderEmail } from './draft-recovery-email'

const HOUR_MS = 3_600_000
/** Drafts quiet for longer than this are past the last email's wait (3 days plus the 24 hour grace plus slack). */
const LOOKBACK_MS = 5 * 24 * HOUR_MS
/** Postgres unique_violation: the claim row already exists. */
const UNIQUE_VIOLATION = '23505'

interface DraftReminderRunResult {
  scanned: number
  sent: number
  /** Due, but suppressed or the handle is gone (logged, never retried). */
  skipped: number
  /** Another run claimed the kind first. */
  lost: number
  failed: number
  /** Drafts left unprocessed when the clock ran out. */
  remaining: number
  /** Drafts past purge_after deleted this run. */
  purged: number
  /** Why drafts that were not due were not due, for the heartbeat line. */
  held: Record<string, number>
}

interface DraftReminderRunOptions {
  limit: number
  exhausted?: () => boolean
  now?: () => Date
  baseUrl?: string
}

interface DraftRow {
  id: string
  email: string
  handle: string | null
  draft: unknown
  tz: string | null
  step_reached: number
  saved_at: string
  converted_at: string | null
  unsubscribed_at: string | null
}

const kitLabelOf = (id: string): string => WIZARD_THEMES.find((t) => t.id === id)?.label ?? id

export async function runDraftReminders(opts: DraftReminderRunOptions): Promise<DraftReminderRunResult> {
  const now = opts.now ?? (() => new Date())
  const exhausted = opts.exhausted ?? (() => false)
  const baseUrl = (opts.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com').replace(/\/+$/, '')
  const admin = createAdminClient()
  const t0 = now().getTime()
  const result: DraftReminderRunResult = { scanned: 0, sent: 0, skipped: 0, lost: 0, failed: 0, remaining: 0, purged: 0, held: {} }

  // The purge first: it is cheap, and a run that then runs out of clock has still kept the table honest.
  const { count: purged, error: purgeError } = await admin.from('create_space_drafts').delete({ count: 'exact' }).lt('purge_after', new Date(t0).toISOString())
  if (purgeError) log.error('cron.create_space_draft_reminders.purge_failed', { error: purgeError.message })
  else result.purged = purged ?? 0

  const { data, error } = await admin
    .from('create_space_drafts')
    .select('id, email, handle, draft, tz, step_reached, saved_at, converted_at, unsubscribed_at')
    .is('converted_at', null)
    .is('unsubscribed_at', null)
    .not('tz', 'is', null)
    .lte('saved_at', new Date(t0 - HOUR_MS).toISOString())
    .gte('saved_at', new Date(t0 - LOOKBACK_MS).toISOString())
    .order('saved_at', { ascending: true })
    .limit(opts.limit)
  if (error) throw new Error(`[create-space-draft-reminders] read failed: ${error.message}`)

  const rows = (data ?? []) as DraftRow[]
  result.scanned = rows.length
  if (rows.length === 0) return result

  const ids = rows.map((r) => r.id)
  const { data: logRows, error: logError } = await admin.from('create_space_draft_email_log').select('draft_id, trigger_kind, sent_at').in('draft_id', ids)
  if (logError) throw new Error(`[create-space-draft-reminders] log read failed: ${logError.message}`)
  const sentBy = new Map<string, DraftReminderSent[]>()
  for (const r of logRows ?? []) {
    if (!isDraftReminderKind(r.trigger_kind)) continue
    const list = sentBy.get(r.draft_id) ?? []
    list.push({ kind: r.trigger_kind, sentAt: r.sent_at })
    sentBy.set(r.draft_id, list)
  }
  const hold = (why: string) => {
    result.held[why] = (result.held[why] ?? 0) + 1
  }

  for (const [i, row] of rows.entries()) {
    if (exhausted()) {
      result.remaining = rows.length - i
      break
    }
    const sent = sentBy.get(row.id) ?? []
    const at = now()
    const facts = { savedAt: row.saved_at, convertedAt: row.converted_at, unsubscribedAt: row.unsubscribed_at }
    try {
      const decision = draftReminderDue(at, { ...facts, handleTaken: false }, sent, row.tz)
      if (decision.kind === null) {
        hold(decision.why)
        continue
      }
      let kind = decision.kind
      let skipReason: string | null = null
      if (kind === 'draft_3d') {
        // The handle read is spent only on a draft that is otherwise due its day-3 email.
        const taken = (await isSpaceSlugTaken(row.handle ?? '').catch(() => null)) === true
        const again = draftReminderDue(at, { ...facts, handleTaken: taken }, sent, row.tz)
        if (again.kind === null && again.why !== 'handle_taken') {
          hold(again.why)
          continue
        }
        if (again.kind === null) skipReason = 'skipped:handle_taken'
        else kind = again.kind
      }
      if (!skipReason && (await isSuppressed(row.email))) skipReason = 'skipped:suppressed'

      // The claim: a unique (draft, kind) row. A skipped kind is claimed too, so it is never asked again.
      const { error: claimError } = await admin.from('create_space_draft_email_log').insert({ draft_id: row.id, trigger_kind: kind, message_ref: skipReason })
      if (claimError) {
        if (claimError.code === UNIQUE_VIOLATION) result.lost++
        else {
          result.failed++
          log.error('cron.create_space_draft_reminders.claim_failed', { draft_id: row.id, kind, error: claimError.message })
        }
        continue
      }
      if (skipReason) {
        result.skipped++
        continue
      }

      const draft = parseDraft(JSON.stringify(row.draft), null)
      if (!draft) {
        result.skipped++
        continue
      }
      const link = draftLinkToken(row.id)
      const unsubscribeUrl = `${baseUrl}/unsubscribe?d=${link}`
      const payload = buildDraftReminderEmail({
        kind,
        to: row.email,
        firstName: draft.hostName.trim().split(/\s+/)[0] || null,
        name: draft.name.trim() || 'Your Space',
        handle: row.handle ?? '',
        pct: progressOf(draft, false),
        kitLabel: kitLabelOf(draft.kit),
        stoppedAtPhotos: row.step_reached === 3,
        resumeUrl: `${baseUrl}/create-a-space?kit=${encodeURIComponent(draft.kit)}&draft=${link}`,
        unsubscribeUrl,
      })
      await enqueueEmail({ ...payload, headers: listUnsubscribeHeaders(unsubscribeUrl) }, { dedupeKey: `create_space_draft:${row.id}:${kind}` })
      result.sent++
    } catch (e) {
      result.failed++
      log.error('cron.create_space_draft_reminders.failed', { draft_id: row.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return result
}
