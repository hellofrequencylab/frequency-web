// Server-side GA4 mirror via the Measurement Protocol (ADR-070/093). The client
// mirrors events through gtag (trackClient); this is the server half, so events
// recorded server-side — QR scans that redirect off-site, referral attribution at
// onboarding, gift-a-zap — also reach GA4. Best-effort and inert unless configured.
//
// Inert unless BOTH ids are set AND NODE_ENV==='production' — matching the client
// tag, so preview/dev traffic never hits the property.
// 2026-09-05 (scan2 L3-03): NODE_ENV is 'production' on every Vercel build, previews included, so
// that gate let preview deploys and the e2e workflow's synthetic traffic into the GA4 property.
// The gate is now VERCEL_ENV === 'production', with NODE_ENV consulted only when VERCEL_ENV is
// unset (local / non-Vercel). Same rule as the client tag and lib/rate-limit.ts.

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
const GA_SECRET = process.env.GA_API_SECRET

/** The deployment we are running in: Vercel's VERCEL_ENV when present, NODE_ENV otherwise. */
function deployEnv(): string | undefined {
  return process.env.VERCEL_ENV || process.env.NODE_ENV
}

export function gaServerEnabled(): boolean {
  return !!(GA_ID && GA_SECRET && deployEnv() === 'production')
}

/** GA4 event names must be snake_case — our taxonomy uses dots (qr.scanned). */
export function gaEventName(event: string): string {
  return event.replace(/\./g, '_')
}

/**
 * Fire one event to GA4 over the Measurement Protocol. `actorProfileId`, when
 * present, becomes both the client_id (so events group) and user_id (cross-device).
 * Never throws; returns immediately when GA isn't configured.
 */
export async function sendGa4Event(
  name: string,
  params: Record<string, string | number | boolean> = {},
  actorProfileId?: string | null,
): Promise<void> {
  if (!gaServerEnabled()) return
  const clientId = actorProfileId || globalThis.crypto.randomUUID()
  const body: Record<string, unknown> = {
    client_id: clientId,
    non_personalized_ads: true,
    events: [{ name: gaEventName(name), params }],
  }
  if (actorProfileId) body.user_id = actorProfileId

  try {
    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA_ID}&api_secret=${GA_SECRET}`,
      { method: 'POST', body: JSON.stringify(body), keepalive: true },
    )
  } catch {
    /* analytics must never break a request */
  }
}
