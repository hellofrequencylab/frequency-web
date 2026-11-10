/**
 * Staff proof for a Hunt placement (FH-020): an expiring, single-use challenge that a venue's staff
 * confirm in person. Pure apart from the injected `consumeNonce`, which is the one place state lives
 * (a unique insert in the real store). Nothing here writes a claim; a verified proof is evidence that
 * the claim command (hunt_claim_apply) can take at assurance `staff`.
 *
 * Rules, each pinned by staff-proof.test.ts:
 * - A challenge is bound to one Hunt, one placement, one venue Space and one run, and expires.
 * - Staff are scoped to the venue Spaces they hold; staff of another Space are refused.
 * - A paused or revoked placement rejects.
 * - A challenge is single use: the second presentation is a replay.
 * - A refusal never burns the nonce, so a rightly-scoped retry still works once the cause is fixed.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const VERSION = 'v1'
const DEFAULT_TTL_SECONDS = 120

type Scope = { huntId: string; placementId: string; venueSpaceId: string; runId: string }

type Payload = { h: string; p: string; v: string; r: string; iat: number; exp: number; n: string }

const sign = (secret: string, body: string): string => createHmac('sha256', secret).update(body).digest('base64url')

/** A challenge token the player shows at the venue. `now` is epoch seconds. */
export function issueChallenge(input: { secret: string; scope: Scope; now: number; ttlSeconds?: number }): string {
  const payload: Payload = {
    h: input.scope.huntId,
    p: input.scope.placementId,
    v: input.scope.venueSpaceId,
    r: input.scope.runId,
    iat: input.now,
    exp: input.now + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS),
    n: randomBytes(16).toString('base64url'),
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${VERSION}.${body}.${sign(input.secret, `${VERSION}.${body}`)}`
}

/** The expiry (epoch seconds) a challenge token claims, or null when it does not parse. Unverified: only for storing alongside a spent nonce, after verifyStaffProof has accepted the token. */
export function challengeExpiry(token: string): number | null {
  return parse(token)?.payload.exp ?? null
}

type Refusal = 'malformed' | 'bad_signature' | 'expired' | 'wrong_scope' | 'cross_space_staff' | 'placement_paused' | 'replay'

type Verdict = { ok: true; nonce: string; venueSpaceId: string } | { ok: false; reason: Refusal }

function parse(token: string): { body: string; sig: string; payload: Payload } | null {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Payload
    const ok =
      typeof payload.h === 'string' && typeof payload.p === 'string' && typeof payload.v === 'string' && typeof payload.r === 'string' &&
      typeof payload.n === 'string' && Number.isFinite(payload.iat) && Number.isFinite(payload.exp)
    return ok ? { body: `${parts[0]}.${parts[1]}`, sig: parts[2], payload } : null
  } catch {
    return null
  }
}

/**
 * Check a token a staff member scanned. `staffVenueSpaceIds` are the venue Spaces this staff member holds
 * right now (loaded fresh by the caller). `consumeNonce` must resolve true exactly once per nonce.
 */
export async function verifyStaffProof(input: {
  secret: string
  token: string
  now: number
  expected: Scope
  staffVenueSpaceIds: readonly string[]
  placementActive: boolean
  consumeNonce: (nonce: string) => Promise<boolean>
}): Promise<Verdict> {
  const parsed = parse(input.token)
  if (!parsed) return { ok: false, reason: 'malformed' }

  const want = Buffer.from(sign(input.secret, parsed.body))
  const got = Buffer.from(parsed.sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'bad_signature' }

  const p = parsed.payload
  if (input.now >= p.exp || input.now < p.iat) return { ok: false, reason: 'expired' }

  const e = input.expected
  if (p.h !== e.huntId || p.p !== e.placementId || p.v !== e.venueSpaceId || p.r !== e.runId) return { ok: false, reason: 'wrong_scope' }
  if (!input.staffVenueSpaceIds.includes(p.v)) return { ok: false, reason: 'cross_space_staff' }
  if (!input.placementActive) return { ok: false, reason: 'placement_paused' }

  if (!(await input.consumeNonce(p.n))) return { ok: false, reason: 'replay' }
  return { ok: true, nonce: p.n, venueSpaceId: p.v }
}
