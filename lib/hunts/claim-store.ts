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
 * A Mystery (a mission of kind `answer`, FH-042) is claimed through the same door: the scan proves the
 * place, and `answer` is judged on the server by lib/hunts/mystery.ts before the credit is asked for.
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
import { judgeAnswer, lockedMysteries, MAX_ANSWER_ATTEMPTS } from './mystery'
import { issueClaimToken } from './placement'
import { isPublishedTrailVersion, loadPublishedTrail, loadRunProgressSnapshot } from './run-store'
import { huntRpc, loadUniquePlacementMission } from './staff-store'

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

type ScopeRefusal = { ok: false; reason: ClaimRefusal | 'mission_binding_unavailable' | 'version_superseded' }
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

/**
 * A scan can only target a QR/NFC placement uniquely bound on the version the actor's run is pinned to.
 * FH-016T: the version comes from the run row, never from the Hunt's current pointer. The mission is
 * looked up on that pinned version only, and only after the run is known. A run whose version is no
 * longer the Hunt's current one is refused here, before a token is issued or a mission is resolved, so
 * a placement rebound in a newer version can never pick a mission for an older run.
 */
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

  const run = await client.from('hunt_runs').select('id, hunt_id, version_id, subject_profile_id, state')
    .eq('hunt_id', p.hunt_id).eq('version_id', h.current_version_id).eq('subject_profile_id', actorId)
    .order('attempt_no', { ascending: false }).limit(1).maybeSingle()
  const r = run.error ? null : run.data as { id: string; hunt_id: string; version_id?: unknown; subject_profile_id: string; state: string } | null
  const facts: ScopeFacts = {
    placement: { id: p.id, huntId: p.hunt_id, revokedAt: p.revoked_at },
    run: r ? { id: r.id, huntId: r.hunt_id, subjectProfileId: r.subject_profile_id, state: r.state } : null,
  }
  const scope = checkScope(actorId, facts)
  if (!scope.ok) return scope
  // The run row is the authority for the version. A row without one, or pinned elsewhere, fails closed.
  const versionId = typeof r?.version_id === 'string' ? r.version_id : null
  if (!versionId || versionId !== h.current_version_id) return { ok: false, reason: 'version_superseded' }

  const [missionKey, published] = await Promise.all([
    loadUniquePlacementMission(p.hunt_id, versionId, p.id),
    isPublishedTrailVersion(p.hunt_id, versionId),
  ])
  if (!published) return { ok: false, reason: 'placement_not_found' }
  if (!missionKey) return { ok: false, reason: 'mission_binding_unavailable' }

  return { ...scope, facts, huntId: p.hunt_id, huntSlug: h.slug, versionId, missionKey }
}

/** The signed-in landing: finds the actor's run and hands back a short-lived claim token bound to it. */
export async function openClaim(actorId: string, placementId: string, nowEpoch: number): Promise<{ ok: true; runId: string; token: string } | ScopeRefusal | { ok: false; reason: 'disabled' }> {
  if (!huntSwitchOn('claims')) return { ok: false, reason: 'disabled' }
  const scope = await loadScope(actorId, placementId)
  if (!scope.ok) return scope
  return { ok: true, runId: scope.runId, token: issueClaimToken({ secret: secret(), scope: { runId: scope.runId, placementId: scope.placementId }, now: nowEpoch }) }
}

/** A Mystery guess that did not earn the credit. `hint` is the mission's fallback hint, shown from the second wrong guess. */
type AnswerRefusal =
  | { ok: false; reason: 'answer_required' }
  | { ok: false; reason: 'answer_wrong' | 'answer_locked'; attemptsLeft: number; hint?: string }

/**
 * Judge a Mystery guess for a mission the run may claim right now. Bounded and server only:
 * - Each judged guess is one hunt_claims row with evidence `answer:<n>` (state submitted; it records
 *   whether the guess was right, never the guess). The table allows one row per run, mission and
 *   evidence id, so of two requests racing for the same attempt number one is recorded and the other
 *   is told nothing about its guess, right or wrong. No more than MAX_ANSWER_ATTEMPTS numbers exist.
 * - A run that already answered correctly is not asked again, so a retry after a dropped response or
 *   a stale claim costs no attempt.
 * - Only a verdict leaves this function. The stored hash stays here.
 */
async function judgeMysteryAttempt(scope: ScanScope, actorId: string, answer: string | undefined): Promise<{ ok: true } | AnswerRefusal | { ok: false; reason: 'eligibility_unavailable' }> {
  const client = db()
  const [mission, slots] = await Promise.all([
    client.from('hunt_missions').select('answer_hash, locked_teaser').eq('version_id', scope.versionId).eq('mission_key', scope.missionKey).maybeSingle(),
    client.from('hunt_claims').select('evidence_id, correct:policy_result->>correct', { count: 'exact' }).eq('run_id', scope.runId).eq('mission_key', scope.missionKey).like('evidence_id', 'answer:%'),
  ])
  const m = mission.error ? null : mission.data as { answer_hash: string | null; locked_teaser: string | null } | null
  if (!m || typeof m.answer_hash !== 'string' || slots.error || !Array.isArray(slots.data) || slots.count !== slots.data.length) return { ok: false, reason: 'eligibility_unavailable' }
  const attempts = slots.data as { evidence_id: string; correct: string | null }[]
  if (attempts.some((a) => a.correct === 'true')) return { ok: true }
  const used = attempts.length
  const hint = m.locked_teaser ? { hint: m.locked_teaser } : {}
  if (used >= MAX_ANSWER_ATTEMPTS) return { ok: false, reason: 'answer_locked', attemptsLeft: 0, ...hint }
  if (typeof answer !== 'string' || answer.trim() === '') return { ok: false, reason: 'answer_required' }

  const verdict = judgeAnswer({ stored: m.answer_hash, attempt: answer, attemptsUsed: used })
  const correct = verdict.outcome === 'correct'
  const recorded = await client.from('hunt_claims').insert({
    hunt_id: scope.huntId, run_id: scope.runId, version_id: scope.versionId, mission_key: scope.missionKey, actor_profile_id: actorId,
    evidence_id: `answer:${used + 1}`, state: 'submitted', assurance: 'none', reason: 'answer_attempt', policy_result: { kind: 'answer_attempt', attempt: used + 1, correct },
  })
  // Another request took this attempt number (or the write failed). The verdict is dropped unseen.
  if (recorded.error) return { ok: false, reason: 'eligibility_unavailable' }

  if (verdict.outcome === 'correct') return { ok: true }
  return { ok: false, reason: verdict.outcome === 'locked' ? 'answer_locked' : 'answer_wrong', attemptsLeft: verdict.attemptsLeft, ...(verdict.showHint ? hint : {}) }
}

