import 'server-only'

// The email + push fan-out for a PUBLISHED Dispatch, in one place (SCAN-756). It used to live only
// inside publishDispatch as a detached async IIFE: the publish-scheduled cron never ran it, so a
// scheduled Dispatch reached no inbox or phone, and an immediate publish could be cut off mid
// fan-out once the function froze after responding. publishDispatch now runs this through
// after() and the cron awaits it per id.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { sendDispatchNotificationEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import type { PreferenceSubject } from '@/lib/notification-preferences'
import { sendPushToProfile } from '@/lib/push'
import { log, briefError } from '@/lib/log'

type Admin = SupabaseClient<Database>

/** Active member profile ids in the Dispatch's audience (a hub or nexus rolls up through its circles). */
async function audienceProfileIds(admin: Admin, scope: string | null, audienceId: string | null): Promise<string[]> {
  if (!audienceId) return []
  let circleIds: string[] = []
  if (scope === 'circle') {
    circleIds = [audienceId]
  } else if (scope === 'hub') {
    const { data: circles } = await admin.from('circles').select('id').eq('hub_id', audienceId)
    circleIds = (circles ?? []).map((c) => c.id)
  } else if (scope === 'nexus') {
    const { data: hubs } = await admin.from('hubs').select('id').eq('nexus_id', audienceId)
    const hids = (hubs ?? []).map((h) => h.id)
    if (hids.length > 0) {
      const { data: circles } = await admin.from('circles').select('id').in('hub_id', hids)
      circleIds = (circles ?? []).map((c) => c.id)
    }
  }
  if (!circleIds.length) return []
  const { data } = await admin.from('memberships').select('profile_id').in('circle_id', circleIds).eq('status', 'active')
  return [...new Set((data ?? []).map((m) => m.profile_id))]
}

/** Email + push every member in the Dispatch's audience, through the one send gate. Never throws:
 *  a failure is logged and the publish stands. Returns how many members were reached on either channel. */
export async function notifyDispatchAudience(admin: Admin, dispatchId: string): Promise<number> {
  let reached = 0
  try {
    const { data: dispatch } = await admin
      .from('dispatches')
      .select('id, title, excerpt, audience_scope, audience_id, author:profiles!author_id(display_name)')
      .eq('id', dispatchId)
      .maybeSingle()
    if (!dispatch) return 0

    const authorName = dispatch.author?.display_name ?? 'A host'
    const excerpt = dispatch.excerpt ?? ''
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
    const dispatchUrl = `${appUrl}/nearby/${dispatchId}`

    const profileIds = await audienceProfileIds(admin, dispatch.audience_scope, dispatch.audience_id)
    if (!profileIds.length) return 0

    const { data: profiles } = await admin.from('profiles').select('id, display_name, auth_user_id').in('id', profileIds)
    if (!profiles?.length) return 0

    // The Circle this Dispatch is from, so a member who muted it in /settings is skipped on both
    // channels. The gate only consults the per-subject mute when the send names its subject
    // (meta-scan B9 D2); a hub/nexus Dispatch has no mutable subject and passes none.
    const subject: PreferenceSubject | undefined =
      dispatch.audience_scope === 'circle' && dispatch.audience_id
        ? { subjectType: 'circle', subjectId: dispatch.audience_id }
        : undefined

    for (const profile of profiles) {
      if (!profile.auth_user_id) continue
      let notified = false
      try {
        // The ONE seam (ADR-169), not the bare preference read it replaced: that read skipped
        // suppression and the per-Circle mute (meta-scan B9 H6). The address is resolved first so
        // suppression can see it.
        const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
        const gate = user?.email
          ? await resolveSendGate(profile.id, 'email', 'dispatches', { email: user.email, subject })
          : null
        if (user?.email && gate?.allowed) {
          await sendDispatchNotificationEmail({
            to: user.email,
            recipientName: profile.display_name,
            recipientProfileId: profile.id,
            authorName,
            dispatchTitle: dispatch.title,
            excerpt,
            dispatchUrl,
          })
          notified = true
        }
        const pushed = await sendPushToProfile(profile.id, {
          title: `📡 ${dispatch.title}`,
          body: excerpt || `New dispatch from ${authorName}`,
          url: `/nearby/${dispatch.id}`,
          tag: `dispatch-${dispatch.id}`,
        }, 'dispatches', { subject })
        if (pushed > 0) notified = true
      } catch (err) {
        log.warn('dispatch.fan_out.recipient_failed', { dispatchId, profileId: profile.id, error: briefError(err) })
      }
      if (notified) reached++
    }
  } catch (err) {
    log.error('dispatch.fan_out.failed', { dispatchId, error: briefError(err) })
  }
  return reached
}
