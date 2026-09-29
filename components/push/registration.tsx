'use client'

// Browser side of the push pipeline, on every (main) layout mount.
//
// LIVE-701 (2026-09-29): this effect NEVER asks for notification permission. It used to ask the
// moment a page loaded, with no tap, and a prompt with no user gesture is exactly the one phones
// suppress: iPhone Safari refuses it outright and Chrome shows it quieted. So the ask a member most
// needed to see was the one they never saw. The ask now lives behind a "Turn on notifications"
// button (components/push/permission-card.tsx, on Settings and as a one-time card after an RSVP or
// in a Circle), which calls enablePushFromTap from the click itself.
//
// What this effect still does, none of which shows a prompt:
//   · registers /sw.js, so the worker is active before the member ever taps;
//   · re-saves an EXISTING subscription so the server stays in sync if rows were ever lost;
//   · subscribes a browser that ALREADY granted permission but holds no subscription (a save that
//     failed and was torn down, a cleared worker). With permission granted, subscribing is silent.
//
// 2026-09-05 (scan2 L5-20): the subscription save used to fail silently. saveSubscription returns an
// ActionResult and its outcome is READ. On a FRESH subscribe that fails to land, the browser
// subscription is torn down again (subscribeAndSave) and the member sees one plain line. The re-sync
// of an EXISTING subscription is logged on failure rather than announced: the member is most likely
// already subscribed server-side, and telling them push is off on every page load would be wrong
// more often than right.

import { useEffect, useState } from 'react'
import { isError } from '@/lib/action-result'
import { saveSubscription } from './actions'
import { PUSH_SAVE_FAILED_COPY, payloadOf, registerWorker, subscribeAndSave } from './subscribe'

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

export function PushRegistration() {
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    const publicKey = PUBLIC_KEY
    if (!publicKey) return // env not configured, no-op silently

    let cancelled = false

    async function setup(key: string) {
      const reg = await registerWorker()
      if (cancelled) return

      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        const synced = await saveSubscription(payloadOf(existing)).catch((e: unknown) => ({
          error: e instanceof Error ? e.message : 'save failed',
        }))
        if (isError(synced)) console.error('[push] subscription re-sync failed', synced.error)
        return
      }

      // No subscription. Only a browser that already said yes is subscribed from here; any other
      // state waits for the member's tap (LIVE-701). A page load is not a gesture.
      if (!('Notification' in window) || Notification.permission !== 'granted') return

      const outcome = await subscribeAndSave(reg, key)
      if (outcome === 'save-failed' && !cancelled) setSaveFailed(true)
    }

    setup(publicKey).catch(() => {
      // Worker registration or subscribe refused by browser policy: a no-op. The member can
      // always turn push on from Settings.
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (!saveFailed) return null
  return (
    <p
      role="status"
      className="fixed bottom-4 left-4 z-50 max-w-xs rounded-card border border-border bg-surface-elevated px-3 py-2 text-body-sm text-subtle shadow-pop"
    >
      {PUSH_SAVE_FAILED_COPY}{' '}
      <button type="button" onClick={() => setSaveFailed(false)} className="ml-1 font-semibold text-primary-strong underline">
        Dismiss
      </button>
    </p>
  )
}
