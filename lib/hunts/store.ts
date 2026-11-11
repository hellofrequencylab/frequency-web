/**
 * The Trail draft store (FH-013): the IO half of lib/hunts/draft.ts over the FH-005 tables.
 *
 * Every Hunt table is service role only (RLS on, no policy, browser grants revoked), so THIS file is
 * the tenancy wall: every read is scoped to one Hunt the actor may touch, and every write runs after
 * `authorizeHunt`, which asks lib/hunts/authz.ts `decide()` with rows read fresh for this request.
 * The actions in app/(main)/hunts/actions.ts establish the caller and the authoring switch; this
 * module never trusts a profile id it did not get from them.
 *
 * Where a draft lives. The FH-005 schema has no draft column: a draft is a `hunt_versions` row at
 * status `draft` whose `policy.trail` holds the TrailDraft (title, hook, area, audience, stops, the
 * route-test marker, the permission confirm). Publishing freezes that same row: the missions and
 * rule groups are materialized into their tables, the status flips to `published` with a content
 * hash, and `hunts.current_version_id` points at it. A later edit opens the NEXT version row, so a
 * published version is never written again (ADR fragment in docs/ledger/adr/).
 *
 * Concurrency. `hunts.revision` is the only clock: every save is one conditional update
 * (`revision = base + 1 where id = ? and revision = ?`). A tab that lost the race gets zero rows,
 * reads the live revision and reports a conflict; the content write runs only after that update
 * applied. The two statements are not one transaction, so a crash between them leaves a bumped
 * revision over the older content, which the next save in any tab reports as a conflict and the
 * reload repairs. Nothing is lost either way.
 *
 * Preview never comes here: lib/hunts/draft.ts `previewTrail` evaluates in memory.
 */
import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { decide, type HuntAction, type RoleGrant } from '@/lib/hunts/authz'
import { slugify } from '@/lib/utils'
import {
  canonicalContent,
  parseTrailDraft,
  publishChecklist,
  publishRows,
  type ChecklistItem,
  type DraftStore,
  type TrailDraft,
} from './draft'

// The Hunt tables are not in the generated database types yet (FH-005 landed them service role
// only), so they are reached through the untyped client, like lib/spaces/provision.ts does.
// eslint-disable-next-line no-restricted-syntax -- the FH-005 hunt tables are not in the generated types yet (ADR-246 exception)
const db = () => createAdminClient() as unknown as SupabaseClient

type HuntRow = {
  id: string
  slug: string
  visibility: 'private' | 'unlisted' | 'public'
  owner_profile_id: string | null
  owner_space_id: string | null
  status: string
  current_version_id: string | null
  revision: number
}
const HUNT_COLS = 'id, slug, visibility, owner_profile_id, owner_space_id, status, current_version_id, revision'

type VersionRow = {
  id: string
  version_no: number
  status: 'draft' | 'validated' | 'published' | 'superseded'
  policy: Record<string, unknown> | null
  content_hash: string | null
  published_at: string | null
}
const VERSION_COLS = 'id, version_no, status, policy, content_hash, published_at'

export type PublishVisibility = 'unlisted' | 'public'

/** What the editor screens render. The draft is the latest version's content, published or not. */
export type TrailEditorState = {
  huntId: string
  slug: string
  revision: number
  status: string
  visibility: HuntRow['visibility']
  versionNo: number
  /** True when the latest version is frozen: the next save opens a new version. */
  published: boolean
  publishedAt: string | null
  canPublish: boolean
  draft: TrailDraft
}

export type Actor = { profileId: string }

// ── The gate ─────────────────────────────────────────────────────────────────────────────────

async function loadHunt(client: SupabaseClient, huntId: string): Promise<HuntRow | null> {
  const { data } = await client.from('hunts').select(HUNT_COLS).eq('id', huntId).maybeSingle()
  return (data as HuntRow | null) ?? null
}

async function loadGrants(client: SupabaseClient, huntId: string): Promise<RoleGrant[]> {
  const { data } = await client
    .from('hunt_roles')
    .select('hunt_id, profile_id, role, expires_at, revoked_at')
    .eq('hunt_id', huntId)
  const rows = (data ?? []) as { hunt_id: string; profile_id: string; role: RoleGrant['role']; expires_at: string | null; revoked_at: string | null }[]
  return rows.map((r) => ({ huntId: r.hunt_id, profileId: r.profile_id, role: r.role, expiresAt: r.expires_at, revokedAt: r.revoked_at }))
}

