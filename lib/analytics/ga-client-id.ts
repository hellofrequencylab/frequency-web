// The GA4 Measurement Protocol client_id, carried across the Stripe boundary.
//
// LIVE-348: sendGa4Event used to set client_id from the actor's profile id. A profile id is
// not a GA client id, so a server-side purchase would not join the browser session that
// produced it — every sale would look like a brand-new user with no source or medium.
// The _ga cookie is read when checkout starts and stamped on the Checkout Session as
// `ga_client_id`. The webhook reads it back and hands it to sendGa4Event.
//
// Best-effort: a missing cookie, a request with no cookie jar (tests, cron), or a cookie
// we cannot parse all return {}. Checkout still starts.

import { cookies } from 'next/headers'
import { currentViewerAllowsAnalytics } from './audience'
import { analyticsAllowed, parseConsentChoice, CONSENT_COOKIE, CONSENT_REGION_COOKIE, ANALYTICS_OPTOUT_COOKIE } from '@/lib/consent/cookie-consent'

/** Stripe metadata key. Session-level; the webhook is what reads it. */
export const GA_CLIENT_ID_META = 'ga_client_id'

/**
 * Parse a `_ga` cookie into the Measurement Protocol client_id.
 *
 * Cookie shape is `GA1.1.XXXXXXXX.YYYYYYYYYY` (or `GA1.2.…`). The client_id is the last
 * two dotted numbers. Anything else is refused rather than guessed.
 */
export function parseGaClientId(raw: string | undefined | null): string | null {
  if (!raw) return null
  const parts = raw.trim().split('.')
  if (parts.length < 4) return null
  const id = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
  if (!/^\d+\.\d+$/.test(id)) return null
  return id
}

/**
 * Parse the GA4 session id out of the `_ga_<container>` cookie. Shape (GS1): `GS1.1.<session_id>.<n>...`,
 * and (GS2): `GS2.1.s<session_id>$o1$g1...`. Anything else is refused. A server-side event that
 * carries this session_id joins the browser session that carried the ad click.
 */
export function parseGaSessionId(raw: string | undefined | null): string | null {
  if (!raw) return null
  const gs1 = /^GS1\.\d+\.(\d{8,})\./.exec(raw.trim())
  if (gs1) return gs1[1]
  const gs2 = /^GS2\.\d+\.s(\d{8,})(?:\$|$)/.exec(raw.trim())
  return gs2 ? gs2[1] : null
}

/**
 * The browser's GA identity (client_id + session_id) from the current request's cookies, or null
 * when there is no readable `_ga` cookie. No cookie means the visitor never loaded the tag
 * (declined or never asked), and then there is nothing to attribute.
 */
export async function readGaIdentity(): Promise<{ clientId: string; sessionId: string | null } | null> {
  try {
    const jar = await cookies()
    if (!analyticsAllowed({ choice: parseConsentChoice(jar.get(CONSENT_COOKIE)?.value), priorConsentRegion: jar.get(CONSENT_REGION_COOKIE)?.value === '1' })) return null
    if (jar.get(ANALYTICS_OPTOUT_COOKIE)?.value === '1' || !(await currentViewerAllowsAnalytics())) return null
    const clientId = parseGaClientId(jar.get('_ga')?.value)
    if (!clientId) return null
    const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
    const sessionCookie = gaId ? jar.get(`_ga_${gaId.replace(/^G-/, '')}`)?.value : undefined
    return { clientId, sessionId: parseGaSessionId(sessionCookie) }
  } catch {
    return null
  }
}

/** Session metadata fragment. Empty when there is no readable `_ga` cookie. */
export async function checkoutGaMetadata(): Promise<Record<string, string>> {
  const identity = await readGaIdentity()
  return identity ? { [GA_CLIENT_ID_META]: identity.clientId } : {}
}
