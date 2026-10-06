'use client'

// Vercel Web Analytics with the pixel-safety rule applied (LIVE-810, ADR-1720). The page view
// URL passes through pixelSafePath, so a Journey, Circle or topic slug never reaches Vercel.
// A client wrapper because beforeSend is a function, which a Server Component cannot pass.

import { Analytics } from '@vercel/analytics/next'
import { pixelSafePath } from '@/lib/analytics/sanitize'

export function VercelAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        const m = /^(https?:\/\/[^/]+)(\/[^?#]*)?(.*)$/.exec(event.url)
        if (!m) return event
        return { ...event, url: m[1] + pixelSafePath(m[2] ?? "/") + m[3] }
      }}
    />
  )
}
