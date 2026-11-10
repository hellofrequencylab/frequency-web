/**
 * The stateful half of Hunt staff proof (FH-020S). lib/hunts/staff-proof.ts decides whether a
 * scanned challenge is good; this file turns a good one into a credit, and runs the held-claim review
 * and the appeal. The database guarantees ONCE (supabase/migrations/20270346038000_hunt_staff_review.sql:
 * a unique nonce insert, a claim and run lock); this file decides WHO, through lib/hunts/authz.ts, with
 * facts the caller loaded fresh for this request.
 *
 * Everything here takes its IO as an argument, so a route passes its own service-role client and this
 * module imports no admin client.
 */
import { createHash } from 'node:crypto'
import { decide, type Actor, type HuntFacts, type PartnerRow, type RoleGrant } from './authz'
import { applyClaim } from './apply-claim'
import { challengeExpiry, verifyStaffProof } from './staff-proof'

type RpcResult = PromiseLike<{ data: unknown; error: { message: string } | null }>
type Rpc = (fn: string, args: Record<string, unknown>) => RpcResult

// ── The nonce ────────────────────────────────────────────────────────────────────────────────────

type NonceScope = { huntId: string; placementId: string; venueSpaceId: string; runId: string }

/** Spend a challenge's nonce. True exactly once per nonce; the database is the arbiter. */
export async function spendNonce(rpc: Rpc, input: { nonce: string; scope: NonceScope; staffId: string; expiresAtEpoch: number }): Promise<boolean> {
  const { data, error } = await rpc('hunt_staff_nonce_consume', {
    p_nonce: input.nonce,
    p_hunt_id: input.scope.huntId,
    p_placement_id: input.scope.placementId,
    p_venue_space_id: input.scope.venueSpaceId,
    p_run_id: input.scope.runId,
    p_staff: input.staffId,
    p_expires_at: new Date(input.expiresAtEpoch * 1000).toISOString(),
  })
  if (error) throw new Error(`hunt_staff_nonce_consume failed: ${error.message}`)
  return data === true
}

// ── Verify at the door and credit ─────────────────────────────────────────────────────────────────

/** Facts the caller read this request, never cached, so a revoked staff member stops working at once. */
export type StaffFacts = {
  hunt: HuntFacts
  grants: RoleGrant[]
  partners: PartnerRow[]
  actor: Actor
  /** The venue Spaces the staff member holds right now. */
  staffVenueSpaceIds: readonly string[]
  placementActive: boolean
  /** Who the run belongs to, null when the run is not this Hunt's. */
  runSubjectId: string | null
}

type StaffVerifyInput = {
  staffId: string
  token: string
  scope: NonceScope
  missionKey: string
  nowEpoch: number
}

type StaffVerifyDeps = {
  secret: string
  rpc: Rpc
  loadFacts: () => Promise<StaffFacts | null>
}

type StaffVerifyResult =
  | { ok: true; claimId: string | undefined; replayed: boolean }
  | { ok: false; reason: string }

/**
 * Verify a scanned challenge and, when it holds, credit the player's mission at assurance `staff`.
 * Order matters: the role check (decide) runs before the proof so a non-staff caller learns nothing
 * about a token, and the nonce is spent only after every other check passed (verifyStaffProof).
 * The claim key is the nonce, so a retry of the same scan replays one answer.
 */
