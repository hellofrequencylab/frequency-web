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
import { evaluate, validateGraph } from './graph'
import { issueClaimToken } from './placement'
import { loadPublishedTrail, loadRunCreditsForClaim } from './run-store'
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

type ScopeRefusal = { ok: false; reason: ClaimRefusal | 'mission_binding_unavailable' }
type ScanScope = {
  ok: true
  facts: ScopeFacts
  huntId: string
  huntSlug: string
  versionId: string
  missionKey: string
  runId: string
  placementId: string
}

/** A scan can only target a QR/NFC placement uniquely bound on the actor's current run version. */
async function loadScope(actorId: string, placementId: string): Promise<ScanScope | ScopeRefusal> {
  const client = db()
  const { data: placement, error: placementError } = await client
    .from('hunt_placements')
    .select('id, hunt_id, revoked_at')
    .eq('id', placementId)
    .in('medium', ['qr', 'nfc'])
    .maybeSingle()
  const p = placement as { id: string; hunt_id: string; revoked_at: string | null } | null
  if (placementError || !p) return { ok: false, reason: 'placement_not_found' }
  if (p.revoked_at) return { ok: false, reason: 'placement_revoked' }

  const { data: hunt, error: huntError } = await client
    .from('hunts')
    .select('slug, current_version_id')
    .eq('id', p.hunt_id)
    .eq('status', 'live')
    .in('visibility', ['public', 'unlisted'])
    .maybeSingle()
  const h = hunt as { slug: string; current_version_id: string | null } | null
  if (huntError || !h?.current_version_id) return { ok: false, reason: 'placement_not_found' }
  const versionId = h.current_version_id

  const [run, bound, version] = await Promise.all([
    client.from('hunt_runs').select('id, hunt_id, subject_profile_id, state')
      .eq('hunt_id', p.hunt_id).eq('version_id', versionId).eq('subject_profile_id', actorId)
      .order('attempt_no', { ascending: false }).limit(1).maybeSingle(),
    client.from('hunt_mission_placements').select('mission_key', { count: 'exact' })
      .eq('hunt_id', p.hunt_id).eq('version_id', versionId).eq('placement_id', p.id).limit(2),
    client.from('hunt_versions').select('id')
      .eq('hunt_id', p.hunt_id).eq('id', versionId).eq('status', 'published').maybeSingle(),
  ])
  const r = run.error ? null : run.data as { id: string; hunt_id: string; subject_profile_id: string; state: string } | null
  const facts: ScopeFacts = {
    placement: { id: p.id, huntId: p.hunt_id, revokedAt: p.revoked_at },
    run: r ? { id: r.id, huntId: r.hunt_id, subjectProfileId: r.subject_profile_id, state: r.state } : null,
  }
  const scope = checkScope(actorId, facts)
  if (!scope.ok) return scope
  if (version.error || !version.data) return { ok: false, reason: 'placement_not_found' }
  const bindings = bound.data as { mission_key: string }[] | null
  const missionKey = bindings?.length === 1 ? bindings[0]?.mission_key : undefined
  if (bound.error || bound.count !== 1 || typeof missionKey !== 'string' || !missionKey) return { ok: false, reason: 'mission_binding_unavailable' }

  return { ...scope, facts, huntId: p.hunt_id, huntSlug: h.slug, versionId, missionKey }
}

/** The signed-in landing: finds the actor's run and hands back a short-lived claim token bound to it. */
export async function openClaim(actorId: string, placementId: string, nowEpoch: number): Promise<{ ok: true; runId: string; token: string } | ScopeRefusal | { ok: false; reason: 'disabled' }> {
  if (!huntSwitchOn('claims')) return { ok: false, reason: 'disabled' }
  const scope = await loadScope(actorId, placementId)
  if (!scope.ok) return scope
  return { ok: true, runId: scope.runId, token: issueClaimToken({ secret: secret(), scope: { runId: scope.runId, placementId: scope.placementId }, now: nowEpoch }) }
}

/** The claim POST. Returns the database's answer, or a refusal from the scope checks. */
export async function claimAsPlayer(
  actorId: string,
  input: { placementId: string; missionKey?: string; token: string; idempotencyKey: string; nowEpoch: number },
): Promise<{ ok: true } & Awaited<ReturnType<typeof applyClaim>> | ScopeRefusal | { ok: false; reason: 'disabled' | 'eligibility_unavailable' | 'mission_not_eligible' }> {
  if (!huntSwitchOn('claims')) return { ok: false, reason: 'disabled' }
  const scope = await loadScope(actorId, input.placementId)
  if (!scope.ok) return scope
  // Only the binding can select the mission, including for callers that still pass a mission key.
  const decision = authorizeClaim({ actorId, facts: scope.facts, token: input.token, secret: secret(), nowEpoch: input.nowEpoch, missionKey: scope.missionKey, idempotencyKey: input.idempotencyKey })
  if (!decision.ok) return decision

  const [trail, credits] = await Promise.all([
    loadPublishedTrail(scope.huntSlug),
    loadRunCreditsForClaim(scope.runId, actorId),
  ])
  if (!trail || trail.huntId !== scope.huntId || trail.versionId !== scope.versionId || trail.huntState !== 'published'
    || !credits || !validateGraph(trail.graph).ok) return { ok: false, reason: 'eligibility_unavailable' }

  // The run lock still protects the write. The dark rollout requires FH-049T before activation.
  const evaluation = evaluate(trail.graph, credits, input.nowEpoch * 1000)
  if (evaluation.credited.includes(scope.missionKey)) return { ok: true, result: 'already_credited', replayed: false }
  if (!evaluation.eligible.includes(scope.missionKey)) return { ok: false, reason: 'mission_not_eligible' }
  const out = await applyClaim(huntRpc() as never, decision.input)
  return { ok: true, ...out }
}
