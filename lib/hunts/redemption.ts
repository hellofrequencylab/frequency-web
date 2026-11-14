/**
 * The merchant redemption station (FH-022): the player's one-use grant token, the staff decision and
 * the calls that hand a reward over or void it. The database guarantees ONCE (hunt_reward_redeem locks
 * the grant row: two terminals, one winner); this file decides WHO (lib/hunts/authz.ts decide), what the
 * station may SHOW, and what a person reads for each answer.
 *
 * What the station shows is issuer data only: the reward and Trail the merchant published and the
 * grant's state. It never carries the player's name, handle, email or run, so a terminal learns nothing
 * about a person it did not need to.
 *
 * Everything here takes its IO as an argument, so a route passes its own service-role client and this
 * module imports no admin client. Dark behind HUNTS_REWARDS_ENABLED (see lib/hunts/flags.ts).
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { decide, type Actor, type HuntFacts, type PartnerRow, type RoleGrant } from './authz'

const VERSION = 'g1'
const DEFAULT_TTL_SECONDS = 600

type Payload = { g: string; iat: number; exp: number }

const sign = (secret: string, body: string): string => createHmac('sha256', secret).update(body).digest('base64url')

/** The token a player shows at the station for one grant. `now` is epoch seconds. A short life: reissue it from the player's own screen. */
export function issueRedeemToken(input: { secret: string; grantId: string; now: number; ttlSeconds?: number }): { token: string; expiresAtEpoch: number } {
  const payload: Payload = { g: input.grantId, iat: input.now, exp: input.now + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS) }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return { token: `${VERSION}.${body}.${sign(input.secret, `${VERSION}.${body}`)}`, expiresAtEpoch: payload.exp }
}

type TokenRefusal = 'malformed' | 'bad_signature' | 'expired'

export function readRedeemToken(secret: string, token: string, now: number): { ok: true; grantId: string } | { ok: false; reason: TokenRefusal } {
  const parts = token.trim().split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: 'malformed' }
  let payload: Payload
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Payload
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (typeof payload.g !== 'string' || !Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) return { ok: false, reason: 'malformed' }
  const want = Buffer.from(sign(secret, `${parts[0]}.${parts[1]}`))
  const got = Buffer.from(parts[2])
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'bad_signature' }
  if (payload.exp <= now) return { ok: false, reason: 'expired' }
  return { ok: true, grantId: payload.g }
}

// ── The decision ─────────────────────────────────────────────────────────────────────────────────

/** Facts the caller read this request, never cached, so a revoked staff member stops working at once. */
export type StationFacts = {
  hunt: HuntFacts
  grants: RoleGrant[]
  partners: PartnerRow[]
  actor: Actor
  /** The venue Space the staff member acts for here, or null when they act through a Hunt role. */
  venueSpaceId: string | null
  /** The venue Spaces the staff member holds right now. */
  staffVenueSpaceIds: readonly string[]
}

/** May this person hand over (or void) a reward of this Hunt? Role holders may; so may current staff of an accepted partner venue. */
export function mayRedeem(facts: StationFacts, targetHuntId: string, nowEpoch: number): boolean {
  const verdict = decide('redeem_reward', {
    hunt: facts.hunt,
    grants: facts.grants,
    partners: facts.partners,
    actor: { ...facts.actor, staffSpaceIds: [...facts.staffVenueSpaceIds] },
    ctx: { venueSpaceId: facts.venueSpaceId, targetHuntId },
    now: new Date(nowEpoch * 1000).toISOString(),
  })
  return verdict.allow
}

// ── What the station shows ───────────────────────────────────────────────────────────────────────

type GrantState = 'granted' | 'redeemed' | 'revoked' | 'expired'

/** The only shape a station terminal receives. Issuer data and state; nothing about the player. */
type StationView = {
  grantId: string
  rewardTitle: string
  rewardKind: string
  trailTitle: string
  state: GrantState
  /** True only while the grant can still be handed over. */
  redeemable: boolean
}