/**
 * The one gate every read and write here runs behind: the Hunt row and its grants, read fresh, put
 * through `decide()`. Null when the Hunt is missing or the actor may not take the action, and the
 * caller treats both the same (a 404), so an outsider cannot tell a Hunt exists.
 */
async function authorizeHunt(client: SupabaseClient, huntId: string, actor: Actor, action: HuntAction): Promise<HuntRow | null> {
  const hunt = await loadHunt(client, huntId)
  if (!hunt) return null
  const grants = await loadGrants(client, huntId)
  const verdict = decide(action, {
    hunt: { id: hunt.id, visibility: hunt.visibility, ownerProfileId: hunt.owner_profile_id, ownerSpaceId: hunt.owner_space_id },
    grants,
    partners: [],
    actor: { profileId: actor.profileId },
    now: new Date().toISOString(),
  })
  return verdict.allow ? hunt : null
}

/**
 * The Hunt row for an actor who may take `action` on it, or null (missing and forbidden answer the same).
 * The commerce screens (FH-036S, FH-038S) use this so they ask the same gate as the editor.
 */
export async function authorizeHuntAction(
  huntId: string,
  actor: Actor,
  action: HuntAction,
): Promise<{ id: string; ownerSpaceId: string | null; currentVersionId: string | null } | null> {
  const hunt = await authorizeHunt(db(), huntId, actor, action)
  return hunt ? { id: hunt.id, ownerSpaceId: hunt.owner_space_id, currentVersionId: hunt.current_version_id ?? null } : null
}

async function latestVersion(client: SupabaseClient, huntId: string): Promise<VersionRow | null> {
  const { data } = await client
    .from('hunt_versions')
    .select(VERSION_COLS)
    .eq('hunt_id', huntId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as VersionRow | null) ?? null
}

const trailOf = (v: VersionRow | null): TrailDraft => parseTrailDraft(v?.policy?.trail)

// ── Create ───────────────────────────────────────────────────────────────────────────────────

/** A slug from the title plus six random characters, inside the `^[a-z0-9-]{3,80}$` check. */
function draftSlug(title: string): string {
  const base = slugify(title).replace(/^-+|-+$/g, '').slice(0, 60) || 'trail'
  return `${base}-${randomBytes(4).toString('hex').slice(0, 6)}`
}

/**
 * THE resident's Trail road: a private draft Hunt the caller owns, with its first draft version.
 * Called only as the commit of a governed create (createTrailAction), which established the caller
 * and the authoring switch. Throws on a database refusal so the governed layer reports it.
 */
export async function createTrailDraft(input: { ownerProfileId: string; draft: TrailDraft }): Promise<{ huntId: string; slug: string }> {
  const client = db()
  let hunt: { id: string; slug: string } | null = null
  let lastError = 'The trail could not be started.'
  for (let attempt = 0; attempt < 3 && !hunt; attempt++) {
    const slug = draftSlug(input.draft.title)
    const { data, error } = await client
      .from('hunts')
      .insert({ slug, visibility: 'private', owner_profile_id: input.ownerProfileId, created_by: input.ownerProfileId, status: 'draft', revision: 1 })
      .select('id, slug')
      .single()
    if (!error && data) hunt = data as { id: string; slug: string }
    else lastError = error?.message ?? lastError
  }
  if (!hunt) throw new Error(lastError)
  const { error } = await client.from('hunt_versions').insert({
    hunt_id: hunt.id,
    version_no: 1,
    status: 'draft',
    policy: { trail: { ...input.draft, routeTestedAtRevision: null } },
    created_by: input.ownerProfileId,
  })
  if (error) {
    await client.from('hunts').delete().eq('id', hunt.id)
    throw new Error(error.message)
  }
  return { huntId: hunt.id, slug: hunt.slug }
}

// ── Read ─────────────────────────────────────────────────────────────────────────────────────

/** The editor's view of one Hunt, or null when it is missing or not the actor's to edit. */
export async function loadTrail(huntId: string, actor: Actor): Promise<TrailEditorState | null> {
  const client = db()
  const hunt = await authorizeHunt(client, huntId, actor, 'edit_draft')
  if (!hunt) return null
  const version = await latestVersion(client, huntId)
  const canPublish = (await authorizeHunt(client, huntId, actor, 'publish')) !== null
  return {
    huntId: hunt.id,
    slug: hunt.slug,
    revision: hunt.revision,
    status: hunt.status,
    visibility: hunt.visibility,
    versionNo: version?.version_no ?? 1,
    published: version?.status === 'published' || version?.status === 'superseded',
    publishedAt: version?.published_at ?? null,
    canPublish,
    draft: trailOf(version),
  }
}

