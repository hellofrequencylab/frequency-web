// SCHEDULED SEND JOB (R4, business-accounts Automation). Fires per-Space campaigns whose send time has
// arrived: status 'scheduled' AND scheduled_for <= now(). Called from /api/cron/space-campaigns on a
// Vercel Cron (every 5 min), guarded by CRON_SECRET. Server-only; never throws out (fail-safe per row).
//
// EXACTLY-ONCE (idempotency) IS THE WHOLE POINT. Two overlapping cron runs must never double-send the
// same campaign. The mechanism is a CLAIM: for each due campaign we run a CONDITIONAL update that flips
// status 'scheduled' -> 'sending' AND re-asserts status='scheduled' in the WHERE clause, returning the
// claimed row. Postgres serializes the two concurrent updates, so exactly ONE run's update matches the
// (still-'scheduled') row and gets it back; the other's WHERE no longer matches and returns nothing. The
// winner alone proceeds to send. A campaign left in 'sending' (process crashed mid-send) is NOT retried
// automatically (avoids a double-send on partial delivery); it needs an operator to re-schedule. After a
// successful delivery the row is stamped 'sent' + sent_at; on a resolve/send error it is stamped 'failed'
// so it is not re-claimed and the operator can see it did not go out.
// 2026-09-05 (scan2 L6-10): the "NOT retried" sentence above is retired. The claim now stamps
// sending_started_at (a LEASE, SENDING_LEASE_MINUTES in lib/messaging/status.ts), and a 'sending' row whose
// lease has expired is a dead sender: the pass re-claims it (re-asserting status='sending' AND the stale
// stamp, so two passes still cannot both win) and RESUMES the fan-out, sending only to recipients with no
// outreach_sends row for this campaign yet. A failed send records why in campaigns.send_error.
//
// The send itself goes through the SYSTEM send seam (sendSpaceCampaignSystem, lib/spaces/email.ts), which
// re-runs every anti-spam gate (email function enabled, kill-switch on, daily cap, per-recipient consent
// + suppression, per-Space unsubscribe, the outreach_sends ledger) with NO caller session. The audience
// is resolved from the campaign's stored audience_filter (persisted by scheduleSpaceCampaign) over the
// Space's OWN contacts (resolveAudience), so tenancy holds end to end.

import { createAdminClient } from '@/lib/supabase/admin'
import type { TablesUpdate } from '@/lib/database.types'
import { resolveAudience, definitionToFilter } from '@/lib/spaces/audiences'
import { sendSpaceCampaignSystem, SPACE_UNSUBSCRIBE_PLACEHOLDER } from '@/lib/spaces/email'
import { normalizeEmailTopic } from '@/lib/spaces/email-topics'
import { sendCampaignNow } from '@/lib/email-studio/send'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { isError } from '@/lib/action-result'
import { log, briefError } from '@/lib/log'
import { SENDING_LEASE_MS } from '@/lib/messaging/status'

/** What one scheduled-send pass reports. */
export interface SendDueResult {
  /** Due campaigns the pass looked at (before claiming). */
  due: number
  /** Campaigns this pass successfully CLAIMED (scheduled -> sending) and processed. */
  claimed: number
  /** Campaigns delivered (status stamped 'sent'). */
  sent: number
  /** Campaigns that failed to resolve an audience or send (status stamped 'failed'). */
  failed: number
}

/** The subset of columns the send-due path reads off a due campaign. */
interface DueCampaignRow {
  id: string
  space_id: string | null
  subject: string
  body: string | null
  audience_filter: unknown
  topic: string | null
  /** 'scheduled' (a fresh claim) or 'sending' (a stale lease being re-claimed, scan2 L6-10). */
  status: string
}

/** The recipients a campaign already has a ledger row for (any status but 'failed'), keyed both ways. */
interface LedgerRecipients {
  contactIds: Set<string>
  emails: Set<string>
}

/** How many outreach_sends rows one resume-read page holds (PostgREST caps an unranged select at 1000,
 *  and a truncated read would resume-send to people who already got it). */
const LEDGER_PAGE = 1000

// Render a plain-text body to the same minimal HTML the interactive composer uses, with the per-Space
// unsubscribe placeholder the send seam swaps per recipient. Inline styles + hex are correct here (an
// email renders in mail clients, outside the DAWN shell). Kept byte-compatible with campaigns.ts.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function renderCampaignHtml(body: string): string {
  const paras = body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 16px;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('')
  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px;">${paras}<hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/><p style="font-size:12px;color:#999;line-height:1.6;">You're receiving this because you are a contact of this space. <a href="${SPACE_UNSUBSCRIBE_PLACEHOLDER}" style="color:#999;">Unsubscribe</a>.</p></div>`
}

/**
 * Send every campaign whose scheduled send time has arrived. Idempotent: each campaign is CLAIMED with a
 * conditional 'scheduled' -> 'sending' update before it is sent, so two concurrent passes never double-
 * send. `limit` caps how many campaigns one pass claims (keeps a pass bounded). Fail-safe: a single
 * campaign's resolve/send error stamps THAT campaign 'failed' and moves on; the pass never throws.
 */
