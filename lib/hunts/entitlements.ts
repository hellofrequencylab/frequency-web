/**
 * Project Hunt benefits from settled tickets (FH-037, docs/hunts/PAID-TICKET-AUTHORITY.md).
 *
 * Canonical settlement establishes payment. This module turns a SETTLED, re-read ticket into one
 * benefit per eligible seat and benefit code, through the database's idempotent
 * `hunt_entitlement_project`. A Hunt claim never moves money or activates anything here.
 *
 * Pure planning first, then a thin caller over an injected RPC (like lib/hunts/apply-claim.ts), so this
 * file imports no admin client and every refusal is testable without a database.
 *
 *   - A webhook and a checkout return that race call the same plan and the same RPC; the unique
 *     (source, unit, benefit) key makes the second one a no-op.
 *   - A crash after settlement but before the projection is found by `findMissingIntents` and repaired.
 *   - A delayed checkout (status still pending) projects nothing and says "pending".
 *   - A guest seat projects as pending_claim until the existing verified-email claim names a profile.
 */
import { BENEFIT_CODE, type PassBinding } from './pass-binding'

export type TicketSource = Readonly<{
  kind: 'event-ticket'
  id: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  refundedAt: string | null
  disputeOpen: boolean
  eventId: string
  ticketTypeId: string | null
  sellerSpaceId: string
  currency: string
  qty: number
  /** One entry per seat 1..qty, resolved from canonical attendee and claim records. profileId is null until a verified claim. */
  seats: readonly Readonly<{ unit: string; profileId: string | null }>[]
}>

export type ProjectionUnit = Readonly<{
  huntId: string
  /** Exactly one of bindingId (a ticket pass) and offerId (a store item) is set. */
  bindingId: string | null
  offerId: string | null
  bindingRevision: number
  sourceType: 'event-ticket' | 'store-order'
  sourceId: string
  unitKey: string
  benefitCode: string
  sellerSpaceId: string
  profileId: string | null
  sourceSeq: number
  semanticKey: string
}>

type ProjectionPlan =
  | { ok: true; units: readonly ProjectionUnit[] }
  /** pending: wait and retry. refused: nothing to project and never will be. review: finance must look. */
  | { ok: false; disposition: 'pending' | 'refused' | 'review'; reason: string }

/** The canonical paid state projects at source version 1. A reversal is recorded by the database, not here. */
const PAID_SEQ = 1

/**
 * The key one benefit unit is known by, everywhere: the database's unique semantic key. Built from whole
 * ids, never truncated (outbox `semanticKey` caps a segment at 60 characters, which would fold two units
 * of one order line into the same key).
 */
export function unitSemanticKey(huntId: string, sourceId: string, unitKey: string, benefitCode: string): string {
  return ['entitlement', huntId, sourceId, unitKey, benefitCode].join(':')
}

export function seatUnit(index: number): string {
  return `seat-${index}`
}

/**
 * What may be projected from this source under this binding, from the source as re-read NOW. The
 * provider payload and return parameters are never inputs: only the canonical rows are.
 */
export function planTicketProjection(source: TicketSource, binding: PassBinding): ProjectionPlan {
  if (source.status === 'pending') return { ok: false, disposition: 'pending', reason: 'payment_not_settled' }
  if (source.status === 'failed') return { ok: false, disposition: 'refused', reason: 'payment_failed' }
  if (source.status === 'refunded' || source.refundedAt) return { ok: false, disposition: 'refused', reason: 'refunded' }
  if (source.disputeOpen) return { ok: false, disposition: 'review', reason: 'dispute_open' }
  if (source.status !== 'succeeded') return { ok: false, disposition: 'refused', reason: 'unknown_status' }

  // Everything below is a mismatch between the paid source and the frozen binding: refuse and surface it.
  if (source.eventId !== binding.eventId) return { ok: false, disposition: 'review', reason: 'event_mismatch' }
  if (source.ticketTypeId !== binding.ticketTypeId) return { ok: false, disposition: 'review', reason: 'tier_mismatch' }
  if (source.sellerSpaceId !== binding.sellerSpaceId) return { ok: false, disposition: 'review', reason: 'seller_mismatch' }
  if (!/^[a-z]{3}$/i.test(source.currency)) return { ok: false, disposition: 'review', reason: 'currency_unknown' }
  if (!Number.isInteger(source.qty) || source.qty < 1 || source.seats.length !== source.qty) {
    return { ok: false, disposition: 'review', reason: 'quantity_mismatch' }
  }
  if (binding.benefitCodes.some((c) => !BENEFIT_CODE.test(c))) return { ok: false, disposition: 'review', reason: 'bad_benefit_code' }

  const units: ProjectionUnit[] = []
  for (const seat of source.seats) {
    for (const code of binding.benefitCodes) {
      units.push({
        huntId: binding.huntId,
        bindingId: binding.id,
        offerId: null,
        bindingRevision: binding.revision,
        sourceType: 'event-ticket',
        sourceId: source.id,
        unitKey: seat.unit,
        benefitCode: code,
        sellerSpaceId: source.sellerSpaceId,
        profileId: seat.profileId,
        sourceSeq: PAID_SEQ,
        semanticKey: unitSemanticKey(binding.huntId, source.id, seat.unit, code),
      })
    }
  }
  return { ok: true, units }
}

