'use client'

import { useLayoutEffect } from 'react'
import { usePathname } from 'next/navigation'
import { applyGaAccountGate } from '@/lib/analytics/ga-account-gate'

// Client-side GA consent gate (ADR-069 × ADR-093). The acquisition tag loads
// site-wide for everyone (anonymous visitors carry no account, so the analytics
// scope doesn't apply to them). For a SIGNED-IN member who opted OUT of analytics,
// this sets GA's native opt-out flag — `window['ga-disable-<ID>'] = true` — which
// stops gtag from sending any further hits for them. Rendered by the authenticated
// app layout, which knows the member's consent.

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

export function GaConsentGate({ disabled }: { disabled: boolean }) {
  const pathname = usePathname()
  useLayoutEffect(() => { if (GA_ID) applyGaAccountGate(GA_ID, disabled) }, [disabled, pathname])
  if (!GA_ID) return null
  return (
    <script dangerouslySetInnerHTML={{ __html: `(${applyGaAccountGate.toString()})(${JSON.stringify(GA_ID)},${JSON.stringify(disabled)});` }} />
  )
}
