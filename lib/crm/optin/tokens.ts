// Stateless double-opt-in confirm tokens for the inbound subscription funnel.
//
// HMAC-signed (email, expiry) pairs. The confirm link carries `?e=<email>&x=<exp>&t=<token>`;
// verifying proves we issued it, with NO DB row to maintain (mirrors lib/beta-tokens.ts and
// lib/unsubscribe-tokens.ts). A distinct namespace (`optin-confirm:`) means a beta token can
// never confirm a subscription and vice versa. Unlike the beta token this one carries an
// expiry, so a permission-request link goes stale on its own (defence in depth for a link
// that flips marketing consent).

import { createHmac, timingSafeEqual } from 'crypto'

/** Default lifetime of a confirm link. Long enough for a real inbox, short enough that a
 *  leaked/forwarded link does not confirm someone months later. */
export const OPTIN_TOKEN_TTL_DAYS = 14

function getSecret(): string {
  const explicit = process.env.OPTIN_CONFIRM_SECRET || process.env.BETA_CONFIRM_SECRET || process.env.UNSUBSCRIBE_SECRET
  if (explicit) return explicit
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32)
  if (!fallback) {
    throw new Error('[optin-tokens] No OPTIN_CONFIRM_SECRET / BETA_CONFIRM_SECRET / UNSUBSCRIBE_SECRET / service-role key to sign with.')
  }
  return fallback
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** PURE: the signed tag over (email, exp). 32 hex chars (first half of SHA-256) is plenty. */
export function makeOptinToken(email: string, exp: number): string {
  const hmac = createHmac('sha256', getSecret())
  hmac.update(`optin-confirm:${normalizeEmail(email)}:${exp}`)
  return hmac.digest('hex').slice(0, 32)
}

/** Verify a confirm token: the signature must match AND the expiry must be in the future.
 *  Constant-time compare; fail-closed on a bad length, non-numeric expiry, or mismatch. */
export function verifyOptinToken(email: string, exp: number, token: string, now: number = Date.now()): boolean {
  if (!token || token.length !== 32) return false
  if (!Number.isFinite(exp) || exp <= 0) return false
  if (exp * 1000 < now) return false // expired
  const expected = makeOptinToken(email, exp)
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'))
  } catch {
    return false
  }
}

/** Build the confirm URL carried in the transactional confirm email. */
export function buildOptinConfirmUrl(baseUrl: string, email: string, ttlDays: number = OPTIN_TOKEN_TTL_DAYS): string {
  const e = normalizeEmail(email)
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60
  const token = makeOptinToken(e, exp)
  return `${baseUrl.replace(/\/$/, '')}/subscribe/confirm?e=${encodeURIComponent(e)}&x=${exp}&t=${token}`
}
