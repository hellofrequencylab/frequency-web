// Stateless beta double-opt-in confirm tokens.
//
// HMAC-signed email. The confirm link in the "confirm your spot" email carries
// `?e=<email>&t=<token>`; verifying proves we issued it, with no DB state to
// maintain. Mirrors lib/unsubscribe-tokens.ts.

import { createHmac, timingSafeEqual } from 'crypto'

function getSecret(): string {
  const explicit = process.env.BETA_CONFIRM_SECRET || process.env.UNSUBSCRIBE_SECRET
  if (explicit) return explicit
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32)
  if (!fallback) {
    throw new Error('[beta-tokens] No BETA_CONFIRM_SECRET / UNSUBSCRIBE_SECRET / service-role key to sign with.')
  }
  return fallback
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function makeBetaToken(email: string): string {
  const hmac = createHmac('sha256', getSecret())
  hmac.update(`beta-confirm:${normalizeEmail(email)}`)
  return hmac.digest('hex').slice(0, 32)
}

export function verifyBetaToken(email: string, token: string): boolean {
  if (!token || token.length !== 32) return false
  const expected = makeBetaToken(email)
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'))
  } catch {
    return false
  }
}

export function buildBetaConfirmUrl(baseUrl: string, email: string): string {
  const e = normalizeEmail(email)
  const token = makeBetaToken(e)
  return `${baseUrl.replace(/\/$/, '')}/beta/confirm?e=${encodeURIComponent(e)}&t=${token}`
}
