'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { observe, flushObservations } from '@/lib/analytics/observe'

// Wide interaction auto-capture (PI.1, ADR-166). Mounts once in the app shell beside
// PageViewTracker. PageViewTracker records the SEMANTIC nav.page_view (engagement_events);
// this records the RAW firehose (interaction_events): per-route view + dwell, scroll-depth
// milestones, and rage-clicks — plus the flush lifecycle. Explicit signals elsewhere call
// observe() directly. Best-effort; never affects the UI.

const SCROLL_MILESTONES = [25, 50, 75, 100] as const

export function ObserveProvider() {
  const pathname = usePathname()
  const enteredAt = useRef<number>(0)
  const firedScroll = useRef<Set<number>>(new Set())
  const clickTimes = useRef<number[]>([])

  // Per-route: emit dwell for the route we're leaving, then view for the new one.
  useEffect(() => {
    enteredAt.current = Date.now()
    firedScroll.current = new Set()
    observe('view', { path: pathname })

    return () => {
      const ms = Date.now() - enteredAt.current
      // Ignore instantaneous unmounts (StrictMode double-invoke, instant redirects).
      if (ms > 250) observe('dwell', { ms, path: pathname })
    }
  }, [pathname])

  // Scroll-depth milestones (once each per route) + rage-click detection + flush lifecycle.
  useEffect(() => {
    function onScroll() {
      const doc = document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      if (max <= 0) return
      const pct = Math.min(100, Math.round((doc.scrollTop / max) * 100))
      for (const m of SCROLL_MILESTONES) {
        if (pct >= m && !firedScroll.current.has(m)) {
          firedScroll.current.add(m)
          observe('scroll', { pct: m })
        }
      }
    }

    function onClick(e: MouseEvent) {
      const now = Date.now()
      clickTimes.current = clickTimes.current.filter((t) => now - t < 600)
      clickTimes.current.push(now)
      if (clickTimes.current.length >= 3) {
        clickTimes.current = []
        const el = e.target as Element | null
        const target = el?.closest('[data-observe]')?.getAttribute('data-observe') ?? el?.tagName?.toLowerCase() ?? null
        observe('rage_click', target ? { target } : {})
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        observe('visibility', { state: 'hidden' })
        flushObservations()
      }
    }

    function onPageHide() {
      flushObservations()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('click', onClick, true)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  return null
}