export function stationView(row: {
  id: string
  state: string
  expires_at: string | null
  reward_title: string
  reward_kind: string
  trail_title: string
}, nowEpoch: number): StationView {
  const lapsed = row.expires_at !== null && Date.parse(row.expires_at) <= nowEpoch * 1000
  const state: GrantState = row.state === 'redeemed' || row.state === 'revoked' || row.state === 'expired' ? row.state : lapsed ? 'expired' : 'granted'
  return {
    grantId: row.id,
    rewardTitle: row.reward_title,
    rewardKind: row.reward_kind,
    trailTitle: row.trail_title,
    state,
    redeemable: state === 'granted',
  }
}

// ── Redeem and void ──────────────────────────────────────────────────────────────────────────────

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>

const REDEEM_RESULTS = ['redeemed', 'already_redeemed', 'revoked', 'expired', 'hunt_not_live', 'grant_not_found', 'key_conflict'] as const
type RedeemResult = (typeof REDEEM_RESULTS)[number]

const VOID_RESULTS = ['voided', 'already_voided', 'already_redeemed', 'reason_required', 'grant_not_found', 'key_conflict'] as const
type VoidResult = (typeof VOID_RESULTS)[number]

/** Hash of everything that defines the request except the key, so a reused key for another request is a conflict. */
export function redeemRequestHash(input: { staffId: string; grantId: string; venueSpaceId: string | null }): string {
  return createHash('sha256').update(JSON.stringify(['redeem', input.staffId, input.grantId, input.venueSpaceId])).digest('hex')
}

export function voidRequestHash(input: { actorId: string; grantId: string; reason: string }): string {
  return createHash('sha256').update(JSON.stringify(['void', input.actorId, input.grantId, input.reason.trim()])).digest('hex')
}

export async function redeemGrant(
  rpc: Rpc,
  input: { staffId: string; grantId: string; venueSpaceId: string | null; idempotencyKey: string },
): Promise<{ result: RedeemResult; replayed: boolean }> {
  const { data, error } = await rpc('hunt_reward_redeem', {
    p_staff: input.staffId,
    p_grant_id: input.grantId,
    p_venue_space_id: input.venueSpaceId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: redeemRequestHash(input),
  })
  if (error) throw new Error(`hunt_reward_redeem failed: ${error.message}`)
  const a = data as { result?: string; replayed?: boolean } | null
  const result = REDEEM_RESULTS.find((r) => r === a?.result)
  if (!result) throw new Error('hunt_reward_redeem returned an answer this build does not know')
  return { result, replayed: a?.replayed === true }
}

export async function voidGrant(
  rpc: Rpc,
  input: { actorId: string; grantId: string; reason: string; idempotencyKey: string },
): Promise<{ result: VoidResult; replayed: boolean }> {
  const { data, error } = await rpc('hunt_reward_void', {
    p_actor: input.actorId,
    p_grant_id: input.grantId,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: voidRequestHash(input),
  })
  if (error) throw new Error(`hunt_reward_void failed: ${error.message}`)
  const a = data as { result?: string; replayed?: boolean } | null
  const result = VOID_RESULTS.find((r) => r === a?.result)
  if (!result) throw new Error('hunt_reward_void returned an answer this build does not know')
  return { result, replayed: a?.replayed === true }
}

/** What a person at the terminal reads for each answer. */
export function redeemMessage(result: RedeemResult | VoidResult): string {
  switch (result) {
    case 'redeemed':
      return 'Handed over. This one is used.'
    case 'voided':
      return 'Cancelled. This one can no longer be used.'
    case 'already_redeemed':
      return 'Already used. Do not hand over another.'
    case 'already_voided':
    case 'revoked':
      return 'This one was cancelled. Do not hand it over.'
    case 'expired':
      return 'This one has expired.'
    case 'hunt_not_live':
      return 'This Trail is not running right now.'
    case 'reason_required':
      return 'Write a short reason first.'
    case 'key_conflict':
      return 'That tap was already used. Try again.'
    default:
      return 'We could not find that reward.'
  }
}
