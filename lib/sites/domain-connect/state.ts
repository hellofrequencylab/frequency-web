// THE DOMAIN CONNECT RETURN STATE (LIVE-780). The `state` Frequency puts on an apply URL and the
// provider hands back to the return route. It is an HMAC-signed envelope carrying the Space slug, so
// the return route only ever redirects to that Space's own Profile & Settings on Frequency's origin:
// an unsigned, tampered or stale state goes nowhere useful, which keeps the route from being used as
// an open redirect. No DB or cookie needed.
//
// PURE except for reading the signing secret from env at call time, so it is unit-testable alone.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** Signing in at a DNS provider and approving can take a while; an hour is plenty. */
const MAX_AGE_MS = 60 * 60 * 1000
const CLOCK_SKEW_MS = 60 * 1000
/** Keeps a state minted here from verifying anywhere else that shares the secret. */
const PURPOSE = 'domain-connect-return'
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/i

interface StatePayload {
  s: string
  iat: number
  n: string
}

/** The HMAC key: a purpose-built secret if set, else the existing server signing secrets. Empty when
 *  none is set, and then no state is minted (one-click reports unavailable). */
function secret(): string {
  return (
    process.env.DOMAIN_CONNECT_STATE_SECRET?.trim() ||
    process.env.OAUTH_STATE_SECRET?.trim() ||
    process.env.UNSUBSCRIBE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ''
  )
}

function mac(key: string, body: string): string {
  return createHmac('sha256', key).update(`${PURPOSE}.${body}`).digest('base64url')
}

/** Mint a signed state for `slug`, or null when there is no secret or the slug is not a slug. */
export function signDomainConnectState(slug: string, now: number = Date.now()): string | null {
  const key = secret()
  if (!key || !SLUG.test(slug)) return null
  const payload: StatePayload = { s: slug, iat: now, n: randomBytes(9).toString('base64url') }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${mac(key, body)}`
}

/** Read a returned state: the slug it was minted for, or null when it is missing, malformed,
 *  tampered with, from the future or stale. Constant-time compare; fails closed. */
export function readDomainConnectState(state: string | null | undefined, now: number = Date.now()): string | null {
  const key = secret()
  if (!key || !state || typeof state !== 'string' || state.length > 1024) return null
  const dot = state.indexOf('.')
  if (dot <= 0 || dot === state.length - 1) return null
  const body = state.slice(0, dot)
  const a = Buffer.from(state.slice(dot + 1))
  const b = Buffer.from(mac(key, body))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let payload: StatePayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload
  } catch {
    return null
  }
  if (!payload || typeof payload.s !== 'string' || typeof payload.iat !== 'number') return null
  if (!SLUG.test(payload.s)) return null
  if (payload.iat > now + CLOCK_SKEW_MS || now - payload.iat > MAX_AGE_MS) return null
  return payload.s
}

/** Where the return route lands the owner: their Space's Profile & Settings, where the Domain section
 *  re-checks on its own. A path on Frequency's origin, never a full URL. */
export function domainConnectReturnPath(slug: string): string {
  return `/spaces/${encodeURIComponent(slug)}/manage?section=settings`
}
