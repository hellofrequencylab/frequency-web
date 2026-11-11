/**
 * The player's server-side claim adapter (FH-014S / FH-016S). `hunt_claim_apply` is service role only,
 * so a scan landing or a player action cannot call it directly. These three functions are the only door:
 * each reads the placement and the signed-in actor's run fresh (nothing cached, so revoking a placement
 * stops the next scan), checks scope with lib/hunts/claim-guard.ts, and only then calls the database.
 * The caller passes the signed-in profile id from `getCallerProfile()`; it is never read from the request.
 *
 *   loadScanPlacement(placementId | { code }) the row `resolvePlacement` needs, plus the Hunt slug
 *   openClaim(actorId, placementId, nowEpoch)  the signed-in landing: the run and a claim token for it
 *   claimAsPlayer(actorId, input)              the POST: verifies the token, scope, switch, then credits
 *
 * Dark: both openClaim and claimAsPlayer answer `disabled` until HUNTS_CLAIMS_ENABLED (which needs
 * HUNTS_ENABLED) is on. A GET never reaches claimAsPlayer.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { signingSecret } from '@/lib/signing-secret'
import { applyClaim } from './apply-claim'
import { authorizeClaim, checkScope, type ClaimRefusal, type ScopeFacts } from './claim-guard'
import { huntSwitchOn } from './flags'
import { issueClaimToken } from './placement'
import { huntRpc } from './staff-store'

// eslint-disable-next-line no-restricted-syntax -- the FH-005 hunt tables are not in the generated types yet (ADR-246 exception)
const db = () => createAdminClient() as unknown as SupabaseClient

const secret = () => signingSecret('hunt-claim-proof', ['HUNTS_PROOF_SECRET'])

/** A printed code is a public lookup, limited to live, visible Hunts and QR/NFC placements.
 * Internal callers still look up the placement by ID for run and token verification. */
export async function loadScanPlacement(lookup: string | { code: string }): Promise<{ id: string; huntId: string; revokedAt: string | null; huntSlug: string | null } | null> {
  const code = typeof lookup === 'string' ? null : lookup.code
  if (code !== null && (!huntSwitchOn('claims') || !/^[a-z0-9-]{6,80}$/.test(code))) return null

  const client = db()
  const placements = client.from('hunt_placements').select('id, hunt_id, revoked_at')
  const { data, error } = await (typeof lookup === 'string'
    ? placements.eq('id', lookup)
    : placements.eq('slug', lookup.code).in('medium', ['qr', 'nfc'])).maybeSingle()
  const p = error ? null : data as { id: string; hunt_id: string; revoked_at: string | null } | null
  if (!p) return null

  const hunts = client.from('hunts').select('slug').eq('id', p.hunt_id)
  const { data: hunt, error: huntError } = await (code === null
    ? hunts
    : hunts.in('visibility', ['public', 'unlisted']).eq('status', 'live')).maybeSingle()
  const huntSlug = huntError ? null : (hunt as { slug: string } | null)?.slug ?? null
  if (code !== null && !huntSlug) return null
  return { id: p.id, huntId: p.hunt_id, revokedAt: p.revoked_at, huntSlug }
}

/** The placement and the actor's own latest run on that placement's Hunt. */
async function loadScope(actorId: string, placementId: string): Promise<ScopeFacts> {
  const placement = await loadScanPlacement(placementId)
  if (!placement) return { placement: null, run: null }
  const { data } = await db()
    .from('hunt_runs')
    .select('id, hunt_id, subject_profile_id, state')
    .eq('hunt_id', placement.huntId)
    .eq('subject_profile_id', actorId)
    .order('attempt_no', { ascending: false })
    .limit(1)
    .maybeSingle()
  const r = data as { id: string; hunt_id: string; subject_profile_id: string; state: string } | null
  return {
    placement: { id: placement.id, huntId: placement.huntId, revokedAt: placement.revokedAt },
    run: r ? { id: r.id, huntId: r.hunt_id, subjectProfileId: r.subject_profile_id, state: r.state } : null,
  }
}

/** The signed-in landing: finds the actor's run and hands back a short-lived claim token bound to it. */
export async function openClaim(actorId: string, placementId: string, nowEpoch: number): Promise<{ ok: true; runId: string; token: string } | { ok: false; reason: ClaimRefusal | 'disabled' }> {
  if (!huntSwitchOn('claims')) return { ok: false, reason: 'disabled' }
  const scope = checkScope(actorId, await loadScope(actorId, placementId))
  if (!scope.ok) return scope
  return { ok: true, runId: scope.runId, token: issueClaimToken({ secret: secret(), scope: { runId: scope.runId, placementId: scope.placementId }, now: nowEpoch }) }
}

/** The claim POST. Returns the database's answer, or a refusal from the scope checks. */
export async function claimAsPlayer(
  actorId: string,
  input: { placementId: string; missionKey: string; token: string; idempotencyKey: string; nowEpoch: number },
): Promise<{ ok: true; result: Awaited<ReturnType<typeof applyClaim>>['result']; claimId?: string; replayed: boolean } | { ok: false; reason: ClaimRefusal | 'disabled' }> {
  if (!huntSwitchOn('claims')) return { ok: false, reason: 'disabled' }
  const facts = await loadScope(actorId, input.placementId)
  const decision = authorizeClaim({ actorId, facts, token: input.token, secret: secret(), nowEpoch: input.nowEpoch, missionKey: input.missionKey, idempotencyKey: input.idempotencyKey })
  if (!decision.ok) return decision
  const out = await applyClaim(huntRpc() as never, decision.input)
  return { ok: true, result: out.result, claimId: out.claimId, replayed: out.replayed }
}
