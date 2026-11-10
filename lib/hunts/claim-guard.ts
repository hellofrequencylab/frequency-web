/**
 * The decision half of the player's claim (FH-014S / FH-016S). Pure: no database, no Next. The store
 * (lib/hunts/claim-store.ts) loads the facts fresh for each request and this decides whether the signed-in
 * actor may call `hunt_claim_apply` for this placement, and with what input.
 *
 * Rules, each pinned by claim-guard.test.ts:
 * - The placement must exist and not be revoked, so a pulled sign stops granting.
 * - The run must belong to the signed-in actor and be active; a run id is not a secret.
 * - The run's Hunt must be the placement's Hunt, so a sign from another Hunt cannot credit this one.
 * - The claim token must be unexpired and bound to this run and this placement.
 * - The credit is at assurance `signed_node`. A mission that needs more is refused by the database as
 *   `assurance_too_low`, so a scan alone never satisfies a staff-verified mission.
 * Whether the mission is bound to the placement, and the Hunt's window and version, stay in the database.
 */
import { claimRequestHash, type ClaimInput } from './apply-claim'
import { verifyClaimToken } from './placement'

export type ScopeFacts = {
  placement: { id: string; huntId: string; revokedAt: string | null } | null
  run: { id: string; huntId: string; subjectProfileId: string; state: string } | null
}

export type ClaimRefusal = 'placement_not_found' | 'placement_revoked' | 'no_run' | 'run_not_active' | 'wrong_hunt' | 'bad_token'

type Authorized = { ok: true; input: ClaimInput; requestHash: string } | { ok: false; reason: ClaimRefusal }

/** The checks that need no token: who may claim on this placement, and through which run. */
export function checkScope(actorId: string, facts: ScopeFacts): { ok: true; runId: string; placementId: string } | { ok: false; reason: ClaimRefusal } {
  const { placement, run } = facts
  if (!placement) return { ok: false, reason: 'placement_not_found' }
  if (placement.revokedAt) return { ok: false, reason: 'placement_revoked' }
  if (!run || run.subjectProfileId !== actorId) return { ok: false, reason: 'no_run' }
  if (run.state !== 'active') return { ok: false, reason: 'run_not_active' }
  if (run.huntId !== placement.huntId) return { ok: false, reason: 'wrong_hunt' }
  return { ok: true, runId: run.id, placementId: placement.id }
}

export function authorizeClaim(input: {
  actorId: string
  facts: ScopeFacts
  token: string
  secret: string
  nowEpoch: number
  missionKey: string
  idempotencyKey: string
}): Authorized {
  const scope = checkScope(input.actorId, input.facts)
  if (!scope.ok) return scope
  const expected = { runId: scope.runId, placementId: scope.placementId }
  if (!verifyClaimToken({ secret: input.secret, token: input.token, now: input.nowEpoch, expected })) return { ok: false, reason: 'bad_token' }
  const claim: ClaimInput = {
    actorId: input.actorId,
    runId: scope.runId,
    missionKey: input.missionKey,
    placementId: scope.placementId,
    evidenceId: `node:${scope.placementId}`,
    assurance: 'signed_node',
    idempotencyKey: input.idempotencyKey,
  }
  return { ok: true, input: claim, requestHash: claimRequestHash(claim) }
}
