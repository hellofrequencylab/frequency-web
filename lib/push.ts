// Web Push sender.
//
// Loads VAPID config from env. If keys aren't set, no-ops with a warning
// (matches the pattern used by lib/email.ts so the app never crashes from
// missing notification config).
//
// 410 Gone or 404 from the push service means the user revoked the
// subscription — we prune the row so the table stays small.

import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSendGate, type SendCategory } from '@/lib/comms/send-gate'

const PUBLIC_KEY  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const SUBJECT     = process.env.VAPID_SUBJECT ?? 'mailto:hello@frequencylocal.com'

let configured = false
function configure(): boolean {
  if (configured) return true
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    console.warn('[push] VAPID keys not set — push sending disabled.')
    return false
  }
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY)
  configured = true
  return true
}

export type PushPayload = {
  title: string
  body:  string
  url:   string
  tag?:  string
}

// Fan out to all push subscriptions for a single profile. Runs the full
// send-gate (preferences + consent + suppression) before touching the DB —
// if the gate denies, returns 0 without loading subscriptions. Prunes
// revoked subscriptions in-place (404/410 from the push service).
export async function sendPushToProfile(
  profileId: string,
  payload:   PushPayload,
  category:  SendCategory,
): Promise<number> {
  if (!configure()) return 0

  const gate = await resolveSendGate(profileId, 'push', category)
  if (!gate.allowed) return 0

  const admin = createAdminClient()
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('profile_id', profileId)

  type SubRow = { id: string; endpoint: string; p256dh: string; auth: string }
  const subsList = (subs ?? []) as SubRow[]
  if (!subsList.length) return 0

  const body = JSON.stringify(payload)
  let sent = 0

  for (const s of subsList) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys:     { p256dh: s.p256dh, auth: s.auth },
        },
        body,
      )
      sent++
      // Touch last_used_at so we know the subscription is alive.
      await admin
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', s.id)
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        // Subscription revoked or expired — prune it.
        await admin.from('push_subscriptions').delete().eq('id', s.id)
      } else {
        console.error('[push] sendNotification failed:', err)
      }
    }
  }

  return sent
}
