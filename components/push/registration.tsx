'use client'

// Browser side of the push pipeline.
//
// Runs once per (main) layout mount. If push is supported AND not already
// subscribed AND not already denied, asks for permission and subscribes
// silently. The subscription POSTs to a server action that upserts into
// push_subscriptions.
//
// Important: never prompts on every page load — `Notification.permission`
// gates the actual permission request. Once a user denies, the browser
// refuses further prompts anyway (gated by user agent policy).
//
// 2026-09-05 (scan2 L5-20): the subscription save used to fail silently (`.catch(() => {})`
// twice), so a member who granted permission and whose browser then showed "subscribed" received
// nothing and had no way to know. saveSubscription returns an ActionResult and does not throw on
// a failed write, so its outcome is READ. On a FRESH subscribe that fails to land, the browser
// subscription is torn down again (so the browser never claims a subscribed state the server does
// not hold) and the member sees one plain line. The re-sync of an EXISTING subscription is logged
// on failure rather than announced: the member is most likely already subscribed server-side, and
// telling them push is off on every page load would be wrong more often than right.

import { useEffect, useState } from 'react'
import { isError } from '@/lib/action-result'
import { saveSubscription } from './actions'

export const PUSH_SAVE_FAILED_COPY = 'Push could not be turned on. Try again.'

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function PushRegistration() {
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (!PUBLIC_KEY) return  // env not configured, no-op silently

    let cancelled = false

    async function setup() {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      if (cancelled) return

      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        // Already subscribed — re-POST so the server stays in sync if rows
        // were ever lost (no-op if endpoint already known).
        const synced = await saveSubscription({
          endpoint:   existing.endpoint,
          p256dh:     b64Key(existing, 'p256dh'),
          auth:       b64Key(existing, 'auth'),
          userAgent:  navigator.userAgent,
        }).catch((e: unknown) => ({ error: e instanceof Error ? e.message : 'save failed' }))
        if (isError(synced)) console.error('[push] subscription re-sync failed', synced.error)
        return
      }

      if (Notification.permission === 'denied') return
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission()
        if (result !== 'granted') return
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY!) as BufferSource,
      })

      const saved = await saveSubscription({
        endpoint:  sub.endpoint,
        p256dh:    b64Key(sub, 'p256dh'),
        auth:      b64Key(sub, 'auth'),
        userAgent: navigator.userAgent,
      }).catch((e: unknown) => ({ error: e instanceof Error ? e.message : 'save failed' }))
      if (isError(saved)) {
        console.error('[push] subscription save failed', saved.error)
        // The server holds no row for this endpoint, so the browser must not keep claiming one:
        // a subscribed browser with no server row is exactly the "subscribed, receives nothing"
        // state this closes. Tearing it down also lets the next visit ask again.
        await sub.unsubscribe().catch(() => {})
        if (!cancelled) setSaveFailed(true)
      }
    }

    setup().catch(() => {
      // Permission denials, focus issues, browser policy — all handled
      // by no-op. The user always controls reflow via /settings.
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

function b64Key(sub: PushSubscription, name: 'p256dh' | 'auth'): string {
  const raw = sub.getKey(name)
  if (!raw) return ''
  const bytes = new Uint8Array(raw)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
