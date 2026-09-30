'use client'

// The two halves of turning push on, shared by the page-load re-sync (registration.tsx) and the
// "Turn on notifications" tap (permission-card.tsx). LIVE-701.
//
// `enablePushFromTap` is the ONLY place in the app that asks the browser for permission, and it
// must be called straight from a click handler: the permission request is its first statement, so
// it runs inside the member's gesture before any await can end it (Safari drops the gesture across
// an await). It never asks a browser that already denied.

import { isError } from '@/lib/action-result'
import { saveSubscription } from './actions'

export const PUSH_SAVE_FAILED_COPY = 'Push could not be turned on. Try again.'

export type SaveOutcome = 'saved' | 'save-failed'
export type TapOutcome = SaveOutcome | 'denied' | 'dismissed' | 'failed'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function b64Key(sub: PushSubscription, name: 'p256dh' | 'auth'): string {
  const raw = sub.getKey(name)
  if (!raw) return ''
  const bytes = new Uint8Array(raw)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export function payloadOf(sub: PushSubscription) {
  return {
    endpoint: sub.endpoint,
    p256dh: b64Key(sub, 'p256dh'),
    auth: b64Key(sub, 'auth'),
    userAgent: navigator.userAgent,
  }
}

export function registerWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

/**
 * Subscribes a browser that ALREADY holds permission (so no prompt shows) and saves the
 * subscription. A save that does not land tears the browser subscription down again, so the
 * browser never claims a subscribed state the server does not hold (scan2 L5-20).
 */
export async function subscribeAndSave(
  reg: ServiceWorkerRegistration,
  publicKey: string,
): Promise<SaveOutcome> {
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  })
  const saved = await saveSubscription(payloadOf(sub)).catch((e: unknown) => ({
    error: e instanceof Error ? e.message : 'save failed',
  }))
  if (isError(saved)) {
    console.error('[push] subscription save failed', saved.error)
    await sub.unsubscribe().catch(() => {})
    return 'save-failed'
  }
  return 'saved'
}

/** Call ONLY from a click handler. See the header. */
export async function enablePushFromTap(publicKey: string | undefined): Promise<TapOutcome> {
  if (!publicKey) return 'failed'
  if (!('Notification' in window)) return 'failed'
  // Never re-prompt after a denial: the browser would refuse anyway, and asking is the nag.
  if (Notification.permission === 'denied') return 'denied'
  try {
    const permission =
      Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (permission === 'denied') return 'denied'
    if (permission !== 'granted') return 'dismissed'
    const reg = await registerWorker()
    // Chrome refuses a subscribe until the worker is active; ready resolves once it is.
    const active = navigator.serviceWorker.ready ? await navigator.serviceWorker.ready : reg
    const existing = await active.pushManager.getSubscription()
    if (existing) {
      const synced = await saveSubscription(payloadOf(existing)).catch(() => ({ error: 'save failed' }))
      return isError(synced) ? 'save-failed' : 'saved'
    }
    return await subscribeAndSave(active, publicKey)
  } catch (e) {
    console.error('[push] turning on notifications failed', e)
    return 'failed'
  }
}
