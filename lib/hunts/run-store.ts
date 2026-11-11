/**
 * The player's run store (FH-016): load a published Trail, start or resume a run, read its credits.
 *
 * Like lib/hunts/store.ts this is the tenancy wall for the player: every Hunt table is service role
 * only, so each read here is scoped to one Hunt that is visible to players and to one signed-in
 * profile. The caller (a server action or route) establishes the profile and the HUNTS_ENABLED switch;
 * this module trusts neither a profile id nor a slug it did not get from them. Credits are written only
 * by `hunt_claim_apply` (lib/hunts/apply-claim.ts). Nothing here writes a credit or reads an answer.
 *
 * `assembleTrail` is the pure half: it turns the published rows into the graph and the player-safe
 * content that `projectForPlayer` takes. It is tested without a database.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Credit, HuntGraph } from './graph'

// eslint-disable-next-line no-restricted-syntax -- the FH-005 hunt tables are not in the generated types yet (ADR-246 exception)
const db = () => createAdminClient() as unknown as SupabaseClient

type MissionRow = { mission_key: string; title: string; visible_body: string | null; locked_teaser: string | null; opens_at: string | null; closes_at: string | null }
type GroupRow = { id: string; target_mission_key: string | null; target_finish: boolean; logic: 'all' | 'any' | 'count'; min_count: number | null; group_key: string | null }
type MemberRow = { group_id: string; member_mission_key: string }

/** Players see a Hunt that is running or paused (paused shows its banner). Everything else is not found. */
export function playerHuntState(status: string): 'published' | 'paused' | 'closed' | null {
  if (status === 'live') return 'published'
  if (status === 'paused') return 'paused'
  if (status === 'ended' || status === 'cancelled' || status === 'archived') return 'closed'
  return null
}

/**
 * Rows to graph. Missions keep the order the author gave them (mission_key sorts stop-1, stop-2, ...
 * as written by publishRows, and the numeric part is compared as a number so stop-10 follows stop-9).
 */
export function assembleTrail(missions: readonly MissionRow[], groups: readonly GroupRow[], members: readonly MemberRow[]) {
  const num = (k: string) => Number(k.match(/(\d+)$/)?.[1] ?? 0)
  const ordered = [...missions].sort((a, b) => num(a.mission_key) - num(b.mission_key) || (a.mission_key < b.mission_key ? -1 : 1))
  const membersOf = (groupId: string) => members.filter((m) => m.group_id === groupId).map((m) => m.member_mission_key).sort()
  const toGroup = (g: GroupRow) => ({
    ...(g.group_key ? { group_key: g.group_key } : {}),
    logic: g.logic,
    ...(g.min_count !== null ? { min_count: g.min_count } : {}),
    members: membersOf(g.id),
  })
  const graph: HuntGraph = {
    missions: ordered.map((m) => ({
      mission_key: m.mission_key,
      open: m.opens_at,
      close: m.closes_at,
      rule_groups: groups.filter((g) => g.target_mission_key === m.mission_key).map(toGroup),
    })),
    finish: { rule_groups: groups.filter((g) => g.target_finish).map(toGroup) },
  }
  const content = ordered.map((m) => ({
    mission_key: m.mission_key,
    title: m.title,
    visible_body: m.visible_body ?? '',
    locked_teaser: m.locked_teaser,
  }))
  return { graph, content }
}

type PublishedTrail = {
  huntId: string
  slug: string
  versionId: string
  revision: number
  title: string
  huntState: 'published' | 'paused' | 'closed'
  graph: HuntGraph
  content: ReturnType<typeof assembleTrail>['content']
}

function completeRows(result: { data: unknown; count: number | null; error: unknown }): result is { data: object[]; count: number; error: null } {
  return !result.error && Array.isArray(result.data) && result.count === result.data.length
    && result.data.every((row: unknown) => row !== null && typeof row === 'object')
}

async function readPublishedTrailVersion(client: SupabaseClient, huntId: string, versionId: string) {
  const { data, error } = await client
    .from('hunt_versions')
    .select('id, trail_title:policy->trail->>title, trail_hook:policy->trail->>hook')
    .eq('id', versionId)
    .eq('hunt_id', huntId)
    .eq('status', 'published')
    .maybeSingle()
  return error ? null : data as { id: string; trail_title: string | null; trail_hook: string | null } | null
}

export async function isPublishedTrailVersion(huntId: string, versionId: string): Promise<boolean> {
  return (await readPublishedTrailVersion(db(), huntId, versionId)) !== null
}

async function readPublishedVersion(client: SupabaseClient, slug: string, liveOnly: boolean) {
  const hunts = client
    .from('hunts')
    .select('id, slug, status, current_version_id, revision')
    .eq('slug', slug)
    .in('visibility', ['public', 'unlisted'])
  const { data: hunt, error: huntError } = await (liveOnly ? hunts.eq('status', 'live') : hunts).maybeSingle()
  const h = hunt as { id: string; slug: string; status: string; current_version_id: string | null; revision: number } | null
  const state = h ? playerHuntState(h.status) : null
  if (huntError || !h || !state || !h.current_version_id || (liveOnly && state !== 'published')) return null

  const v = await readPublishedTrailVersion(client, h.id, h.current_version_id)
  if (!v) return null
  return {
    huntId: h.id,
    slug: h.slug,
    versionId: v.id,
    revision: h.revision,
    title: (typeof v.trail_title === 'string' && v.trail_title.trim()) || h.slug,
    description: (typeof v.trail_hook === 'string' && v.trail_hook.trim()) || null,
    huntState: state,
  }
}