export type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>

const PROJECT_RESULTS = ['created', 'exists', 'claimed', 'refused_revoked', 'stale', 'conflict'] as const
type ProjectResult = (typeof PROJECT_RESULTS)[number]

async function projectUnit(rpc: Rpc, u: ProjectionUnit): Promise<ProjectResult> {
  const { data, error } = await rpc('hunt_entitlement_project', {
    p_hunt_id: u.huntId,
    p_binding_id: u.bindingId,
    p_offer_id: u.offerId,
    p_binding_revision: u.bindingRevision,
    p_source_type: u.sourceType,
    p_source_id: u.sourceId,
    p_unit_key: u.unitKey,
    p_benefit_code: u.benefitCode,
    p_seller_space_id: u.sellerSpaceId,
    p_profile_id: u.profileId,
    p_source_seq: u.sourceSeq,
    p_semantic_key: u.semanticKey,
  })
  if (error) throw new Error(`hunt_entitlement_project failed: ${error.message}`)
  const result = PROJECT_RESULTS.find((r) => r === data)
  if (!result) throw new Error('hunt_entitlement_project returned an answer this build does not know')
  return result
}

export type ProjectionSummary = Record<ProjectResult, number>

/**
 * Project every unit of a plan. Each call is one atomic statement, so a crash part-way leaves a
 * prefix that the next attempt completes: re-running the whole plan is always safe.
 */
export async function projectPlan(rpc: Rpc, plan: ProjectionPlan): Promise<{ plan: ProjectionPlan; summary: ProjectionSummary }> {
  const summary: ProjectionSummary = { created: 0, exists: 0, claimed: 0, refused_revoked: 0, stale: 0, conflict: 0 }
  if (plan.ok) for (const u of plan.units) summary[await projectUnit(rpc, u)] += 1
  return { plan, summary }
}

/** A verified attendee claimed a paid guest seat. Activates that seat's pending benefits once. */
export async function attachAttendee(rpc: Rpc, sourceId: string, unitKey: string, profileId: string): Promise<number> {
  const { data, error } = await rpc('hunt_entitlement_attach', {
    p_source_type: 'event-ticket',
    p_source_id: sourceId,
    p_unit_key: unitKey,
    p_profile_id: profileId,
  })
  if (error) throw new Error(`hunt_entitlement_attach failed: ${error.message}`)
  return typeof data === 'number' ? data : 0
}

type ConsumeResult = 'consumed' | 'already_consumed' | 'not_found' | 'pending_claim' | 'suspended' | 'revoked'

/** Staff consumption, serialized with revocation by the database's row lock. Never opens stock. */
export async function consumeEntitlement(rpc: Rpc, entitlementId: string, actorProfileId: string, ref: string): Promise<ConsumeResult> {
  const { data, error } = await rpc('hunt_entitlement_consume', { p_entitlement_id: entitlementId, p_actor: actorProfileId, p_ref: ref })
  if (error) throw new Error(`hunt_entitlement_consume failed: ${error.message}`)
  const known: readonly ConsumeResult[] = ['consumed', 'already_consumed', 'not_found', 'pending_claim', 'suspended', 'revoked']
  const result = known.find((r) => r === data)
  if (!result) throw new Error('hunt_entitlement_consume returned an answer this build does not know')
  return result
}

/**
 * The repair scan: settled sources bound to an active binding that have no projected benefit yet.
 * Pure over what the loader read, so "settlement committed before the intent was written" is testable.
 */
export function findMissingIntents(
  settled: readonly Readonly<{ sourceId: string; ticketTypeId: string | null }>[],
  bindingsByTier: ReadonlyMap<string, PassBinding>,
  projectedSourceIds: ReadonlySet<string>,
): { sourceId: string; bindingId: string }[] {
  const out: { sourceId: string; bindingId: string }[] = []
  for (const s of settled) {
    if (!s.ticketTypeId || projectedSourceIds.has(s.sourceId)) continue
    const binding = bindingsByTier.get(s.ticketTypeId)
    if (binding) out.push({ sourceId: s.sourceId, bindingId: binding.id })
  }
  return out
}

/** Bounded retry for a pending or failed intent: 1m doubling to 6h, then it goes to review. */
export function intentRetryMinutes(attempts: number): number | null {
  if (attempts >= 12) return null
  return Math.min(360, 2 ** Math.max(attempts, 0))
}