type TrailSummary = { huntId: string; title: string; status: string; visibility: HuntRow['visibility']; stops: number; updatedAt: string | null }

/** The Hunts this profile owns, newest first. Only the owner's own rows; grants come later. */
export async function listMyTrails(profileId: string): Promise<TrailSummary[]> {
  const client = db()
  const { data } = await client
    .from('hunts')
    .select(`${HUNT_COLS}, updated_at`)
    .eq('owner_profile_id', profileId)
    .order('updated_at', { ascending: false })
    .limit(50)
  const hunts = (data ?? []) as (HuntRow & { updated_at: string | null })[]
  if (hunts.length === 0) return []
  const { data: versions } = await client
    .from('hunt_versions')
    .select(`hunt_id, ${VERSION_COLS}`)
    .in('hunt_id', hunts.map((h) => h.id))
    .order('version_no', { ascending: false })
  const latest = new Map<string, VersionRow>()
  for (const v of (versions ?? []) as (VersionRow & { hunt_id: string })[]) {
    if (!latest.has(v.hunt_id)) latest.set(v.hunt_id, v)
  }
  return hunts.map((h) => {
    const draft = trailOf(latest.get(h.id) ?? null)
    return { huntId: h.id, title: draft.title, status: h.status, visibility: h.visibility, stops: draft.stops.length, updatedAt: h.updated_at }
  })
}

// ── Save ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The one conditional update: bump the revision only when the stored one is what the tab saw.
 * Zero rows means another tab got there first; the caller reads the live revision and reports it.
 */
async function bumpRevision(client: SupabaseClient, huntId: string, baseRevision: number): Promise<{ applied: true; revision: number } | { applied: false; currentRevision: number }> {
  const { data } = await client
    .from('hunts')
    .update({ revision: baseRevision + 1, updated_at: new Date().toISOString() })
    .eq('id', huntId)
    .eq('revision', baseRevision)
    .select('revision')
  const rows = (data ?? []) as { revision: number }[]
  if (rows.length === 1) return { applied: true, revision: rows[0].revision }
  const live = await loadHunt(client, huntId)
  return { applied: false, currentRevision: live?.revision ?? baseRevision }
}