/** The live public landing reads the published title, hook and stop count only. */
export async function loadPublicTrailSummary(slug: string): Promise<{ slug: string; title: string; description: string | null; stopCount: number } | null> {
  const client = db()
  const version = await readPublishedVersion(client, slug, true)
  if (!version) return null
  const { count, error } = await client
    .from('hunt_missions')
    .select('mission_key', { count: 'exact', head: true })
    .eq('version_id', version.versionId)
    .eq('hunt_id', version.huntId)
  if (error || count === null) return null
  return { slug: version.slug, title: version.title, description: version.description, stopCount: count }
}

/**
 * The published Trail a player may open, by slug. Never the open draft: it reads the version the Hunt
 * points at, and only when that version is published. Null for a draft, a private Hunt, or no such slug.
 */
export async function loadPublishedTrail(slug: string): Promise<PublishedTrail | null> {
  const client = db()
  const version = await readPublishedVersion(client, slug, false)
  if (!version) return null

  const [m, g, mem] = await Promise.all([
    client.from('hunt_missions').select('mission_key, title, visible_body, locked_teaser, opens_at, closes_at', { count: 'exact' }).eq('version_id', version.versionId),
    client.from('hunt_rule_groups').select('id, target_mission_key, target_finish, logic, min_count, group_key', { count: 'exact' }).eq('version_id', version.versionId),
    client.from('hunt_rule_group_members').select('group_id, member_mission_key', { count: 'exact' }).eq('version_id', version.versionId),
  ])
  // Neither a failed read nor a response truncated by the API row cap may drop prerequisites.
  if (!completeRows(m) || !completeRows(g) || !completeRows(mem)) return null
  const missions = m.data as MissionRow[]
  const groups = g.data as GroupRow[]
  const members = mem.data as MemberRow[]
  const missionKeys = new Set(missions.map((mission) => mission.mission_key))
  const groupIds = new Set(groups.map((group) => group.id))
  if (missions.some((mission) => typeof mission.mission_key !== 'string')
    || groups.some((group) => typeof group.id !== 'string' || typeof group.target_finish !== 'boolean'
      || (group.target_finish ? group.target_mission_key !== null : !missionKeys.has(group.target_mission_key ?? '')))
    || members.some((member) => !groupIds.has(member.group_id) || !missionKeys.has(member.member_mission_key))) return null

  const { graph, content } = assembleTrail(missions, groups, members)
  return {
    huntId: version.huntId,
    slug: version.slug,
    versionId: version.versionId,
    revision: version.revision,
    title: version.title,
    huntState: version.huntState,
    graph,
    content,
  }
}

type PlayerRun = { runId: string; state: string }
type PlayerRunScope = Pick<PublishedTrail, 'huntId' | 'versionId'>

/** A hint request can resume reading an existing run without creating one. */
export async function loadPlayerRun(trail: PlayerRunScope, profileId: string): Promise<PlayerRun | null> {
  const { data } = await db()
    .from('hunt_runs')
    .select('id, state')
    .eq('version_id', trail.versionId)
    .eq('hunt_id', trail.huntId)
    .eq('subject_profile_id', profileId)
    .order('attempt_no', { ascending: false })
    .limit(1)
    .maybeSingle()
  const row = data as { id: string; state: string } | null
  return row ? { runId: row.id, state: row.state } : null
}

/**
 * Start or resume the signed-in player's run on this version. A second tab or device finds the same
 * active run: the unique (version, profile, attempt) key means a lost race re-reads instead of
 * creating a second run. A closed or paused Hunt cannot start a new run, but an existing run is still
 * returned so the player keeps seeing their progress.
 */
export async function startOrResumeRun(trail: Pick<PublishedTrail, 'huntId' | 'versionId' | 'huntState'>, profileId: string): Promise<PlayerRun | null> {
  const existing = await loadPlayerRun(trail, profileId)
  if (existing) return existing
  if (trail.huntState !== 'published') return null
  const { data, error } = await db()
    .from('hunt_runs')
    .insert({ hunt_id: trail.huntId, version_id: trail.versionId, subject_profile_id: profileId })
    .select('id, state')
    .maybeSingle()
  if (data) return { runId: (data as { id: string }).id, state: (data as { state: string }).state }
  // 23505: another tab created it first. Read theirs.
  if (error?.code === '23505') return loadPlayerRun(trail, profileId)
  return null
}

/** The credits a run holds. Only `credited` rows count; reversed or void rows are history. */
export async function loadRunCredits(runId: string, profileId: string): Promise<Credit[]> {
  return (await loadRunCreditsForClaim(runId, profileId)) ?? []
}

/** The claim adapter distinguishes unavailable progress from an empty, authorized run. */
export async function loadRunCreditsForClaim(runId: string, profileId: string): Promise<Credit[] | null> {
  const client = db()
  // Ownership first: a run id is not a secret, so the read is scoped to its subject.
  const { data: run, error: runError } = await client.from('hunt_runs').select('id').eq('id', runId).eq('subject_profile_id', profileId).maybeSingle()
  if (runError || !run) return null
  const progress = await client.from('hunt_progress').select('mission_key', { count: 'exact' }).eq('run_id', runId).eq('disposition', 'credited')
  if (!completeRows(progress)) return null
  const rows = progress.data as Credit[]
  if (rows.some((row) => typeof row.mission_key !== 'string')) return null
  return rows.map((row) => ({ mission_key: row.mission_key }))
}
