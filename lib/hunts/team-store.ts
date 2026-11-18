/**
 * The team door's fact loader (FH-043). Every Hunt table is service role only, so this file is the
 * tenancy wall for team play: each call takes the signed-in profile id the action derived, reads the
 * Hunt, the placement and the caller's own membership fresh, and only then calls the database, which
 * decides again under its own locks (supabase/migrations/20270346082000_hunt_teams_editions.sql).
 *
 *   myTeam(actorId, slug)              the caller's own team on a Trail: its state and size, never a roster
 *   myTeamPanel(actorId, slug)         the same, plus the team run's stop count, for the Trail page
 *   startTeam / joinMyTeam / lockMyTeam / leaveMyTeam   the roster commands
 *   openTeamClaim(actorId, code, now)  the scan landing: a claim token bound to the team's run and the stop
 *   claimAsTeamMember(actorId, input)  a member credits a stop on the team's run (typed, or a scan with its token)
 *
 * Nothing here returns another member's name or traversal: docs/hunts/ROLE-MATRIX.md has no roster view.
 * Dark: every function answers `disabled` until HUNTS_CLAIMS_ENABLED (which needs HUNTS_ENABLED) is on.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { signingSecret } from '@/lib/signing-secret'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadScanPlacement } from './claim-store'
import { huntSwitchOn } from './flags'
import { evaluate, validateGraph } from './graph'
import { issueClaimToken, verifyClaimToken } from './placement'
import { loadPublishedTrail } from './run-store'
import { huntRpc, loadUniquePlacementMission } from './staff-store'
import { applyTeamClaim, createTeam, joinTeam, leaveTeam, lockTeam, type TeamResult } from './teams'

// eslint-disable-next-line no-restricted-syntax -- the hunt tables are not in the generated types yet (ADR-246 exception)
const db = () => createAdminClient() as unknown as SupabaseClient

// The same proof secret as the solo door (claim-store.ts). A token names its run, so a solo token never
// opens the team run and a team token never opens a member's own run.
const secret = () => signingSecret('hunt-claim-proof', ['HUNTS_PROOF_SECRET'])

type Disabled = { result: 'disabled' }
const OFF: Disabled = { result: 'disabled' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type MyTeam = {
  teamId: string
  huntId: string
  versionId: string
  name: string
  state: 'forming' | 'locked' | 'disbanded'
  runId: string | null
  captain: boolean
  /** Active members, a count only. */
  size: number
}

/** The caller's active team on one Hunt, read by their own membership row. Null when they are on none. */
async function loadMyTeam(client: SupabaseClient, actorId: string, huntId: string): Promise<MyTeam | null> {
  const { data: mine, error } = await client
    .from('hunt_team_members')
    .select('team_id, role')
    .eq('hunt_id', huntId)
    .eq('profile_id', actorId)
    .is('left_at', null)
    .maybeSingle()
  const m = error ? null : (mine as { team_id: string; role: string } | null)
  if (!m) return null
  const [team, roster] = await Promise.all([
    client.from('hunt_teams').select('id, hunt_id, version_id, name, state, run_id').eq('id', m.team_id).eq('hunt_id', huntId).maybeSingle(),
    client.from('hunt_team_members').select('profile_id', { count: 'exact', head: true }).eq('team_id', m.team_id).is('left_at', null),
  ])
  const t = team.error ? null : (team.data as { id: string; hunt_id: string; version_id: string; name: string; state: MyTeam['state']; run_id: string | null } | null)
  if (!t || roster.error || roster.count === null) return null
  return { teamId: t.id, huntId: t.hunt_id, versionId: t.version_id, name: t.name, state: t.state, runId: t.run_id, captain: m.role === 'captain', size: roster.count }
}

async function liveHunt(client: SupabaseClient, slug: string): Promise<{ id: string; currentVersionId: string } | null> {
  const { data, error } = await client
    .from('hunts')
    .select('id, current_version_id')
    .eq('slug', slug)
    .eq('status', 'live')
    .in('visibility', ['public', 'unlisted'])
    .maybeSingle()
  const h = error ? null : (data as { id: string; current_version_id: string | null } | null)
  return h?.current_version_id ? { id: h.id, currentVersionId: h.current_version_id } : null
}

/** The caller's own team on a Trail. */
export async function myTeam(actorId: string, slug: string): Promise<MyTeam | null> {
  if (!huntSwitchOn('claims')) return null
  const client = db()
  const hunt = await liveHunt(client, slug)
  return hunt ? loadMyTeam(client, actorId, hunt.id) : null
}

/**
 * The Trail page's team panel (FH-043S): the caller's own team plus the team run's credited stop count
 * once the roster is locked (null while forming, or when the read is incomplete). Never a roster.
 */
export async function myTeamPanel(actorId: string, slug: string): Promise<(MyTeam & { stopsDone: number | null }) | null> {
  const team = await myTeam(actorId, slug)
  if (!team) return null
  const progress = team.state === 'locked' && team.runId ? await teamProgress(db(), team.runId) : null
  return { ...team, stopsDone: progress ? progress.credits.length : null }
}

/**
 * The scan landing for a team member (FH-043S): a short-lived claim token bound to the TEAM's run and the
 * scanned stop, so the confirm POST credits the team once. Null when the caller is on no locked team for
 * this code's Trail; the landing then falls back to the member's own run.
 */
export async function openTeamClaim(actorId: string, code: string, nowEpoch: number): Promise<{ token: string } | null> {
  if (!huntSwitchOn('claims')) return null
  const placement = await loadScanPlacement({ code })
  if (!placement || placement.revokedAt !== null) return null
  const team = await loadMyTeam(db(), actorId, placement.huntId)
  if (!team || team.state !== 'locked' || !team.runId) return null
  return { token: issueClaimToken({ secret: secret(), scope: { runId: team.runId, placementId: placement.id }, now: nowEpoch }) }
}

