'use client'

import { useEffect } from 'react'
import { ANALYTICS_OPTOUT_COOKIE, CONSENT_MAX_AGE } from '@/lib/consent/cookie-consent'
import { updateBrowserAnalyticsPolicy } from '@/lib/analytics/browser-policy'

// Render this ONLY for a staff / operator viewer (the (main) layout gates it on isStaff). On mount it:
//   1. persists `freq-ga-optout=1` in localStorage, so the GA head snippet (components/analytics/
//      google-analytics) flips GA's kill switch on EVERY future load before the first page_view fires;
//   2. flips `window['ga-disable-<ID>']=true` immediately, so the CURRENT session stops sending hits
//      the moment an operator is recognized (no need to wait for the next navigation).
// Browser-scoped by design: once an operator has opened the app here, this browser stays out of the
// analytics reports. Never rendered for members or visitors, so their tracking is untouched.
export function GaStaffOptOut() {
  useEffect(() => {
    updateBrowserAnalyticsPolicy(false)
    // A suppression-only cookie lets server request mirrors honor a persisted browser opt-out.
    try {
      const secure = location.protocol === 'https:' ? '; secure' : ''
      document.cookie = `${ANALYTICS_OPTOUT_COOKIE}=1; path=/; max-age=${CONSENT_MAX_AGE}; samesite=lax${secure}`
    } catch { /* request policy and current-tab invalidation remain authoritative */ }
    try {
      window.localStorage.setItem('freq-ga-optout', '1')
      const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
      if (id) (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = true
    } catch {
      /* current-tab invalidation already happened; persistence is best-effort */
    }
  }, [])
  return null
}
