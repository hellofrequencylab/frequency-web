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

import { useEffect } from 'react'
import { saveSubscription } from './actions'

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
        await saveSubscription({
          endpoint:   existing.endpoint,
          p256dh:     b64Key(existing, 'p256dh'),
          auth:       b64Key(existing, 'auth'),
          userAgent:  navigator.userAgent,
        }).catch(() => {})
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

      await saveSubscription({
        endpoint:  sub.endpoint,
        p256dh:    b64Key(sub, 'p256dh'),
        auth:      b64Key(sub, 'auth'),
        userAgent: navigator.userAgent,
      }).catch(() => {})
    }

    setup().catch(() => {
      // Permission denials, focus issues, browser policy — all handled
      // by no-op. The user always controls reflow via /settings.
    })

    return () => {
      cancelled = true
    }
  }, [])

  return null
}

function b64Key(sub: PushSubscription, name: 'p256dh' | 'auth'): string {
  const raw = sub.getKey(name)
  if (!raw) return ''
  const bytes = new Uint8Array(raw)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
