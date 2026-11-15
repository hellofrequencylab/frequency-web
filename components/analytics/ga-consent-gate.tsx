'use client'

import { useEffect } from 'react'
import { updateBrowserAnalyticsPolicy } from '@/lib/analytics/browser-policy'

/** Keep an already mounted SPA in sync with account/staff changes, not just the first server paint. */
export function GaConsentGate({ disabled }: { disabled: boolean }) {
  useEffect(() => {
    if (disabled) updateBrowserAnalyticsPolicy(false)
    else if (window.__fqAnalyticsAllowed !== true) window.__fqGa?.()
  }, [disabled])
  return null
}