/** Write the draft into the open version, or open the next version when the latest is frozen. */
async function writeTrail(client: SupabaseClient, huntId: string, actorId: string, draft: TrailDraft): Promise<void> {
  const version = await latestVersion(client, huntId)
  if (version && version.status === 'draft') {
    const { error } = await client
      .from('hunt_versions')
      .update({ policy: { ...(version.policy ?? {}), trail: draft } })
      .eq('id', version.id)
      .eq('hunt_id', huntId)
      .eq('status', 'draft')
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await client.from('hunt_versions').insert({
    hunt_id: huntId,
    version_no: (version?.version_no ?? 0) + 1,
    status: 'draft',
    policy: { trail: draft },
    created_by: actorId,
  })
  if (error) throw new Error(error.message)
}

/** The DraftStore lib/hunts/draft.ts `saveDraft` writes through, bound to one authorized actor. */
export function trailStoreFor(actor: Actor): DraftStore {
  return {
    async update(huntId, baseRevision, draft) {
      const client = db()
      const hunt = await authorizeHunt(client, huntId, actor, 'edit_draft')
      if (!hunt) return { applied: false, currentRevision: baseRevision }
      const bumped = await bumpRevision(client, huntId, baseRevision)
      if (!bumped.applied) return bumped
      await writeTrail(client, huntId, actor.profileId, draft)
      return bumped
    },
  }
}

/**
 * Record that the route test ran on `revision`. Not an edit: the revision does not move, so the
 * marker can equal it. Refused when the tab is behind, because a test of an older draft proves
 * nothing about the current one.
 */
export async function markRouteTested(huntId: string, actor: Actor, revision: number): Promise<{ ok: true } | { ok: false; currentRevision: number }> {
  const client = db()
  const hunt = await authorizeHunt(client, huntId, actor, 'edit_draft')
  if (!hunt) return { ok: false, currentRevision: revision }
  if (hunt.revision !== revision) return { ok: false, currentRevision: hunt.revision }
  const version = await latestVersion(client, huntId)
  if (!version || version.status !== 'draft') return { ok: false, currentRevision: hunt.revision }
  const trail = { ...trailOf(version), routeTestedAtRevision: revision }
  const { error } = await client
    .from('hunt_versions')
    .update({ policy: { ...(version.policy ?? {}), trail } })
    .eq('id', version.id)
    .eq('hunt_id', huntId)
    .eq('status', 'draft')
  if (error) throw new Error(error.message)
  return { ok: true }
}

// ── Publish ──────────────────────────────────────────────────────────────────────────────────

const contentHash = (draft: TrailDraft): string => createHash('sha256').update(canonicalContent(draft)).digest('hex')

export type PublishResult =
  | { ok: true; versionNo: number; contentHash: string; visibility: PublishVisibility }
  | { ok: false; reason: 'conflict'; currentRevision: number }
  | { ok: false; reason: 'checklist'; items: ChecklistItem[] }
  | { ok: false; reason: 'forbidden' }

/**
 * Freeze the open draft version as the published one. Order: the revision bump first (so a stale
 * tab is refused before anything is written), then the missions and rule groups into their
 * tables, then the version flips to `published` with its content hash, then the Hunt points at it.
 * Every row write is idempotent on its keys, so a retry after a failure half way completes rather
 * than duplicating. A published version is never updated again: the next edit opens version N+1.
 */
export async function publishTrail(
  huntId: string,
  actor: Actor,
  baseRevision: number,
  visibility: PublishVisibility,
  /** The permission confirm is part of the publish tap, not a draft edit, so it cannot clear the route test. */
  permissionConfirmed: boolean,
): Promise<PublishResult> {
  const client = db()
  const hunt = await authorizeHunt(client, huntId, actor, 'publish')
  if (!hunt) return { ok: false, reason: 'forbidden' }
  const version = await latestVersion(client, huntId)
  if (!version || version.status !== 'draft') return { ok: false, reason: 'conflict', currentRevision: hunt.revision }
  const draft: TrailDraft = { ...trailOf(version), permissionConfirmed }
  const checklist = publishChecklist(draft, hunt.revision)
  if (hunt.revision !== baseRevision) return { ok: false, reason: 'conflict', currentRevision: hunt.revision }
  if (!checklist.ok) return { ok: false, reason: 'checklist', items: checklist.items }

  const bumped = await bumpRevision(client, huntId, baseRevision)
  if (!bumped.applied) return { ok: false, reason: 'conflict', currentRevision: bumped.currentRevision }

  const rows = publishRows(draft)
  const missions = rows.missions.map((m) => ({ ...m, version_id: version.id, hunt_id: huntId }))
  const { error: missionError } = await client.from('hunt_missions').upsert(missions, { onConflict: 'version_id,mission_key' })
  if (missionError) throw new Error(missionError.message)

  // Rule groups have generated ids, so a retry clears this version's groups before writing them.
  await client.from('hunt_rule_groups').delete().eq('version_id', version.id).eq('hunt_id', huntId)
  for (const g of rows.groups) {
    const { data, error } = await client
      .from('hunt_rule_groups')
      .insert({ version_id: version.id, hunt_id: huntId, target_mission_key: g.target_mission_key, target_finish: g.target_finish, logic: g.logic, group_key: g.key })
      .select('id')
      .single()
    if (error || !data) throw new Error(error?.message ?? 'rule group')
    const groupId = (data as { id: string }).id
    const { error: memberError } = await client
      .from('hunt_rule_group_members')
      .insert(g.members.map((member_mission_key) => ({ group_id: groupId, version_id: version.id, member_mission_key })))
    if (memberError) throw new Error(memberError.message)
  }

  const hash = contentHash(draft)
  const publishedAt = new Date().toISOString()
  const { error: flipError } = await client
    .from('hunt_versions')
    .update({ status: 'published', content_hash: hash, published_at: publishedAt, policy: { ...(version.policy ?? {}), trail: draft } })
    .eq('id', version.id)
    .eq('hunt_id', huntId)
    .eq('status', 'draft')
  if (flipError) throw new Error(flipError.message)

  const { error: huntError } = await client
    .from('hunts')
    .update({ current_version_id: version.id, status: 'live', visibility, updated_at: publishedAt })
    .eq('id', huntId)
  if (huntError) throw new Error(huntError.message)

  return { ok: true, versionNo: version.version_no, contentHash: hash, visibility }
}
