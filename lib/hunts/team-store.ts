/**
 * The team door's fact loader (FH-043). Every Hunt table is service role only, so this file is the
 * tenancy wall for team play: each call takes the signed-in profile id the action derived, reads the
 * Hunt, the placement and the caller's own membership fresh, and only then calls the database, which
 * decides again under its own locks (supabase/migrations/20270346082000_hunt_teams_editions.sql).
 *
 *   myTeam(actorId, slug)              the caller's own team on a Trail: its state and size, never a roster
 *   startTeam / joinMyTeam / lockMyTeam / leaveMyTeam   the roster commands
 *   claimAsTeamMember(actorId, input)  a member credits a stop on the team's run
 *   myTeamView(actorId, slug)          the caller's team and, once locked, the team run's credited stops
 *   grantTeamReward(actorId, input)    the captain claims a reward on the team run; a split is written once
 *
 * Nothing here returns another member's name or traversal: docs/hunts/ROLE-MATRIX.md has no roster view.
 * Dark: every function answers `disabled` until HUNTS_CLAIMS_ENABLED (which needs HUNTS_ENABLED) is on.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadScanPlacement } from './claim-store'
import { huntSwitchOn } from './flags'
import { evaluate, validateGraph } from './graph'
import { grantReward } from './rewards'
import { loadPublishedTrail } from './run-store'
import { huntRpc, loadUniquePlacementMission } from './staff-store'
import { allocateTeamAward, applyTeamClaim, createTeam, joinTeam, leaveTeam, lockTeam, type TeamResult } from './teams'

// eslint-disable-next-line no-restricted-syntax -- the hunt tables are not in the generated types yet (ADR-246 exception)
const db = () => createAdminClient() as unknown as SupabaseClient

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

/**
 * The caller's team on a Trail and, once the roster is locked, the stops the team run holds, for the
 * Trail page. A roster member may read the team's progress; nobody else reaches this read, because the
 * run comes from the caller's own membership. Credits are null when the read failed or was truncated.
 */
export async function myTeamView(actorId: string, slug: string): Promise<{ team: MyTeam; credits: { mission_key: string }[] | null } | null> {
  const team = await myTeam(actorId, slug)
  if (!team) return null
  if (team.state !== 'locked' || !team.runId) return { team, credits: null }
  return { team, credits: (await teamProgress(db(), team.runId))?.credits ?? null }
}

type TeamClaimRefusal = 'not_on_team' | 'roster_not_locked' | 'placement_not_found' | 'mission_binding_unavailable' | 'eligibility_unavailable' | 'mission_not_eligible'

/**
 * A team member confirms a stop with the code printed there. The placement binding picks the stop, the
 * caller's own membership picks the team and its run; neither a team id nor a run id is taken from the
 * request. The database then checks the roster again under the team lock.
 */
export async function claimAsTeamMember(
  actorId: string,
  input: { slug: string; code: string; idempotencyKey: string; nowEpoch: number },
): Promise<{ ok: true; result: TeamResult; replayed: boolean } | { ok: false; reason: TeamClaimRefusal | 'disabled' }> {
  if (!huntSwitchOn('claims')) return { ok: false, reason: 'disabled' }
  const placement = await loadScanPlacement({ code: input.code })
  if (!placement || placement.revokedAt !== null || placement.huntSlug !== input.slug) return { ok: false, reason: 'placement_not_found' }

  const client = db()
  const team = await loadMyTeam(client, actorId, placement.huntId)
  if (!team) return { ok: false, reason: 'not_on_team' }
  if (team.state !== 'locked' || !team.runId) return { ok: false, reason: 'roster_not_locked' }

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

/**
 * How a team reward is held (ADR-1972, open question b). `captain`: the one grant the captain's run
 * earns, nothing else written. `split`: the grant lands, then hunt_team_award_allocate writes who holds
 * each of `units` once (equal shares, spare units to the longest standing). Which rewards split is the
 * owner's call per reward; until it is made a caller has to name one.
 */
type TeamAwardPolicy = { hold: 'captain' } | { hold: 'split'; units: number }

type TeamGrantAnswer =
  | Awaited<ReturnType<typeof grantReward>> & { split?: Awaited<ReturnType<typeof allocateTeamAward>>['result']; shares?: { profileId: string; units: number }[] }
  | { result: 'disabled' | 'not_on_team' | 'roster_not_locked' | 'not_captain' }

/**
 * The team's reward. hunt_reward_grant writes only for the run's subject, and the team run's subject is
 * always the captain, so the captain claims it. When the grant lands (or a retry reads it back) and the
 * policy splits it, the allocation is written once per team and reward; a second call reads the first.
 */
export async function grantTeamReward(
  actorId: string,
  input: { slug: string; rewardKey: string; idempotencyKey: string; policy: TeamAwardPolicy },
): Promise<TeamGrantAnswer> {
  if (!huntSwitchOn('rewards')) return { result: 'disabled' }
  const team = await myTeam(actorId, input.slug)
  if (!team) return { result: 'not_on_team' }
  if (team.state !== 'locked' || !team.runId) return { result: 'roster_not_locked' }
  if (!team.captain) return { result: 'not_captain' }

  const granted = await grantReward(huntRpc(), { actorId, runId: team.runId, rewardKey: input.rewardKey, idempotencyKey: input.idempotencyKey })
  if (input.policy.hold !== 'split' || (granted.result !== 'granted' && granted.result !== 'already_granted')) return granted
  const split = await allocateTeamAward(huntRpc(), { actorId, teamId: team.teamId, awardKey: `reward:${input.rewardKey}`, units: input.policy.units })
  // The grant stands either way; a split the database refused is reported as refused, never as written.
  return split.result === 'allocated' ? { ...granted, split: split.result, shares: split.shares } : { ...granted, split: split.result }
}
