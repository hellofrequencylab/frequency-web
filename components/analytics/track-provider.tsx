'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// Client-side tracking (ADR-070, ANALYTICS.md). Dual-emit: mirror to GA4 (if the tag
// is live) AND record first-party via /api/track. PageViewTracker auto-captures
// route changes; useTrack() instruments feature interactions. Fire-and-forget — a
// failed beacon must never affect the UI.

declare global {
  interface Window {
    gtag?: (command: string, ...args: unknown[]) => void
  }
}

/** Emit a client analytics event to GA4 + first-party. Only client-emittable
 *  taxonomy events are accepted server-side; unknown ones are dropped there. */
export function trackClient(event: string, props: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return
  // GA4 mirror (dots → underscores for GA's event-name rules)
  window.gtag?.('event', event.replace(/\./g, '_'), props)
  // First-party — sendBeacon survives navigation; fall back to keepalive fetch.
  try {
    const payload = JSON.stringify({ event, props })
    const beaconed =
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }))
    if (!beaconed) {
      void fetch('/api/track', {
        method: 'POST',
        body: payload,
        keepalive: true,
        headers: { 'content-type': 'application/json' },
      }).catch(() => {})
    }
  } catch {
    /* never throw from tracking */
  }
}

/** Hook returning a stable tracker for feature instrumentation. */
export function useTrack() {
  return useCallback((event: string, props?: Record<string, unknown>) => trackClient(event, props), [])
}

/** Mounts once in the app shell; records nav.page_view on every route change. */
export function PageViewTracker() {
  const pathname = usePathname()
  const last = useRef<string | null>(null)

  useEffect(() => {
    if (last.current === pathname) return
    last.current = pathname
    trackClient('nav.page_view', { path: pathname })
  }, [pathname])

  return null
}