export async function verifyAtDoor(deps: StaffVerifyDeps, input: StaffVerifyInput): Promise<StaffVerifyResult> {
  const facts = await deps.loadFacts()
  if (!facts || !facts.runSubjectId) return { ok: false, reason: 'not_found' }

  const verdict = decide('verify_claim', {
    hunt: facts.hunt,
    grants: facts.grants,
    partners: facts.partners,
    actor: { ...facts.actor, staffSpaceIds: [...facts.staffVenueSpaceIds] },
    ctx: { venueSpaceId: input.scope.venueSpaceId, targetHuntId: input.scope.huntId },
    now: new Date(input.nowEpoch * 1000).toISOString(),
  })
  if (!verdict.allow) return { ok: false, reason: 'forbidden' }

  const proof = await verifyStaffProof({
    secret: deps.secret,
    token: input.token,
    now: input.nowEpoch,
    expected: input.scope,
    staffVenueSpaceIds: facts.staffVenueSpaceIds,
    placementActive: facts.placementActive,
    consumeNonce: (nonce) =>
      spendNonce(deps.rpc, { nonce, scope: input.scope, staffId: input.staffId, expiresAtEpoch: challengeExpiry(input.token) ?? input.nowEpoch }),
  })
  if (!proof.ok) return { ok: false, reason: proof.reason }

  const claim = await applyClaim((fn, args) => deps.rpc(fn, args), {
    actorId: facts.runSubjectId,
    runId: input.scope.runId,
    missionKey: input.missionKey,
    placementId: input.scope.placementId,
    evidenceId: `staff:${proof.nonce}`,
    assurance: 'staff',
    idempotencyKey: `staff-${proof.nonce}`,
  })
  if (claim.result !== 'credited') return { ok: false, reason: claim.result }
  return { ok: true, claimId: claim.claimId, replayed: claim.replayed }
}

// ── Held-claim review ─────────────────────────────────────────────────────────────────────────────

type ReviewDecision = 'approve' | 'reject' | 'override'

const REVIEW_RESULTS = ['credited', 'rejected', 'already_decided', 'already_credited', 'claim_not_found', 'run_not_active', 'key_conflict'] as const
type ReviewResult = (typeof REVIEW_RESULTS)[number]

export function reviewRequestHash(input: { claimId: string; reviewerId: string; decision: ReviewDecision; reason: string }): string {
  return createHash('sha256').update(JSON.stringify([input.claimId, input.reviewerId, input.decision, input.reason.trim()])).digest('hex')
}

/**
 * Decide a held claim. The caller has already authorised `review_claim` (decide) for this Hunt and
 * venue. An approval resumes the claim exactly once: a second approval, under any key, answers
 * `already_decided`. A rejection needs a reason; an override needs a written reason of ten characters
 * and is audited under its own action name.
 */
export async function reviewClaim(
  rpc: Rpc,
  input: { claimId: string; reviewerId: string; decision: ReviewDecision; reason: string; idempotencyKey: string },
): Promise<{ result: ReviewResult; replayed: boolean }> {
  const { data, error } = await rpc('hunt_claim_review', {
    p_claim_id: input.claimId,
    p_reviewer: input.reviewerId,
    p_decision: input.decision,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: reviewRequestHash(input),
  })
  if (error) throw new Error(`hunt_claim_review failed: ${error.message}`)
  const answer = data as { result?: string; replayed?: boolean } | null
  const result = REVIEW_RESULTS.find((r) => r === answer?.result)
  if (!result) throw new Error('hunt_claim_review returned an answer this build does not know')
  return { result, replayed: answer?.replayed === true }
}

// ── Appeal ────────────────────────────────────────────────────────────────────────────────────────

const APPEAL_RESULTS = ['opened', 'already_open', 'claim_not_found', 'not_rejected'] as const
type AppealResult = (typeof APPEAL_RESULTS)[number]

/** A player appeals their own rejected claim. One open appeal per claim; a second tap is `already_open`. */
export async function appealClaim(rpc: Rpc, input: { claimId: string; actorId: string; reason: string }): Promise<AppealResult> {
  const { data, error } = await rpc('hunt_claim_appeal', { p_claim_id: input.claimId, p_actor: input.actorId, p_reason: input.reason })
  if (error) throw new Error(`hunt_claim_appeal failed: ${error.message}`)
  const result = APPEAL_RESULTS.find((r) => r === (data as { result?: string } | null)?.result)
  if (!result) throw new Error('hunt_claim_appeal returned an answer this build does not know')
  return result
}
