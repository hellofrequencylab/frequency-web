import 'server-only'

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { signingSecret } from '@/lib/signing-secret'

const TOKEN_TTL_MS = 10 * 60 * 1000
const CLOCK_SKEW_MS = 30 * 1000

export type SpaceCtaSurface = 'session' | 'ticket-reserve' | 'enroll' | 'donate'

interface SpaceCtaClickClaims {
  v: 1
  spaceId: string
  surface: SpaceCtaSurface
  nonce: string
  exp: number
}

function secret(): string {
  return signingSecret('space-cta-click', ['UNSUBSCRIBE_SECRET'])
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(`space-cta-click:v1:${body}`).digest('base64url')
}

/** Issue a short-lived, unforgeable receipt for a server-rendered public Space CTA.
 *  Missing signing configuration disables telemetry safely instead of breaking the page. */
export function createSpaceCtaClickToken(
  spaceId: string,
  surface: SpaceCtaSurface,
  now = Date.now(),
): string | null {
  if (!spaceId || !['session', 'ticket-reserve', 'enroll', 'donate'].includes(surface)) return null
  try {
    const claims: SpaceCtaClickClaims = { v: 1, spaceId, surface, nonce: randomUUID(), exp: now + TOKEN_TTL_MS }
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
    return `${body}.${sign(body)}`
  } catch {
    return null
  }
}

/** Verify signature, expiry, shape, and Space binding. The nonce becomes the ledger's idempotency key. */
export function verifySpaceCtaClickToken(
  token: string,
  expectedSpaceId: string,
  now = Date.now(),
): SpaceCtaClickClaims | null {
  if (typeof token !== 'string' || token.length > 1024 || !expectedSpaceId) return null
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  try {
    const provided = Buffer.from(signature)
    const expected = Buffer.from(sign(body))
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null

    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<SpaceCtaClickClaims>
    if (
      claims.v !== 1 ||
      claims.spaceId !== expectedSpaceId ||
      typeof claims.nonce !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(claims.nonce) ||
      typeof claims.exp !== 'number' ||
      claims.exp <= now ||
      claims.exp > now + TOKEN_TTL_MS + CLOCK_SKEW_MS ||
      !['session', 'ticket-reserve', 'enroll', 'donate'].includes(String(claims.surface))
    ) return null

    return claims as SpaceCtaClickClaims
  } catch {
    return null
  }
}
