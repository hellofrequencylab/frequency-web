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

/** Session metadata fragment. Empty when there is no readable `_ga` cookie. */
export async function checkoutGaMetadata(): Promise<Record<string, string>> {
  try {
    const jar = await cookies()
    const id = parseGaClientId(jar.get('_ga')?.value)
    return id ? { [GA_CLIENT_ID_META]: id } : {}
  } catch {
    return {}
  }
}
