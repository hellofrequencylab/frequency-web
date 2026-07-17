'use client'

import { useEffect } from 'react'

// Render this ONLY for a staff / operator viewer (the (main) layout gates it on isStaff). On mount it:
//   1. persists `freq-ga-optout=1` in localStorage, so the GA head snippet (components/analytics/
//      google-analytics) flips GA's kill switch on EVERY future load before the first page_view fires;
//   2. flips `window['ga-disable-<ID>']=true` immediately, so the CURRENT session stops sending hits
//      the moment an operator is recognized (no need to wait for the next navigation).
// Browser-scoped by design: once an operator has opened the app here, this browser stays out of the
// analytics reports. Never rendered for members or visitors, so their tracking is untouched.
export function GaStaffOptOut() {
  useEffect(() => {
    try {
      window.localStorage.setItem('freq-ga-optout', '1')
      const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
      if (id) (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = true
    } catch {
      /* private-mode / storage-disabled browsers simply keep tracking; best-effort */
    }
  }, [])
  return null
}