/**
 * FH-042S: the Mysteries this run has no tries left on, for the player page. Read from the same
 * `answer:<n>` rows the claim door writes, scoped to the run's own subject. A failed or truncated read
 * locks nothing: the claim door still refuses a locked answer, so the page can only show one stop too many.
 */
export async function loadLockedAnswers(runId: string, profileId: string): Promise<string[]> {
  try {
    return await readLockedAnswers(runId, profileId)
  } catch {
    return []
  }
}

async function readLockedAnswers(runId: string, profileId: string): Promise<string[]> {
  const client = db()
  const run = await client.from('hunt_runs').select('id').eq('id', runId).eq('subject_profile_id', profileId).maybeSingle()
  if (run.error || !run.data) return []
  const rows = await client.from('hunt_claims').select('mission_key, correct:policy_result->>correct', { count: 'exact' }).eq('run_id', runId).like('evidence_id', 'answer:%')
  if (rows.error || !Array.isArray(rows.data) || rows.count !== rows.data.length) return []
  const attempts = (rows.data as { mission_key: unknown; correct: unknown }[])
    .filter((r): r is { mission_key: string; correct: string | null } => typeof r.mission_key === 'string')
  return lockedMysteries(attempts)
}

/** The claim POST. Returns the database's answer, or a refusal from the scope checks. */
export async function claimAsPlayer(
  actorId: string,
  input: { placementId: string; missionKey?: string; token: string; idempotencyKey: string; nowEpoch: number; /** A Mystery guess. Ignored for any other mission. */ answer?: string },
): Promise<{ ok: true } & Awaited<ReturnType<typeof applyClaim>> | ScopeRefusal | AnswerRefusal | { ok: false; reason: 'disabled' | 'eligibility_unavailable' | 'mission_not_eligible' }> {
  if (!huntSwitchOn('claims')) return { ok: false, reason: 'disabled' }
  const scope = await loadScope(actorId, input.placementId)
  if (!scope.ok) return scope
  // Only the binding can select the mission, including for callers that still pass a mission key.
  const decision = authorizeClaim({ actorId, facts: scope.facts, token: input.token, secret: secret(), nowEpoch: input.nowEpoch, missionKey: scope.missionKey, idempotencyKey: input.idempotencyKey })
  if (!decision.ok) return decision

  const [trail, first] = await Promise.all([
    loadPublishedTrail(scope.huntSlug),
    loadRunProgressSnapshot(scope.runId, actorId),
  ])
  if (!trail || trail.huntId !== scope.huntId || trail.versionId !== scope.versionId || trail.huntState !== 'published'
    || !first || !validateGraph(trail.graph).ok) return { ok: false, reason: 'eligibility_unavailable' }

  // FH-042: an exclusive choice needs no command of its own. `evaluate` closes every other branch of a
  // choice group once one is credited, and the count check below is taken under the run lock, so of two
  // branches claimed at once the second is answered stale_progress, rereads, and is refused here.
  const isMystery = trail.graph.missions.some((m) => m.mission_key === scope.missionKey && m.kind === 'answer')
  let answered = !isMystery

  // FH-049T: the credits and the progress count come from one snapshot. The database compares the count
  // under the run lock and answers stale_progress when a progress row landed since. Then the snapshot is
  // reread and the graph reevaluated, once, before one more call: two attempts at most, never a loop.
  let snapshot = first
  for (let attempt = 0; attempt < 2; attempt++) {
    const evaluation = evaluate(trail.graph, snapshot.credits, input.nowEpoch * 1000)
    if (evaluation.credited.includes(scope.missionKey)) return { ok: true, result: 'already_credited', replayed: false }
    if (!evaluation.eligible.includes(scope.missionKey)) return { ok: false, reason: 'mission_not_eligible' }
    if (!answered) {
      // Judged once per request, and only for a mission that is eligible, so a locked stop costs no attempt.
      const judged = await judgeMysteryAttempt(scope, actorId, input.answer)
      if (!judged.ok) return judged
      answered = true
    }
    const out = await applyClaim(huntRpc() as never, { ...decision.input, expectedProgressCount: snapshot.total })
    if (out.result !== 'stale_progress' || attempt === 1) return { ok: true, ...out }
    const reread = await loadRunProgressSnapshot(scope.runId, actorId)
    if (!reread) return { ok: false, reason: 'eligibility_unavailable' }
    snapshot = reread
  }
  return { ok: false, reason: 'eligibility_unavailable' }
}