export async function startTeam(actorId: string, input: { slug: string; name: string }) {
  if (!huntSwitchOn('claims')) return OFF
  const hunt = await liveHunt(db(), input.slug)
  if (!hunt || !input.name.trim()) return { result: 'hunt_not_live' as const }
  return createTeam(huntRpc(), { actorId, huntId: hunt.id, name: input.name })
}

export async function joinMyTeam(actorId: string, input: { teamId: string; inviteCode: string }): Promise<{ result: TeamResult } | Disabled> {
  if (!huntSwitchOn('claims')) return OFF
  if (!UUID.test(input.teamId) || !input.inviteCode.trim()) return { result: 'bad_invite' }
  return joinTeam(huntRpc(), { actorId, teamId: input.teamId, inviteCode: input.inviteCode })
}

export async function lockMyTeam(actorId: string, teamId: string) {
  if (!huntSwitchOn('claims')) return OFF
  if (!UUID.test(teamId)) return { result: 'not_on_team' as const }
  return lockTeam(huntRpc(), { actorId, teamId })
}

export async function leaveMyTeam(actorId: string, teamId: string) {
  if (!huntSwitchOn('claims')) return OFF
  if (!UUID.test(teamId)) return { result: 'not_on_team' as const }
  return leaveTeam(huntRpc(), { actorId, teamId })
}

/** One complete read of the team run's progress, for a caller already shown to be on its roster. */
async function teamProgress(client: SupabaseClient, runId: string): Promise<{ credits: { mission_key: string }[]; total: number } | null> {
  const progress = await client.from('hunt_progress').select('mission_key, disposition', { count: 'exact' }).eq('run_id', runId)
  const rows = progress.data as { mission_key: unknown; disposition?: unknown }[] | null
  // Neither a failed read nor a response truncated by the API row cap may drop a credit.
  if (progress.error || !Array.isArray(rows) || progress.count !== rows.length || rows.some((r) => typeof r.mission_key !== 'string')) return null
  return { total: rows.length, credits: rows.filter((r) => r.disposition === 'credited').map((r) => ({ mission_key: r.mission_key as string })) }
}

type TeamClaimRefusal = 'bad_token' | 'not_on_team' | 'roster_not_locked' | 'placement_not_found' | 'mission_binding_unavailable' | 'eligibility_unavailable' | 'mission_not_eligible'

/**
 * A team member confirms a stop with the code printed there. The placement binding picks the stop, the
 * caller's own membership picks the team and its run; neither a team id nor a run id is taken from the
 * request. The database then checks the roster again under the team lock. A scan passes the token the
 * landing issued (openTeamClaim); it must name this team's run and this stop, or nothing is asked.
 */
export async function claimAsTeamMember(
  actorId: string,
  input: { slug: string; code: string; idempotencyKey: string; nowEpoch: number; token?: string },
): Promise<{ ok: true; result: TeamResult; replayed: boolean } | { ok: false; reason: TeamClaimRefusal | 'disabled' }> {
  if (!huntSwitchOn('claims')) return { ok: false, reason: 'disabled' }
  const placement = await loadScanPlacement({ code: input.code })
  if (!placement || placement.revokedAt !== null || placement.huntSlug !== input.slug) return { ok: false, reason: 'placement_not_found' }

  const client = db()
  const team = await loadMyTeam(client, actorId, placement.huntId)
  if (!team) return { ok: false, reason: 'not_on_team' }
  if (team.state !== 'locked' || !team.runId) return { ok: false, reason: 'roster_not_locked' }
  if (input.token !== undefined
    && !verifyClaimToken({ secret: secret(), token: input.token, now: input.nowEpoch, expected: { runId: team.runId, placementId: placement.id } })) {
    return { ok: false, reason: 'bad_token' }
  }

  const [trail, missionKey, first] = await Promise.all([
    loadPublishedTrail(input.slug),
    loadUniquePlacementMission(placement.huntId, team.versionId, placement.id),
    teamProgress(client, team.runId),
  ])
  if (!missionKey) return { ok: false, reason: 'mission_binding_unavailable' }
  if (!trail || trail.huntId !== team.huntId || trail.versionId !== team.versionId || trail.huntState !== 'published'
    || !first || !validateGraph(trail.graph).ok) return { ok: false, reason: 'eligibility_unavailable' }

  // Same shape as the solo claim (FH-049T): credits and count from one snapshot, one reread at most.
  let snapshot = first
  for (let attempt = 0; attempt < 2; attempt++) {
    const evaluation = evaluate(trail.graph, snapshot.credits, input.nowEpoch * 1000)
    if (evaluation.credited.includes(missionKey)) return { ok: true, result: 'already_credited', replayed: false }
    if (!evaluation.eligible.includes(missionKey)) return { ok: false, reason: 'mission_not_eligible' }
    const out = await applyTeamClaim(huntRpc(), {
      actorId,
      teamId: team.teamId,
      runId: team.runId,
      missionKey,
      placementId: placement.id,
      evidenceId: `node:${placement.id}`,
      assurance: 'signed_node',
      idempotencyKey: input.idempotencyKey,
      expectedProgressCount: snapshot.total,
    })
    if (out.result !== 'stale_progress' || attempt === 1) return { ok: true, result: out.result, replayed: out.replayed }
    const reread = await teamProgress(client, team.runId)
    if (!reread) return { ok: false, reason: 'eligibility_unavailable' }
    snapshot = reread
  }
  return { ok: false, reason: 'eligibility_unavailable' }
}
