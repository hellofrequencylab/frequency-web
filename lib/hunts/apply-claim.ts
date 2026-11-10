/**
 * The application side of the Hunt claim command (FH-010). The database does the work in one
 * transaction (supabase/migrations/20270346037000_hunt_claim_apply.sql, `hunt_claim_apply`); this file
 * holds the two things the caller computes around it: the request hash that makes an idempotency key
 * mean one payload, and the call itself with the answer narrowed to a known set.
 *
 * It takes the RPC caller as an argument so a route passes its own service-role client and this module
 * imports no admin client. A GET never reaches here: a scan opens a landing, and the credit is an
 * explicit signed-in POST that carries an idempotency key.
 */
import { createHash } from 'node:crypto'

type Assurance = 'none' | 'signed_node' | 'staff' | 'event_door'

type ClaimInput = {
  actorId: string
  runId: string
  missionKey: string
  placementId: string
  evidenceId: string
  assurance: Assurance
  idempotencyKey: string
}

/** Every answer the database gives. Anything else is a bug and throws rather than reading as success. */
const RESULTS = [
  'credited',
  'already_credited',
  'duplicate_evidence',
  'key_conflict',
  'run_not_found',
  'run_not_active',
  'hunt_not_live',
  'version_superseded',
  'outside_window',
  'mission_not_found',
  'mission_closed',
  'placement_not_valid',
  'assurance_too_low',
] as const

type ClaimResult = (typeof RESULTS)[number]

/** Hash of everything that defines the request except the key itself, so reusing a key for a different proof is a conflict. */
export function claimRequestHash(input: Omit<ClaimInput, 'idempotencyKey'>): string {
  const canonical = JSON.stringify([
    input.actorId,
    input.runId,
    input.missionKey,
    input.placementId,
    input.evidenceId,
    input.assurance,
  ])
  return createHash('sha256').update(canonical).digest('hex')
}

type Rpc = (fn: 'hunt_claim_apply', args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>

/** Credit one mission through one placement. Returns the database's answer; a transport or database error throws. */
export async function applyClaim(rpc: Rpc, input: ClaimInput): Promise<{ result: ClaimResult; claimId?: string; replayed: boolean }> {
  const { data, error } = await rpc('hunt_claim_apply', {
    p_actor: input.actorId,
    p_run_id: input.runId,
    p_mission_key: input.missionKey,
    p_placement_id: input.placementId,
    p_evidence_id: input.evidenceId,
    p_assurance: input.assurance,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: claimRequestHash(input),
  })
  if (error) throw new Error(`hunt_claim_apply failed: ${error.message}`)
  const answer = data as { result?: string; claim_id?: string; replayed?: boolean } | null
  const result = RESULTS.find((r) => r === answer?.result)
  if (!result) throw new Error('hunt_claim_apply returned an answer this build does not know')
  return { result, claimId: answer?.claim_id, replayed: answer?.replayed === true }
}