export async function sendDueCampaigns(limit = 100): Promise<SendDueResult> {
  // The typed admin client (campaigns.space_id / scheduled_for / topic are in the generated types).
  const db = createAdminClient()

  const nowIso = new Date().toISOString()
  // A 'sending' row claimed before this instant is a dead sender (scan2 L6-10): eligible to re-claim.
  const staleBefore = new Date(Date.now() - SENDING_LEASE_MS).toISOString()

  // Find due campaigns (status scheduled, send time reached). Read-only; the claim below is the gate.
  // 2026-09-05 (scan2 L6-10): ALSO a 'sending' row whose lease expired. A NULL lease (a row claimed
  // before the column existed) is never matched by `lt`, so a pre-lease stranded row is left alone.
  const { data: dueRows, error: dueErr } = await db
    .from('campaigns')
    .select('id, space_id, subject, body, audience_filter, topic, status')
    .or(`status.eq.scheduled,and(status.eq.sending,sending_started_at.lt.${staleBefore})`)
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(limit)

  if (dueErr) {
    log.error('cron.space_campaigns.fetch_failed', { error: briefError(dueErr) })
    return { due: 0, claimed: 0, sent: 0, failed: 0 }
  }
  const due: DueCampaignRow[] = dueRows ?? []
  if (due.length === 0) return { due: 0, claimed: 0, sent: 0, failed: 0 }

  // GLOBAL vs per-Space routing. Two different campaign shapes share the `campaigns` table:
  //   • GLOBAL Email Studio campaigns — space_id = root (or legacy null), audience in the `segment`
  //     column, body in `block_json`. They MUST send through sendCampaignNow (resolveSegment + compile
  //     block_json + the unified consent gate). Sending them through the per-Space seam below reads the
  //     wrong fields (audience_filter / body), resolves 0 recipients, and wrongly stamps them 'failed'.
  //   • per-Space campaigns — a non-root space_id + a stored audience_filter → the existing seam.
  // Discriminate by space: root or null → global. (Before this, the cron grabbed global campaigns and
  // failed every one — no global scheduled send could go out. ADR-scheduled-global-send.)
  const rootSpaceId = await loadRootSpaceId()
  const isGlobalCampaign = (spaceId: string | null): boolean => !spaceId || spaceId === rootSpaceId

  let claimed = 0
  let sent = 0
  let failed = 0

  for (const row of due) {
    const resumed = row.status === 'sending'
    // GLOBAL campaign → the Email Studio sender. sendCampaignNow does its OWN atomic claim
    // (scheduled → sending) + stamping, so we do NOT pre-claim here. Idempotent: it refuses an
    // already-sent/sending row. A transient failure resets it to 'scheduled' and it retries next pass.
    // 2026-09-05 (scan2 L5-04, ADR-1212): a GLOBAL campaign that fails now records `failed` with the
    // count sent so far (lib/email-studio/send.ts) and is re-sent by the operator, not this pass.
    if (isGlobalCampaign(row.space_id)) {
      if (resumed) {
        // sendCampaignNow owns the global claim and refuses a 'sending' row, so a stale global lease
        // cannot be resumed from here. Logged (not silent) so the row is visible; the console shows it
        // as 'stalled' and the operator re-schedules it.
        log.warn('cron.space_campaigns.global_sending_stale', { id: row.id })
        continue
      }
      claimed++
      try {
        const res = await sendCampaignNow(row.id)
        if (isError(res)) {
          failed++
          log.error('cron.space_campaigns.global_send_failed', { id: row.id, error: res.error })
        } else {
          sent++
        }
      } catch (err) {
        failed++
        log.error('cron.space_campaigns.global_send_threw', { id: row.id, error: briefError(err) })
      }
      continue
    }
    if (!row.space_id) continue // a scheduled campaign with no Space can never resolve an audience.

    // CLAIM: flip scheduled -> sending, re-asserting status='scheduled' so only one pass wins. A null
    // returned row means another pass already claimed it (or it changed status); skip it.
    // 2026-09-05 (scan2 L6-10): the claim stamps the lease (sending_started_at) and clears send_error.
    // A RESUME re-asserts status='sending' AND the stale stamp instead, so of two passes that both saw
    // the expired lease, only the first update matches: the winner's fresh stamp is no longer `lt`.
    let claimResult: { data: { id: string } | null; error: unknown }
    try {
      // The lease columns landed in 20270345000800; the generated types are regenerated after apply.
      const claimPatch = {
        status: 'sending',
        sending_started_at: new Date().toISOString(),
        send_error: null,
      } as TablesUpdate<'campaigns'>
      const claim = db.from('campaigns').update(claimPatch).eq('id', row.id)
      claimResult = await (resumed
        ? claim.eq('status', 'sending').lt('sending_started_at', staleBefore)
        : claim.eq('status', 'scheduled')
      )
        .select('id')
        .maybeSingle()
    } catch (err) {
      log.error('cron.space_campaigns.claim_threw', { id: row.id, error: briefError(err) })
      continue
    }
    if (claimResult.error || !claimResult.data) continue // lost the race, or a transient claim error.
    claimed++

    // Resolve the stored audience over THIS Space's own contacts, then deliver via the system seam.
    try {
      const filter = definitionToFilter(row.audience_filter)
      let recipients = await resolveAudience(row.space_id, filter)
      if (recipients.length === 0) {
        // Nobody matched the saved audience: stamp 'failed' so it is not re-claimed and the operator
        // can see it did not go out (a scheduled send with an empty audience is a mistake, not a retry).
        await stampStatus(db, row.id, 'failed', 'No contacts matched the saved audience.')
        failed++
        continue
      }
      if (resumed) {
        // RESUME (scan2 L6-10): the dead sender got part way through the fan-out, and every recipient
        // it reached has an outreach_sends row for this campaign. Send only to the rest. FAIL-CLOSED:
        // if the ledger cannot be read, do nothing; the fresh lease expires and the next pass retries.
        // (A double send is the one outcome worse than a late one.)
        const already = await readLedgerRecipients(db, row.id)
        if (!already) {
          log.error('cron.space_campaigns.resume_ledger_unreadable', { id: row.id })
          continue
        }
        recipients = recipients.filter(
          (r) => !(r.contactId && already.contactIds.has(r.contactId)) && !already.emails.has(r.email.toLowerCase()),
        )
        log.info('cron.space_campaigns.resumed', { id: row.id, remaining: recipients.length })
        if (recipients.length === 0) {
          // Everyone already has a row: the fan-out had finished, only the terminal stamp was lost.
          await stampStatus(db, row.id, 'sent')
          sent++
          continue
        }
      }
      const res = await sendSpaceCampaignSystem(row.space_id, {
        campaignId: row.id,
        subject: row.subject,
        html: renderCampaignHtml(row.body ?? ''),
        topic: normalizeEmailTopic(row.topic),
        recipients,
      })
      if (isError(res)) {
        await stampStatus(db, row.id, 'failed', res.error)
        failed++
        log.error('cron.space_campaigns.send_failed', { id: row.id, error: res.error })
        continue
      }
      await stampStatus(db, row.id, 'sent')
      sent++
    } catch (err) {
      await stampStatus(db, row.id, 'failed', briefError(err))
      failed++
      log.error('cron.space_campaigns.send_threw', { id: row.id, error: briefError(err) })
    }
  }

  return { due: due.length, claimed, sent, failed }
}

