/**
 * Placement resolution for a Hunt scan (FH-014). Pure: no database, no Next, no network. The route
 * loads the placement row and calls these; they decide what the request may do.
 *
 * Rules, each pinned by placement.test.ts:
 * - A GET never credits progress. It resolves to a landing, a redirect or a refusal, never a claim.
 * - A crawler or link-preview bot gets the public landing with no proof token and no claim path.
 * - A request on the wrong host is redirected to the canonical host with the same path, never served.
 * - A revoked placement refuses, so a pulled sign stops granting.
 * - A continuation target after sign-in must be a same-site relative path.
 * - A claim proof token is bound to one run and one placement, so a token from another run cannot claim.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

type Placement = { id: string; huntId: string; revokedAt: string | null }

type Resolution =
  | { kind: 'landing'; placementId: string; huntId: string; canClaim: true }
  | { kind: 'landing_public'; placementId: string; huntId: string; canClaim: false }
  | { kind: 'redirect'; to: string }
  | { kind: 'refuse'; reason: 'revoked' | 'not_found' }

const CRAWLER = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|linkedin|pinterest|headless|lighthouse/i

export const isCrawler = (userAgent: string | null | undefined): boolean => !userAgent || CRAWLER.test(userAgent)

/**
 * What a scan request resolves to. `path` is the request path and query, starting with `/`.
 * A refusal does not reveal whether a placement ever existed beyond revoked or not found.
 */
export function resolvePlacement(input: {
  placement: Placement | null
  canonicalHost: string
  requestHost: string
  path: string
  userAgent: string | null | undefined
}): Resolution {
  const { placement } = input
  if (!placement) return { kind: 'refuse', reason: 'not_found' }
  if (placement.revokedAt) return { kind: 'refuse', reason: 'revoked' }

  if (input.requestHost.toLowerCase() !== input.canonicalHost.toLowerCase()) {
    const safe = safeContinuation(input.path) ?? '/'
    return { kind: 'redirect', to: `https://${input.canonicalHost}${safe}` }
  }
  if (isCrawler(input.userAgent)) {
    return { kind: 'landing_public', placementId: placement.id, huntId: placement.huntId, canClaim: false }
  }
  return { kind: 'landing', placementId: placement.id, huntId: placement.huntId, canClaim: true }
}

/**
 * A continuation target (where to go after sign-in) is only ever a same-site path. Anything with a
 * scheme, a host, a protocol-relative `//`, a backslash or a control character is dropped.
 */
export function safeContinuation(next: string | null | undefined): string | null {
  if (!next || next[0] !== '/') return null
  if (next[1] === '/' || next[1] === '\\' || next.includes('\\')) return null
  if (/[\u0000-\u001f\u007f]/.test(next)) return null
  return next
}

type ClaimScope = { runId: string; placementId: string }

const sign = (secret: string, body: string): string => createHmac('sha256', secret).update(body).digest('base64url')

/** A short-lived token the landing hands the signed-in player, bound to their run and this placement. `now` is epoch seconds. */
export function issueClaimToken(input: { secret: string; scope: ClaimScope; now: number; ttlSeconds?: number }): string {
  const body = Buffer.from(JSON.stringify({ r: input.scope.runId, p: input.scope.placementId, exp: input.now + (input.ttlSeconds ?? 600) })).toString('base64url')
  return `${body}.${sign(input.secret, body)}`
}

/** True only for an unexpired token whose run and placement both match. */
export function verifyClaimToken(input: { secret: string; token: string; now: number; expected: ClaimScope }): boolean {
  const [body, sig, extra] = input.token.split('.')
  if (!body || !sig || extra !== undefined) return false
  const want = Buffer.from(sign(input.secret, body))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { r?: unknown; p?: unknown; exp?: unknown }
    return p.r === input.expected.runId && p.p === input.expected.placementId && typeof p.exp === 'number' && input.now < p.exp
  } catch {
    return false
  }
}
