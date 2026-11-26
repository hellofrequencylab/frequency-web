import { HOME_TZ } from '@/lib/time/home-zone'
import { createAdminClient } from '@/lib/supabase/admin'
import type { JobHandler } from '@/lib/queue/outbox'
import type { PreferenceSubject } from '@/lib/notification-preferences'

// The 'inapp' outbox handler: writes ONE `notifications` row, the table the bell and
// /notifications read. The router (./router.ts) enqueues it after the member's own
// `inapp_<category>` switch, suppression and per-subject mute have passed the send-gate, so this
// stays a plain write. It throws on a failed insert so the drain retries and, past the cap,
// dead-letters, instead of marking a missing bell row as sent.
//
// authz-delegated: this handler is caller-trusted (ADR-274). It is reachable only from the outbox
// drain, never from a request, and a job exists only because routeNotification enqueued it after the
// recipient's own send-gate passed. The gate lives at the enqueue site, not here.

export const INAPP_JOB_KIND = 'inapp'

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export const runInappNotification: JobHandler = async (payload) => {
  const profileId = text(payload.profileId)
  const type = text(payload.type)
  const body = text(payload.body)
  if (!profileId || !type || !body) throw new Error('inapp job missing profileId, type or body')

  const { error } = await createAdminClient()
    .from('notifications')
    .insert({
      recipient_id: profileId,
      actor_id: text(payload.actorId),
      type,
      reference_type: text(payload.referenceType),
      reference_id: text(payload.referenceId),
      body,
    })
  if (error) throw new Error(`inapp insert failed: ${error.message}`)
}

// ── The notice ladder's later rungs (EMAIL-091) ─────────────────────────────────────────────────
// A 'hub-ladder' job is a push or an email that lib/notifications/ladder-route.ts scheduled when a
// hub notice rang the bell. It looks before it sends: if every bell row on that thread since the
// notice was scheduled is read or cleared, it stops. Inside the person's quiet hours it puts itself
// back for the end of the window. Otherwise it routes the one channel through the router, so the
// person's own switches, suppression and mutes still decide. Same authz-delegated contract as above:
// reachable only from the outbox drain, enqueued only by the ladder after the bell was allowed.

export const runHubLadder: JobHandler = async (payload) => {
  const { HUB_LADDER_KIND, inQuietHours, ladderStillDue, quietEndsAt } = await import('./ladder')
  const rung = payload.rung === 'email' ? 'email' : payload.rung === 'push' ? 'push' : null
  const event = payload.event === 'item.mention' || payload.event === 'item.comment' ? payload.event : null
  const profileId = text(payload.profileId)
  const since = text(payload.since)
  const ctx = payload.ctx as { referenceType?: string; referenceId?: string; title?: string; body?: string; url?: string } | null
  if (!rung || !event || !profileId || !since || !ctx?.referenceType || !ctx.referenceId) return

  const admin = createAdminClient()
  const { data: notices } = await admin
    .from('notifications')
    .select('id, read_at, archived_at, created_at')
    .eq('recipient_id', profileId)
    .eq('reference_type', ctx.referenceType)
    .eq('reference_id', ctx.referenceId)
    .gte('created_at', new Date(Date.parse(since) - 60_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(50)
  if (!ladderStillDue((notices ?? []).map((n) => ({ readAt: n.read_at, archivedAt: n.archived_at })))) return

  const [{ data: prefs }, { data: profile }] = await Promise.all([
    admin.from('notification_preferences').select('quiet_hours_start, quiet_hours_end').eq('profile_id', profileId).maybeSingle(),
    admin.from('profiles').select('home_timezone, display_name').eq('id', profileId).maybeSingle(),
  ])
  const quiet =
    prefs && prefs.quiet_hours_start !== null && prefs.quiet_hours_end !== null
      ? { start: prefs.quiet_hours_start, end: prefs.quiet_hours_end, timeZone: profile?.home_timezone || HOME_TZ }
      : null
  const now = Date.now()
  if (quiet && inQuietHours(now, quiet)) {
    const { enqueue } = await import('@/lib/queue/outbox')
    await enqueue(HUB_LADDER_KIND, payload, { runAfter: new Date(quietEndsAt(now, quiet)), maxAttempts: 3 })
    return
  }

  const { routeNotification } = await import('./router')
  const subject = (payload.subject ?? undefined) as PreferenceSubject | undefined
  if (rung === 'push') {
    await routeNotification(event, { profileId, subject }, payload.ctx as never, { only: ['push'] })
    return
  }
  if (event !== 'item.mention') return
  const { profileAccountEmail } = await import('@/lib/profiles/account-email')
  const to = await profileAccountEmail(profileId)
  if (!to) return
  // A reply to this email posts into the thread as this person (EMAIL-090): the Reply-To names the
  // newest unread bell row, which already says who it was for and which thread it is about.
  const newestUnread = (notices ?? []).find((n) => !n.read_at && !n.archived_at)
  const { buildThreadReplyAddress, conversationSigningAvailable } = await import('@/lib/comms/reply-address')
  const replyTo = newestUnread && conversationSigningAvailable() ? buildThreadReplyAddress(newestUnread.id) ?? undefined : undefined
  const { buildHubTagEmail } = await import('@/lib/email')
  const email = buildHubTagEmail({
    to,
    recipientName: profile?.display_name?.trim() || 'there',
    recipientProfileId: profileId,
    title: ctx.title ?? 'You were mentioned',
    preview: ctx.body ?? '',
    path: ctx.url ?? '/inbox',
    replyTo,
  })
  await routeNotification('item.mention', { profileId, email: to, subject }, { ...(payload.ctx as object), email } as never, { only: ['email'] })
}
