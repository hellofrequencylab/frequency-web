// Client-side GA consent gate (ADR-069 × ADR-093). The acquisition tag loads
// site-wide for everyone (anonymous visitors carry no account, so the analytics
// scope doesn't apply to them). For a SIGNED-IN member who opted OUT of analytics,
// this sets GA's native opt-out flag — `window['ga-disable-<ID>'] = true` — which
// stops gtag from sending any further hits for them. Rendered by the authenticated
// app layout, which knows the member's consent.

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

export function GaConsentGate({ disabled }: { disabled: boolean }) {
  if (!GA_ID || !disabled) return null
  return (
    <script dangerouslySetInnerHTML={{ __html: `window['ga-disable-${GA_ID}']=true;` }} />
  )
}
