// Stateless, CSRF-safe OAuth `state` for the Google import (ADR-374). No DB / cookie needed: the state
// is an HMAC-signed envelope binding the flow to the member who started it. On callback we re-resolve
// the session and require state.pid === current profile id, so an attacker cannot inject their own
// authorization code into a victim's session (the signature is unforgeable, and a state signed for a
// different pid is rejected). A 10-minute freshness window bounds replay.
//
// PURE except for reading the signing secret from env at call time (no Supabase/Next imports), so the
// sign/verify roundtrip is unit-testable in isolation.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const MAX_AGE_MS = 10 * 60 * 1000 // a started flow must complete within 10 minutes
const CLOCK_SKEW_MS = 60 * 1000 // tolerate a minute of forward skew

interface StatePayload {
  pid: string
  iat: number
  nonce: string
}

/** The HMAC key. Reuses an existing server secret so the import needs no new env var; falls back
 *  through purpose-built signing secrets to the always-present service-role key. Server-only. */
function secret(): string {
  return (
    process.env.OAUTH_STATE_SECRET?.trim() ||
    process.env.UNSUBSCRIBE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ''
  )
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url')
}

/** Mint a signed state token bound to the member's profile id. */
export function signState(pid: string): string {
  const payload: StatePayload = { pid, iat: Date.now(), nonce: randomBytes(9).toString('base64url') }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

/** Verify a returned state: valid signature, fresh, and bound to the expected profile id. Constant-time
 *  signature compare; fail-closed on any malformed input. */
export function verifyState(
  state: string | null | undefined,
  expectedPid: string,
  now: number = Date.now(),
): boolean {
  if (!state || typeof state !== 'string') return false
  const dot = state.indexOf('.')
  if (dot <= 0 || dot === state.length - 1) return false
  const body = state.slice(0, dot)
  const sig = state.slice(dot + 1)

  const expected = sign(body)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false

  let payload: StatePayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload
  } catch {
    return false
  }
  if (!payload || typeof payload.pid !== 'string' || typeof payload.iat !== 'number') return false
  if (payload.pid !== expectedPid) return false
  if (payload.iat > now + CLOCK_SKEW_MS) return false // minted in the "future" → reject
  if (now - payload.iat > MAX_AGE_MS) return false // stale
  return true
}
