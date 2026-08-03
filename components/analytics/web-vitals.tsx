'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useReportWebVitals } from 'next/web-vitals'
import { bufferVital, flushVitals, normalizeVital, templatePath } from '@/lib/analytics/vitals'

// The landing route — the page load these metrics actually describe. CLS/INP keep
// accumulating across soft navigations within ONE page load, so attributing them to
// the live pathname would be wrong; the landing route's bundle/render produced them.
// Module scope so the report callback identity NEVER changes: useReportWebVitals
// re-subscribes every observer when the fn identity changes, which double-reports
// (next/dist/client/web-vitals.js).
let landingPath: string | null = null

const report: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  const v = normalizeVital({
    name: metric.name,
    value: metric.value,
    rating: (metric as { rating?: string }).rating,
    id: metric.id,
    navigationType: (metric as { navigationType?: string }).navigationType,
    path: templatePath(landingPath ?? window.location.pathname),
    t: Date.now(),
    // metric.entries deliberately dropped: PerformanceEntry[] — large, DOM node refs.
  })
  if (v) bufferVital(v)
}

/** Mounted once in the ROOT layout so anonymous marketing/discover/help traffic is
 *  covered too (the member-only trackers live in the (main) layout). Renders nothing,
 *  reads no cookies, keeps the root layout static. */
export function WebVitals() {
  const pathname = usePathname()
  const first = useRef(true)
  if (first.current) {
    landingPath = pathname
    first.current = false
  }

  useReportWebVitals(report)

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushVitals()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flushVitals)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flushVitals)
    }
  }, [])

  return null
}
