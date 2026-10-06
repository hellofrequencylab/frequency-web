// Native push transport (LIVE-720): Expo's push service, beside the Web Push transport in
// lib/push.ts. Both run AFTER the one send gate in sendPushToProfile, so a member's preferences,
// consent, suppression and per-subject mutes are shared and never fork by device.
//
// Inert without credentials: with no EXPO_ACCESS_TOKEN set, `nativePushEnabled` is false, nothing
// is sent, and /api/status reports `monitoring.nativePush: false`, the same "a fail-safe needs a
// gate that notices it fired" move push.ts makes for VAPID.
//
// Expo answers one ticket per message. A ticket with `details.error: "DeviceNotRegistered"` means
// the app was uninstalled or the token rotated, so the row is pruned, the way Web Push prunes a
// 404/410 endpoint. Receipts (the second, delayed Expo check) are not polled yet; a dead token is
// caught on the next send instead.
//
// APNS ALTERNATIVE: a row with provider 'apns' is a raw device token for a build that skips Expo's
// push service. It is stored and listed but not sent: a direct APNs transport (token-based auth
// against api.push.apple.com) is the documented alternative in docs/APP-CONTRACT.md and lands with
// the app build if it is chosen.

import { createAdminClient } from '@/lib/supabase/admin'
import type { PushPayload } from '@/lib/push'

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send'
/** Expo accepts at most 100 messages per request. */
const EXPO_BATCH = 100

/** Can this deployment send a native push? Booleanized, never the token. */
export const nativePushEnabled = Boolean(process.env.EXPO_ACCESS_TOKEN)

type DeviceRow = { id: string; token: string }
type ExpoTicket = { status: 'ok' | 'error'; details?: { error?: string } }

/** Send to every Expo device token a profile has registered. Returns how many Expo accepted. The
 *  caller (sendPushToProfile) has already passed the send gate. */
export async function sendNativePush(profileId: string, payload: PushPayload): Promise<number> {
  if (!nativePushEnabled) return 0
  const admin = createAdminClient()
  const { data } = await admin
    .from('push_devices')
    .select('id, token')
    .eq('profile_id', profileId)
    .eq('provider', 'expo')
  const devices = (data ?? []) as DeviceRow[]
  if (!devices.length) return 0

  let sent = 0
  const dead: string[] = []
  for (let i = 0; i < devices.length; i += EXPO_BATCH) {
    const batch = devices.slice(i, i + EXPO_BATCH)
    try {
      const res = await fetch(EXPO_SEND_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}`,
        },
        body: JSON.stringify(
          batch.map((d) => ({
            to: d.token,
            title: payload.title,
            body: payload.body,
            data: { url: payload.url },
            ...(payload.tag ? { collapseId: payload.tag } : {}),
          })),
        ),
      })
      if (!res.ok) {
        console.error('[push-native] Expo send failed:', res.status)
        continue
      }
      const tickets = ((await res.json()) as { data?: ExpoTicket[] }).data ?? []
      tickets.forEach((t, j) => {
        if (t.status === 'ok') sent++
        else if (t.details?.error === 'DeviceNotRegistered' && batch[j]) dead.push(batch[j].id)
      })
    } catch (err) {
      console.error('[push-native] Expo send failed:', err)
    }
  }
  if (dead.length) await admin.from('push_devices').delete().in('id', dead)
  if (sent) {
    await admin
      .from('push_devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('profile_id', profileId)
      .eq('provider', 'expo')
  }
  return sent
}