/** Stamp a claimed campaign to a terminal status ('sent' or 'failed'), setting sent_at on a send and
 *  send_error on a failure (scan2 L6-10, so the operator sees why without the logs).
 *  Best-effort: the email already went out, so a failed status write must not surface as an error.
 *  2026-09-05 (scan2 L6-10): a lost stamp no longer strands the row. It stays 'sending' under its lease,
 *  the next pass after the lease re-claims it, finds every recipient in the ledger, and stamps 'sent'. */
async function stampStatus(
  db: ReturnType<typeof createAdminClient>,
  id: string,
  status: 'sent' | 'failed',
  error?: string,
): Promise<void> {
  const patch =
    status === 'sent'
      ? ({ status, sent_at: new Date().toISOString(), send_error: null } as TablesUpdate<'campaigns'>)
      : ({ status, send_error: (error ?? 'send failed').slice(0, 300) } as TablesUpdate<'campaigns'>)
  try {
    const { error: stampErr } = await db.from('campaigns').update(patch).eq('id', id)
    if (stampErr) log.error('cron.space_campaigns.stamp_failed', { id, status, error: briefError(stampErr) })
  } catch {
    // ignore: the send already happened; the status stamp is non-critical.
  }
}

/** Every recipient of `campaignId` that already has an outreach_sends row in any status but 'failed'
 *  (queued, sent, delivered, bounced, complained, suppressed: all mean "do not send again"). Paged so a
 *  large fan-out is read in full. Null on a read error (the caller treats that as "cannot resume"). */
async function readLedgerRecipients(
  db: ReturnType<typeof createAdminClient>,
  campaignId: string,
): Promise<LedgerRecipients | null> {
  const contactIds = new Set<string>()
  const emails = new Set<string>()
  for (let from = 0; ; from += LEDGER_PAGE) {
    const { data, error } = await db
      .from('outreach_sends')
      .select('contact_id, email')
      .eq('campaign_id', campaignId)
      .neq('status', 'failed')
      .range(from, from + LEDGER_PAGE - 1)
    if (error) return null
    const page = data ?? []
    for (const r of page) {
      if (r.contact_id) contactIds.add(r.contact_id)
      if (r.email) emails.add(r.email.toLowerCase())
    }
    if (page.length < LEDGER_PAGE) break
  }
  return { contactIds, emails }
}
