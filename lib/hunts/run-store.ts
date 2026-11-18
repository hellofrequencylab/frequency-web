/**
 * The player's run store (FH-016): load a published Trail, start or resume a run, read its credits.
 *
 * Like lib/hunts/store.ts this is the tenancy wall for the player: every Hunt table is service role
 * only, so each read here is scoped to one Hunt that is visible to players and to one signed-in
 * profile. The caller (a server action or route) establishes the profile and the HUNTS_ENABLED switch;
 * this module trusts neither a profile id nor a slug it did not get from them. Credits are written only
 * by `hunt_claim_apply` (lib/hunts/apply-claim.ts). Nothing here writes a credit or reads an answer:
 * a Mystery's `answer_hash` is selected by no query in this file, so it cannot reach a player view.
 *
 * `assembleTrail` is the pure half: it turns the published rows into the graph and the player-safe
 * content that `projectForPlayer` takes. It is tested without a database.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { approximatePoint } from '@/lib/maps/approximate'
import { resolvePrecision } from '@/lib/spaces/location'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PartnerRow } from './authz'
import { closedPlacements, closedVenues } from './closures'
import type { Chapter, Credit, HuntGraph } from './graph'
import { MAX_ANSWER_ATTEMPTS } from './mystery'

// eslint-disable-next-line no-restricted-syntax -- the FH-005 hunt tables are not in the generated types yet (ADR-246 exception)
const db = () => createAdminClient() as unknown as SupabaseClient

type MissionRow = {
  mission_key: string; title: string; visible_body: string | null; locked_teaser: string | null; opens_at: string | null; closes_at: string | null
  /** FH-042 branch fields. Optional so rows read before them still assemble. `answer_hash` is never read here. */
  kind?: string | null; choice_group?: string | null; fallback_group?: string | null
}
type GroupRow = { id: string; target_mission_key: string | null; target_finish: boolean; logic: 'all' | 'any' | 'count'; min_count: number | null; group_key: string | null }
type MemberRow = { group_id: string; member_mission_key: string }
type PlacementRow = { mission_key: string; placement_id: string; venue_space_id: string | null }
/**
 * FH-030 count rules a version may carry: its mission-to-placement bindings and `policy.chapters`, plus
 * (FH-030S) the placements closed right now, which are live state and never part of the version.
 */
type CountRuleRows = { placements?: readonly PlacementRow[]; chapters?: readonly Chapter[]; closed?: ReadonlySet<string> }

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
 *
 * `rules` adds what the count rules read (FH-030): each mission's equivalent placements with their
 * venue, so two missions in one shop share a bucket, and the version's regional chapters. FH-030S: a
 * placement in `rules.closed` (revoked, or at a venue whose partner row is not in force) is marked
 * closed, so the evaluation shows its stop as closed and a count rule stops counting it. The claim
 * path still refuses it on its own (`hunt_claim_apply`), under the run lock.
 */
