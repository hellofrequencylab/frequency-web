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
//
// The send itself goes through the SYSTEM send seam (sendSpaceCampaignSystem, lib/spaces/email.ts), which
// re-runs every anti-spam gate (email function enabled, kill-switch on, daily cap, per-recipient consent
// + suppression, per-Space unsubscribe, the outreach_sends ledger) with NO caller session. The audience
// is resolved from the campaign's stored audience_filter (persisted by scheduleSpaceCampaign) over the
// Space's OWN contacts (resolveAudience), so tenancy holds end to end.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAudience, definitionToFilter } from '@/lib/spaces/audiences'
import { sendSpaceCampaignSystem, SPACE_UNSUBSCRIBE_PLACEHOLDER } from '@/lib/spaces/email'
import { sendCampaignNow } from '@/lib/email-studio/send'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { isError } from '@/lib/action-result'
import { log } from '@/lib/log'

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
}

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
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string) => {
          lte: (c: string, v: string) => {
            order: (c: string, o: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: DueCampaignRow[] | null; error: unknown }>
            }
          }
        }
      }
      update: (patch: Record<string, unknown>) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            select: (cols: string) => {
              maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }>
            }
          }
        }
      }
    }
  }

  const nowIso = new Date().toISOString()

  // Find due campaigns (status scheduled, send time reached). Read-only; the claim below is the gate.
  const { data: dueRows, error: dueErr } = await db
    .from('campaigns')
    .select('id, space_id, subject, body, audience_filter')
    .eq('status', 'scheduled')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(limit)

  if (dueErr) {
    log.error('cron.space_campaigns.fetch_failed', { error: String(dueErr) })
    return { due: 0, claimed: 0, sent: 0, failed: 0 }
  }
  const due = dueRows ?? []
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
    // GLOBAL campaign → the Email Studio sender. sendCampaignNow does its OWN atomic claim
    // (scheduled → sending) + stamping, so we do NOT pre-claim here. Idempotent: it refuses an
    // already-sent/sending row. A transient failure resets it to 'scheduled' and it retries next pass.
    if (isGlobalCampaign(row.space_id)) {
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
        log.error('cron.space_campaigns.global_send_threw', { id: row.id, error: String(err) })
      }
      continue
    }
    if (!row.space_id) continue // a scheduled campaign with no Space can never resolve an audience.

    // CLAIM: flip scheduled -> sending, re-asserting status='scheduled' so only one pass wins. A null
    // returned row means another pass already claimed it (or it changed status); skip it.
    let claimResult: { data: { id: string } | null; error: unknown }
    try {
      claimResult = await db
        .from('campaigns')
        .update({ status: 'sending' })
        .eq('id', row.id)
        .eq('status', 'scheduled')
        .select('id')
        .maybeSingle()
    } catch (err) {
      log.error('cron.space_campaigns.claim_threw', { id: row.id, error: String(err) })
      continue
    }
    if (claimResult.error || !claimResult.data) continue // lost the race, or a transient claim error.
    claimed++

    // Resolve the stored audience over THIS Space's own contacts, then deliver via the system seam.
    try {
      const filter = definitionToFilter(row.audience_filter)
      const recipients = await resolveAudience(row.space_id, filter)
      if (recipients.length === 0) {
        // Nobody matched the saved audience: stamp 'failed' so it is not re-claimed and the operator
        // can see it did not go out (a scheduled send with an empty audience is a mistake, not a retry).
        await stampStatus(db, row.id, 'failed')
        failed++
        continue
      }
      const res = await sendSpaceCampaignSystem(row.space_id, {
        campaignId: row.id,
        subject: row.subject,
        html: renderCampaignHtml(row.body ?? ''),
        recipients,
      })
      if (isError(res)) {
        await stampStatus(db, row.id, 'failed')
        failed++
        log.error('cron.space_campaigns.send_failed', { id: row.id, error: res.error })
        continue
      }
      await stampStatus(db, row.id, 'sent')
      sent++
    } catch (err) {
      await stampStatus(db, row.id, 'failed')
      failed++
      log.error('cron.space_campaigns.send_threw', { id: row.id, error: String(err) })
    }
  }

  return { due: due.length, claimed, sent, failed }
}

/** Stamp a claimed campaign to a terminal status ('sent' or 'failed'), setting sent_at on a send.
 *  Best-effort: the email already went out, so a failed status write must not surface as an error. */
async function stampStatus(
  db: { from: (t: string) => unknown },
  id: string,
  status: 'sent' | 'failed',
): Promise<void> {
  const patch: Record<string, unknown> =
    status === 'sent' ? { status, sent_at: new Date().toISOString() } : { status }
  try {
    const table = db.from('campaigns') as unknown as {
      update: (p: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> }
    }
    await table.update(patch).eq('id', id)
  } catch {
    // ignore: the send already happened; the status stamp is non-critical.
  }
}