export function assembleTrail(missions: readonly MissionRow[], groups: readonly GroupRow[], members: readonly MemberRow[], rules: CountRuleRows = {}) {
  const num = (k: string) => Number(k.match(/(\d+)$/)?.[1] ?? 0)
  const ordered = [...missions].sort((a, b) => num(a.mission_key) - num(b.mission_key) || (a.mission_key < b.mission_key ? -1 : 1))
  const membersOf = (groupId: string) => members.filter((m) => m.group_id === groupId).map((m) => m.member_mission_key).sort()
  const toGroup = (g: GroupRow) => ({
    ...(g.group_key ? { group_key: g.group_key } : {}),
    logic: g.logic,
    ...(g.min_count !== null ? { min_count: g.min_count } : {}),
    members: membersOf(g.id),
  })
  const placementsOf = (missionKey: string) =>
    (rules.placements ?? [])
      .filter((p) => p.mission_key === missionKey)
      .map((p) => ({ placement_key: p.placement_id, venue: p.venue_space_id, ...(rules.closed?.has(p.placement_id) ? { closed: true } : {}) }))
      .sort((a, b) => (a.placement_key < b.placement_key ? -1 : 1))
  const graph: HuntGraph = {
    missions: ordered.map((m) => {
      const placements = placementsOf(m.mission_key)
      return {
        mission_key: m.mission_key,
        open: m.opens_at,
        close: m.closes_at,
        ...(placements.length > 0 ? { placements } : {}),
        ...(m.kind === 'answer' ? { kind: m.kind } : {}),
        ...(m.choice_group ? { choice_group: m.choice_group } : {}),
        ...(m.fallback_group ? { fallback_group: m.fallback_group } : {}),
        rule_groups: groups.filter((g) => g.target_mission_key === m.mission_key).map(toGroup),
      }
    }),
    finish: { rule_groups: groups.filter((g) => g.target_finish).map(toGroup) },
    ...(rules.chapters && rules.chapters.length > 0 ? { chapters: [...rules.chapters] } : {}),
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
 *
 * FH-030S: with `liveClosures` (the player page), placements closed right now are marked closed in the
 * graph, so the player sees a closed stop as closed. The claim path leaves it off: hunt_claim_apply
 * refuses a revoked placement or a venue that is not a live partner on its own, under the run lock.
 */
export async function loadPublishedTrail(slug: string, opts: { liveClosures?: boolean } = {}): Promise<PublishedTrail | null> {
  const client = db()
  const version = await readPublishedVersion(client, slug, false)
  if (!version) return null
  const read = await readVersionGraph(client, version.huntId, version.versionId, opts.liveClosures === true)
  if (!read) return null
  return {
    huntId: version.huntId,
    slug: version.slug,
    versionId: version.versionId,
    revision: version.revision,
    title: version.title,
    huntState: version.huntState,
    graph: read.graph,
    content: read.content,
  }
}

/**
 * FH-030S: the graph of one version of a Hunt with today's closures, for a guard that must know whether a
 * planned closure leaves players a way to finish (lib/hunts/partner-store.ts `revokePartner`). Null when
 * any read failed, so the caller refuses instead of guessing.
 */
export async function loadVersionGraph(huntId: string, versionId: string): Promise<HuntGraph | null> {
  return (await readVersionGraph(db(), huntId, versionId, true))?.graph ?? null
}

/** Rows that are always complete: a read that was not asked for. */
const NOT_ASKED = { data: [] as object[], count: 0, error: null }

async function readVersionGraph(client: SupabaseClient, huntId: string, versionId: string, withClosures: boolean): Promise<ReturnType<typeof assembleTrail> | null> {
  const [m, g, mem, bound, policy, placed, partnered] = await Promise.all([
    client.from('hunt_missions').select('mission_key, title, visible_body, locked_teaser, opens_at, closes_at, kind, choice_group, fallback_group', { count: 'exact' }).eq('version_id', versionId),
    client.from('hunt_rule_groups').select('id, target_mission_key, target_finish, logic, min_count, group_key', { count: 'exact' }).eq('version_id', versionId),
    client.from('hunt_rule_group_members').select('group_id, member_mission_key', { count: 'exact' }).eq('version_id', versionId),
    client.from('hunt_mission_placements').select('mission_key, placement_id, venue_space_id', { count: 'exact' }).eq('version_id', versionId),
    client.from('hunt_versions').select('chapters:policy->chapters').eq('id', versionId).maybeSingle(),
    // FH-030S: live closure state, read now: revoked placements and partner rows of this Hunt.
    withClosures ? client.from('hunt_placements').select('id, revoked_at', { count: 'exact' }).eq('hunt_id', huntId) : NOT_ASKED,
    withClosures ? client.from('hunt_partners').select('space_id, status, effective_at, revoked_at', { count: 'exact' }).eq('hunt_id', huntId) : NOT_ASKED,
  ])
  // Neither a failed read nor a response truncated by the API row cap may drop prerequisites, or a closure.
  if (!completeRows(m) || !completeRows(g) || !completeRows(mem) || !completeRows(bound) || policy.error || !completeRows(placed) || !completeRows(partnered)) return null
  const missions = m.data as MissionRow[]
  const groups = g.data as GroupRow[]
  const members = mem.data as MemberRow[]
  const placements = bound.data as PlacementRow[]
  // A version with no chapters has no key; anything else must be a list, and validateGraph reads its shape.
  const rawChapters: unknown = (policy.data as { chapters?: unknown } | null)?.chapters ?? []
  if (!Array.isArray(rawChapters)) return null
  const missionKeys = new Set(missions.map((mission) => mission.mission_key))
  const groupIds = new Set(groups.map((group) => group.id))
  if (missions.some((mission) => typeof mission.mission_key !== 'string')
    || groups.some((group) => typeof group.id !== 'string' || typeof group.target_finish !== 'boolean'
      || (group.target_finish ? group.target_mission_key !== null : !missionKeys.has(group.target_mission_key ?? '')))
    || members.some((member) => !groupIds.has(member.group_id) || !missionKeys.has(member.member_mission_key))
    || placements.some((p) => !missionKeys.has(p.mission_key) || typeof p.placement_id !== 'string' || !p.placement_id
      || (p.venue_space_id !== null && p.venue_space_id !== undefined && typeof p.venue_space_id !== 'string'))) return null

  const revoked = new Set((placed.data as { id: unknown; revoked_at: unknown }[]).filter((p) => typeof p.id === 'string' && p.revoked_at !== null && p.revoked_at !== undefined).map((p) => p.id as string))
  const partners = (partnered.data as { space_id: string; status: PartnerRow['status']; effective_at: string | null; revoked_at: string | null }[])
    .map((p) => ({ spaceId: p.space_id, status: p.status, effectiveAt: p.effective_at, revokedAt: p.revoked_at }))
  const closed = closedPlacements(placements, revoked, closedVenues(partners, new Date().toISOString()))
  return assembleTrail(missions, groups, members, { placements, chapters: rawChapters as Chapter[], closed })
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
  return (await loadRunProgressSnapshot(runId, profileId))?.credits ?? []
}

/**
 * FH-042S: the Mysteries this run has used every try on without a right answer, so the Trail page stops
 * naming one as the next stop and sends the player to its stand-in. Reads the attempt rows' count and
 * verdict only, never a guess. A failed or truncated read returns none, which only means the page keeps
 * showing the question; the claim door still refuses a locked answer on its own.
 */
export async function loadLockedMysteries(runId: string, profileId: string, missionKeys: readonly string[]): Promise<string[]> {
  if (missionKeys.length === 0) return []
  const client = db()
  const { data: run, error: runError } = await client.from('hunt_runs').select('id').eq('id', runId).eq('subject_profile_id', profileId).maybeSingle()
  if (runError || !run) return []
  const attempts = await client
    .from('hunt_claims')
    .select('mission_key, correct:policy_result->>correct', { count: 'exact' })
    .eq('run_id', runId)
    .in('mission_key', [...missionKeys])
    .like('evidence_id', 'answer:%')
  if (!completeRows(attempts)) return []
  const tally = new Map<string, { used: number; right: boolean }>()
  for (const a of attempts.data as { mission_key: unknown; correct: unknown }[]) {
    if (typeof a.mission_key !== 'string') continue
    const t = tally.get(a.mission_key) ?? { used: 0, right: false }
    tally.set(a.mission_key, { used: t.used + 1, right: t.right || a.correct === 'true' })
  }
  return [...tally].filter(([, t]) => !t.right && t.used >= MAX_ANSWER_ATTEMPTS).map(([key]) => key)
}

/** One complete read of a run's progress: every row's total (any disposition) and the credited missions.
 * The claim command compares the total under its run lock, so the credits and the count must come from
 * the same read. Null when the run is not the subject's or the read is truncated or malformed. */
export async function loadRunProgressSnapshot(runId: string, profileId: string): Promise<{ credits: Credit[]; total: number } | null> {
  const client = db()
  // Ownership first: a run id is not a secret, so the read is scoped to its subject.
  const { data: run, error: runError } = await client.from('hunt_runs').select('id').eq('id', runId).eq('subject_profile_id', profileId).maybeSingle()
  if (runError || !run) return null
  const progress = await client.from('hunt_progress').select('mission_key, disposition, accepted_at', { count: 'exact' }).eq('run_id', runId)
  if (!completeRows(progress)) return null
  const rows = progress.data as { mission_key: unknown; disposition?: unknown; accepted_at?: unknown }[]
  if (rows.some((row) => typeof row.mission_key !== 'string')) return null
  return {
    total: rows.length,
    // `at` orders two credits inside one exclusive group (FH-042): the earlier one is the run's choice.
    credits: rows.filter((row) => row.disposition === 'credited').map((row) => ({
      mission_key: row.mission_key as string,
      ...(typeof row.accepted_at === 'string' ? { at: row.accepted_at } : {}),
    })),
  }
}

type StopPoint = { missionKey: string; lat: number; lng: number; approximate: boolean }

/**
 * Where the stops a run already credited are, for the visited-stops map (FH-016T). The source is the
 * venue Space bound to the stop on the run's own version, at the precision that Space chose to publish.
 * The read is filtered by the credited keys in the query itself, so the place of a stop the player has
 * not reached never leaves the database. A stop with no venue Space, or a Space with no point, has no
 * pin. Any failed or truncated read gives no pins: the list of visited stops still shows.
 */
export async function loadVisitedStopPoints(scope: PlayerRunScope, credits: readonly Credit[]): Promise<StopPoint[]> {
  const keys = [...new Set(credits.map((credit) => credit.mission_key))]
  if (keys.length === 0) return []
  const client = db()
  const bound = await client
    .from('hunt_mission_placements')
    .select('mission_key, venue_space_id', { count: 'exact' })
    .eq('version_id', scope.versionId)
    .eq('hunt_id', scope.huntId)
    .in('mission_key', keys)
  if (!completeRows(bound)) return []
  const bindings = (bound.data as { mission_key: unknown; venue_space_id: unknown }[])
    .filter((row): row is { mission_key: string; venue_space_id: string } =>
      typeof row.mission_key === 'string' && keys.includes(row.mission_key) && typeof row.venue_space_id === 'string')
  const spaceIds = [...new Set(bindings.map((row) => row.venue_space_id))]
  if (spaceIds.length === 0) return []
  const spaces = await client.from('spaces').select('id, latitude, longitude, location_precision', { count: 'exact' }).in('id', spaceIds)
  if (!completeRows(spaces)) return []
  const byId = new Map((spaces.data as { id: string; latitude: unknown; longitude: unknown; location_precision: unknown }[]).map((row) => [row.id, row]))

  const points: StopPoint[] = []
  for (const binding of bindings) {
    const space = byId.get(binding.venue_space_id)
    // numeric columns arrive as strings from PostgREST; a missing half of the pair is no point at all.
    if (!space || space.latitude == null || space.longitude == null) continue
    const exact = resolvePrecision(space.location_precision) === 'exact'
    const point = exact ? { lat: Number(space.latitude), lng: Number(space.longitude) } : approximatePoint(Number(space.latitude), Number(space.longitude), space.id)
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) continue
    points.push({ missionKey: binding.mission_key, lat: point.lat, lng: point.lng, approximate: !exact })
  }
  return points
}
