// Programs on Channels (ADR-864) — the data layer.
//
// The model, in one breath: a Program IS a Channel that carries a blueprint.
//   - PROGRAM  = a `topical_channels` row with `template_id` set (the Chapter
//     blueprint, a `circle_templates` row). `owner_space_id` says who runs it:
//     NULL = Frequency-run, set = a Space-run Program.
//   - CHAPTER  = a circle with `topical_channel_id` pointing at the Program's
//     channel. Nothing new is invented: "Start a Chapter" reuses the Remix
//     lifecycle (remixTemplate -> private draft -> publish), with the draft
//     stamped into the channel so it lands there when it goes live.
//   - A Space-run Program is born by snapshotting the Space's flagship circle
//     into a Space-owned blueprint and stamping that circle in as Chapter one.
//
// Server-only (admin client). AUTHZ IS THE CALLER'S JOB: the action layer
// verifies space manage access before calling, exactly like the Remix flow.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { slugify } from '@/lib/utils'
import { distanceKm } from '@/lib/distance'
import { remixTemplate } from '@/lib/circles/remix'

// Untyped admin handle — the repo-wide service-role convention (ADR-246),
// mirroring lib/circles/templates-data.ts.
function db(): SupabaseClient {
  return createAdminClient()
}

export interface ProgramChannel {
  id: string
  name: string
  slug: string
  description: string | null
  coverImage: string | null
  category: string
  ownerSpaceId: string | null
  templateId: string
  /** The retire/pause switch (topical_channels.is_active). False = the Channel
   *  page 404s and startChapter refuses new Chapters (ADR-865). */
  isActive: boolean
}

export interface ChapterSummary {
  id: string
  name: string
  slug: string
  type: 'in-person' | 'online'
  status: string
  city: string | null
  neighborhood: string | null
  latitude: number | null
  longitude: number | null
  memberCount: number
  memberCap: number
  distanceKm: number | null
}

const CHANNEL_COLS = 'id, name, slug, description, cover_image, category, owner_space_id, template_id, is_active'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A channel row is a Program when it carries a blueprint. */
export function isProgram(row: { template_id?: string | null }): boolean {
  return typeof row.template_id === 'string' && row.template_id.length > 0
}

function rowToProgram(row: Record<string, unknown>): ProgramChannel {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description == null ? null : String(row.description),
    coverImage: row.cover_image == null ? null : String(row.cover_image),
    category: String(row.category),
    ownerSpaceId: row.owner_space_id == null ? null : String(row.owner_space_id),
    templateId: String(row.template_id),
    isActive: row.is_active !== false,
  }
}

/** Unique slug within a table (mirrors uniqueCircleSlug in lib/circles/remix.ts):
 *  slugify, one collision check, random suffix on a hit. */
async function uniqueSlugIn(admin: SupabaseClient, table: string, base: string, fallback: string): Promise<string> {
  let slug = slugify(base) || fallback
  const { data } = await admin.from(table).select('id').eq('slug', slug).maybeSingle()
  if (data) slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`
  return slug
}

/** Load a channel by id or slug and return it AS a Program, or null when it is not one. */
export async function getProgram(idOrSlug: string): Promise<ProgramChannel | null> {
  const admin = db()
  const col = UUID_RE.test(idOrSlug) ? 'id' : 'slug'
  const { data } = await admin.from('topical_channels').select(CHANNEL_COLS).eq(col, idOrSlug).maybeSingle()
  const row = data as Record<string, unknown> | null
  if (!row || !isProgram(row as { template_id?: string | null })) return null
  return rowToProgram(row)
}

/** Programs a Space runs (owner_space_id = spaceId). */
export async function listSpacePrograms(spaceId: string): Promise<ProgramChannel[]> {
  const admin = db()
  const { data } = await admin
    .from('topical_channels')
    .select(CHANNEL_COLS)
    .eq('owner_space_id', spaceId)
    .order('display_order')
  return ((data ?? []) as Record<string, unknown>[])
    .filter((row) => isProgram(row as { template_id?: string | null }))
    .map(rowToProgram)
}

/** Chapters of a Program: real (is_demo=false) circles in the channel, status
 *  forming|active, biggest rooms first. distanceKm stays null here; callers
 *  with a viewer location run the result through rankChaptersNear. */
export async function listChapters(channelId: string): Promise<ChapterSummary[]> {
  const admin = db()
  const { data } = await admin
    .from('circles')
    .select('id, name, slug, type, status, city, neighborhood, latitude, longitude, member_count, member_cap')
    .eq('topical_channel_id', channelId)
    .eq('is_demo', false)
    .in('status', ['forming', 'active'])
    .order('member_count', { ascending: false })
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    type: row.type === 'online' ? 'online' : 'in-person',
    status: String(row.status),
    city: row.city == null ? null : String(row.city),
    neighborhood: row.neighborhood == null ? null : String(row.neighborhood),
    latitude: typeof row.latitude === 'number' ? row.latitude : null,
    longitude: typeof row.longitude === 'number' ? row.longitude : null,
    memberCount: typeof row.member_count === 'number' ? row.member_count : 0,
    memberCap: typeof row.member_cap === 'number' ? row.member_cap : 0,
    distanceKm: null,
  }))
}

/** PURE "find one near you": fill distanceKm (lib/distance Haversine) and sort
 *  nearest-first. Chapters without coordinates keep distanceKm null and sort
 *  last, in their incoming order (stable). Never mutates the input. */
export function rankChaptersNear(chapters: ChapterSummary[], lat: number, lng: number): ChapterSummary[] {
  const located: ChapterSummary[] = []
  const unlocated: ChapterSummary[] = []
  for (const chapter of chapters) {
    if (chapter.latitude != null && chapter.longitude != null) {
      located.push({ ...chapter, distanceKm: distanceKm(lat, lng, chapter.latitude, chapter.longitude) })
    } else {
      unlocated.push({ ...chapter, distanceKm: null })
    }
  }
  // Array.prototype.sort is stable, so equal distances keep their incoming order.
  located.sort((a, b) => (a.distanceKm as number) - (b.distanceKm as number))
  return [...located, ...unlocated]
}

/** Start a Chapter: remix the Program's blueprint into a private draft the
 *  starter owns, stamped into the Program's channel so it lands there when
 *  published. Throws when the channel is not a Program. */
export async function startChapter(input: { channelId: string; profileId: string }): Promise<{ circleId: string; slug: string }> {
  const admin = db()
  const { data } = await admin
    .from('topical_channels')
    .select('id, template_id, is_active')
    .eq('id', input.channelId)
    .maybeSingle()
  const channel = data as { id: string; template_id: string | null; is_active: boolean } | null
  if (!channel) throw new Error('That Channel is not available.')
  // is_active is the retire switch: the page 404s an inactive channel, but this
  // action is directly callable, so the switch must hold here too (review fix,
  // ADR-865): a retired Program takes no new Chapters.
  if (!channel.is_active) throw new Error('This Program is not taking new Chapters right now.')
  if (!channel.template_id) {
    throw new Error('This Channel does not run a Program yet, so there is no Chapter blueprint to start from.')
  }

  const draft = await remixTemplate({ templateId: channel.template_id, profileId: input.profileId })

  // The stamp that makes the draft a Chapter: publish leaves it in the channel.
  const { error } = await admin
    .from('circles')
    .update({ topical_channel_id: input.channelId })
    .eq('id', draft.circleId)
  if (error) throw new Error(error.message)

  return { circleId: draft.circleId, slug: draft.slug }
}

/** Verify a channel is a Program (any owner), or throw. The STAFF twin of
 *  requireSpaceProgram (ADR-870): the action layer proves the caller holds
 *  channel.manage (staff, ADR-274) before calling, so ownership is not the
 *  gate — being a Program is. The Space path below is untouched. */
async function requireStaffProgram(
  admin: SupabaseClient,
  channelId: string,
): Promise<{ id: string; templateId: string; ownerSpaceId: string | null; isActive: boolean }> {
  const { data } = await admin
    .from('topical_channels')
    .select('id, owner_space_id, template_id, is_active')
    .eq('id', channelId)
    .maybeSingle()
  const row = data as { id: string; owner_space_id: string | null; template_id: string | null; is_active: boolean } | null
  if (!row || !isProgram(row)) throw new Error('That Channel does not run a Program.')
  return {
    id: String(row.id),
    templateId: String(row.template_id),
    ownerSpaceId: row.owner_space_id == null ? null : String(row.owner_space_id),
    isActive: row.is_active !== false,
  }
}

/** Verify a channel is a Program THIS Space runs, or throw. Every phase-2
 *  editor operation funnels through this: the action layer proves the caller
 *  manages the Space (ADR-274), and this proves the Space owns the Program. */
async function requireSpaceProgram(
  admin: SupabaseClient,
  spaceId: string,
  channelId: string,
): Promise<{ id: string; templateId: string; isActive: boolean }> {
  const { data } = await admin
    .from('topical_channels')
    .select('id, owner_space_id, template_id, is_active')
    .eq('id', channelId)
    .maybeSingle()
  const row = data as { id: string; owner_space_id: string | null; template_id: string | null; is_active: boolean } | null
  if (!row || !isProgram(row)) throw new Error('That Channel does not run a Program.')
  if (row.owner_space_id !== spaceId) {
    throw new Error('That Program belongs to a different Space.')
  }
  return { id: String(row.id), templateId: String(row.template_id), isActive: row.is_active !== false }
}

/** Load a Space's own live circle and snapshot its content into the blueprint
 *  field shape (circle_templates content columns). Shared by createSpaceProgram
 *  and refreshProgramBlueprint so the ownership + non-draft checks and the
 *  snapshot shape can never drift apart. Throws on a missing, foreign, or
 *  draft circle; display copy (name/one_liner/card/identity) is NOT included
 *  here, since it belongs to the Program, not the snapshot. */
async function snapshotCircleForBlueprint(
  admin: SupabaseClient,
  spaceId: string,
  sourceCircleId: string,
): Promise<Record<string, unknown>> {
  // The source must be this Space's own, live circle. A draft has not proven
  // anything yet; a circle from another Space is simply not theirs to franchise.
  const circle = await loadCircleForSnapshot(admin, sourceCircleId)
  if (!circle) throw new Error('That Circle is not available.')
  if (circle.space_id !== spaceId) {
    throw new Error('Pick a Circle this Space runs. That one belongs to a different Space.')
  }
  if (circle.status === 'draft') {
    throw new Error('Publish the Circle first. A draft cannot anchor a Program.')
  }
  return snapshotContent(admin, circle)
}

/** The STAFF twin (ADR-870): snapshot ANY live, real circle — no Space fence,
 *  because staff attach blueprints to platform-curated channels. Still refuses
 *  demo rows and drafts/archives: a Program blueprint snapshots something that
 *  actually runs. Shares loadCircleForSnapshot + snapshotContent with the Space
 *  path so the checks and the snapshot shape can never drift. */
async function snapshotAnyLiveCircleForBlueprint(
  admin: SupabaseClient,
  sourceCircleId: string,
): Promise<Record<string, unknown>> {
  const circle = await loadCircleForSnapshot(admin, sourceCircleId)
  if (!circle) throw new Error('That Circle is not available.')
  if (circle.is_demo === true) throw new Error('Pick a real Circle. A demo cannot anchor a Program.')
  if (circle.status === 'draft') {
    throw new Error('Publish the Circle first. A draft cannot anchor a Program.')
  }
  if (circle.status === 'archived') {
    throw new Error('That Circle is archived. Pick one that is still running.')
  }
  return snapshotContent(admin, circle)
}

interface SnapshotSourceCircle {
  id: string
  space_id: string | null
  status: string
  about: string | null
  primary_pillar: string | null
  is_demo?: boolean
}

async function loadCircleForSnapshot(
  admin: SupabaseClient,
  sourceCircleId: string,
): Promise<SnapshotSourceCircle | null> {
  const { data } = await admin
    .from('circles')
    .select('id, space_id, status, about, primary_pillar, is_demo')
    .eq('id', sourceCircleId)
    .maybeSingle()
  return (data as SnapshotSourceCircle | null) ?? null
}

/** The content half of the snapshot, shared by both gates above. The rich
 *  content lives on the 1:1 circle_profiles row when the circle came through
 *  the builder; sane empty-json fallbacks otherwise. Display copy
 *  (name/one_liner/card/identity) is NOT included: it belongs to the Program. */
async function snapshotContent(
  admin: SupabaseClient,
  circle: SnapshotSourceCircle,
): Promise<Record<string, unknown>> {
  const { data: profileData } = await admin
    .from('circle_profiles')
    .select('meetup, gathering, agreements, pillars_inside, format, size_label, thread, remix_options')
    .eq('circle_id', circle.id)
    .maybeSingle()
  const profile = (profileData ?? {}) as Record<string, unknown>

  return {
    about: circle.about ?? null,
    primary_pillar: circle.primary_pillar ?? 'mind',
    pillars_inside: profile.pillars_inside ?? {},
    meetup: profile.meetup ?? {},
    gathering: profile.gathering ?? {},
    thread: profile.thread ?? null,
    format: profile.format ?? null,
    size_label: profile.size_label ?? null,
    agreements: profile.agreements ?? [],
    remix_options: profile.remix_options ?? [],
  }
}

/** Create a Space-run Program: snapshot the Space's flagship circle into a
 *  Space-owned blueprint (circle_templates.owner_space_id = spaceId), create
 *  the Program channel (owner_space_id + template_id set), and stamp the
 *  source circle into the channel as its first Chapter.
 *
 *  AUTHZ IS THE CALLER'S JOB: the action layer verifies space manage access
 *  before calling, same as remix. */
export async function createSpaceProgram(input: {
  spaceId: string
  profileId: string
  name: string
  oneLiner: string
  sourceCircleId: string
  category?: string // one of the existing topical_channels categories; default 'business-support'
}): Promise<{ channelId: string; channelSlug: string; templateId: string }> {
  const admin = db()

  // ONE Program per Space (review fix, ADR-865). The DB backs this with a
  // unique partial index on topical_channels(owner_space_id), so a double
  // submit cannot mint two public channels; this pre-check just gives the
  // second click a sentence instead of a constraint error.
  const existing = await listSpacePrograms(input.spaceId)
  if (existing.length > 0) {
    throw new Error('This Space already runs a Program. Edit the one you have instead.')
  }

  // Ownership + non-draft checks and the content snapshot, shared with
  // refreshProgramBlueprint so the two paths can never drift.
  const snapshot = await snapshotCircleForBlueprint(admin, input.spaceId, input.sourceCircleId)

  // 1. The blueprint: a Space-owned circle_templates row. owner_space_id keeps
  //    it out of the global Starter Circles catalog (the list reads filter
  //    owner_space_id IS NULL); remix still loads it through getTemplateById.
  //    The card copy fields ride the one-liner; updateSpaceProgram (ADR-869)
  //    keeps them in step with the Channel's display copy after creation.
  const templateSlug = await uniqueSlugIn(admin, 'circle_templates', input.name, 'program')
  const { data: templateRow, error: templateError } = await admin
    .from('circle_templates')
    .insert({
      slug: templateSlug,
      name: input.name,
      one_liner: input.oneLiner,
      identity: input.oneLiner,
      audience: '',
      card: input.oneLiner,
      ...snapshot,
      callouts: [],
      owner_space_id: input.spaceId,
      is_active: true,
      // The blueprint discriminator (ADR-870, migration 20270113000000): a
      // Program blueprint is never a Starter. Space rows were already fenced by
      // the owner filter; the flag keeps the meaning uniform across owners.
      program_only: true,
      display_order: 1000, // well past the staff catalog; never surfaces there anyway
    })
    .select('id')
    .single()
  if (templateError || !templateRow) {
    throw new Error(templateError?.message ?? 'Could not save the Program blueprint.')
  }
  const templateId = String((templateRow as { id: string }).id)

  // 2. The Program channel itself: blueprint + owner make it a Program.
  const channelSlug = await uniqueSlugIn(admin, 'topical_channels', input.name, 'program')
  const { data: channelRow, error: channelError } = await admin
    .from('topical_channels')
    .insert({
      name: input.name,
      slug: channelSlug,
      description: input.oneLiner,
      category: input.category ?? 'business-support',
      owner_space_id: input.spaceId,
      template_id: templateId,
      is_active: true,
      display_order: 1000,
    })
    .select('id, slug')
    .single()
  if (channelError || !channelRow) {
    // No transaction spans the two inserts, so a channel failure would strand
    // an is_active Space blueprint. Best-effort cleanup keeps nothing public.
    await admin.from('circle_templates').delete().eq('id', templateId)
    throw new Error(channelError?.message ?? 'Could not create the Program.')
  }
  const channel = channelRow as { id: string; slug: string }

  // 3. The flagship becomes Chapter one.
  const { error: stampError } = await admin
    .from('circles')
    .update({ topical_channel_id: channel.id })
    .eq('id', input.sourceCircleId)
  if (stampError) throw new Error(stampError.message)

  return { channelId: String(channel.id), channelSlug: String(channel.slug), templateId }
}

/** Edit a Space's Program display copy (ADR-869): name, one liner, cover.
 *  Patches the Channel row AND keeps the blueprint's display copy in step
 *  (circle_templates name/one_liner/card/identity ride the same patch), so the
 *  Channel page and the Chapter-start flow never tell two different stories.
 *
 *  The channel slug NEVER changes here: renaming a Program keeps its
 *  /channels/<slug> address, so every shared link keeps working.
 *
 *  AUTHZ IS THE CALLER'S JOB for the Space side (action layer, ADR-274);
 *  channel ownership is verified HERE against the DB. */
export async function updateSpaceProgram(input: {
  spaceId: string
  profileId: string
  channelId: string
  patch: ProgramCopyPatch
}): Promise<void> {
  const admin = db()
  const program = await requireSpaceProgram(admin, input.spaceId, input.channelId)
  await applyProgramCopyPatch(admin, input.channelId, program.templateId, input.patch)
}

export interface ProgramCopyPatch {
  name?: string
  oneLiner?: string
  coverImage?: string | null
}

/** The one copy-patch body (shared by the Space and staff editors, ADR-870):
 *  patches the Channel row AND keeps the blueprint's display copy in step, and
 *  NEVER touches the channel slug (shared links keep working). */
async function applyProgramCopyPatch(
  admin: SupabaseClient,
  channelId: string,
  templateId: string,
  patch: ProgramCopyPatch,
): Promise<void> {
  const channelPatch: Record<string, unknown> = {}
  const blueprintPatch: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    channelPatch.name = patch.name
    blueprintPatch.name = patch.name
  }
  if (patch.oneLiner !== undefined) {
    channelPatch.description = patch.oneLiner
    // The blueprint's card copy fields ride the one-liner (same as create).
    blueprintPatch.one_liner = patch.oneLiner
    blueprintPatch.card = patch.oneLiner
    blueprintPatch.identity = patch.oneLiner
  }
  if (patch.coverImage !== undefined) channelPatch.cover_image = patch.coverImage
  if (Object.keys(channelPatch).length === 0) return

  const { error: channelError } = await admin
    .from('topical_channels')
    .update(channelPatch)
    .eq('id', channelId)
  if (channelError) throw new Error(channelError.message)

  if (Object.keys(blueprintPatch).length > 0) {
    const { error: blueprintError } = await admin
      .from('circle_templates')
      .update(blueprintPatch)
      .eq('id', templateId)
    if (blueprintError) throw new Error(blueprintError.message)
  }
}

/** Pause or resume a Space's Program (ADR-869): flips topical_channels.is_active,
 *  the same retire switch startChapter already respects (ADR-865). While paused,
 *  the Channel page 404s and no new Chapters can start; existing Chapters and
 *  their members are untouched, and resuming brings the page straight back. */
export async function setProgramPaused(input: {
  spaceId: string
  profileId: string
  channelId: string
  paused: boolean
}): Promise<void> {
  const admin = db()
  await requireSpaceProgram(admin, input.spaceId, input.channelId)
  const { error } = await admin
    .from('topical_channels')
    .update({ is_active: !input.paused })
    .eq('id', input.channelId)
  if (error) throw new Error(error.message)
}

/** Re-snapshot a Program's blueprint from one of the Space's live circles
 *  (ADR-869). Same ownership + non-draft checks as createSpaceProgram, via the
 *  shared snapshotCircleForBlueprint helper. The blueprint row is rewritten in
 *  place; display copy (name/one_liner/card/identity) stays as-is, since that
 *  is updateSpaceProgram's job.
 *
 *  Existing Chapters are untouched: a Chapter is a real circle that already
 *  copied the old snapshot at remix time, so a blueprint change affects only
 *  FUTURE Chapters. */
export async function refreshProgramBlueprint(input: {
  spaceId: string
  profileId: string
  channelId: string
  sourceCircleId: string
}): Promise<void> {
  const admin = db()
  const program = await requireSpaceProgram(admin, input.spaceId, input.channelId)
  const snapshot = await snapshotCircleForBlueprint(admin, input.spaceId, input.sourceCircleId)
  const { error } = await admin
    .from('circle_templates')
    .update(snapshot)
    .eq('id', program.templateId)
  if (error) throw new Error(error.message)
}

// ─── The STAFF Program lifecycle (ADR-870) ────────────────────────────────────
// Staff can make ANY channel a Program — including a Frequency-run one with no
// owner Space (owner_space_id NULL), which the Space path can never reach.
// AUTHZ IS THE CALLER'S JOB: the /channels/[id]/manage action layer verifies
// channel.manage (staff, ADR-274) before calling any of these. The Space path
// above is deliberately untouched.

/** How a staff attach sources its blueprint: snapshot a live circle, or clone a
 *  Starter template (the original stays in the catalog untouched). */
export type BlueprintSource =
  | { kind: 'circle'; circleId: string }
  | { kind: 'starter'; templateId: string }

/** Attach a Chapter blueprint to a channel, making it a Program (ADR-870).
 *
 *  Refuses a channel that already runs one. The blueprint row inherits the
 *  channel's owner_space_id (NULL for a Frequency-run channel) and is stamped
 *  `program_only` (migration 20270113000000) so a NULL-owner blueprint can
 *  never leak into the Starter Circles catalog, whose list reads filter
 *  owner IS NULL. is_active stays true — Remix needs it live to start
 *  Chapters. Display copy rides the CHANNEL's name + description, same as the
 *  Space path: the blueprint tells the Channel's story, not its source's. */
export async function attachProgramBlueprint(input: {
  channelId: string
  profileId: string
  source: BlueprintSource
}): Promise<{ templateId: string }> {
  const admin = db()

  const { data } = await admin
    .from('topical_channels')
    .select('id, name, description, owner_space_id, template_id')
    .eq('id', input.channelId)
    .maybeSingle()
  const channel = data as
    | { id: string; name: string; description: string | null; owner_space_id: string | null; template_id: string | null }
    | null
  if (!channel) throw new Error('That Channel is not available.')
  if (isProgram(channel)) throw new Error('This Channel already runs a Program.')

  // The content columns, by source.
  let content: Record<string, unknown>
  let fallbackOneLiner = ''
  if (input.source.kind === 'circle') {
    // Snapshot ANY live, real circle (no Space fence — the staff twin).
    content = {
      ...(await snapshotAnyLiveCircleForBlueprint(admin, input.source.circleId)),
      callouts: [],
    }
  } else {
    // CLONE the Starter's content into a new program_only row. The original is
    // never referenced or mutated: it must keep living in the catalog, and a
    // Program must own its blueprint outright (detach retires the copy only).
    const { data: tplData } = await admin
      .from('circle_templates')
      .select(
        'id, name, one_liner, identity, audience, card, about, primary_pillar, pillars_inside, meetup, gathering, thread, format, size_label, agreements, remix_options, callouts, image_url, recommended_journey_pillar, owner_space_id, program_only, is_active',
      )
      .eq('id', input.source.templateId)
      .maybeSingle()
    const tpl = tplData as Record<string, unknown> | null
    if (!tpl) throw new Error('That Starter Circle is not available.')
    // Only a real catalog Starter clones: never another Program's blueprint
    // (owned or program_only) and never a retired row.
    if (tpl.owner_space_id != null || tpl.program_only === true || tpl.is_active === false) {
      throw new Error('Pick a Starter Circle from the catalog.')
    }
    fallbackOneLiner = String(tpl.one_liner ?? '')
    content = {
      about: tpl.about ?? null,
      primary_pillar: tpl.primary_pillar ?? 'mind',
      pillars_inside: tpl.pillars_inside ?? {},
      meetup: tpl.meetup ?? {},
      gathering: tpl.gathering ?? {},
      thread: tpl.thread ?? null,
      format: tpl.format ?? null,
      size_label: tpl.size_label ?? null,
      agreements: tpl.agreements ?? [],
      remix_options: tpl.remix_options ?? [],
      callouts: tpl.callouts ?? [],
      image_url: tpl.image_url ?? null,
      recommended_journey_pillar: tpl.recommended_journey_pillar ?? null,
    }
  }

  const oneLiner = (channel.description ?? '').trim() || fallbackOneLiner
  const templateSlug = await uniqueSlugIn(admin, 'circle_templates', channel.name, 'program')
  const { data: templateRow, error: templateError } = await admin
    .from('circle_templates')
    .insert({
      slug: templateSlug,
      name: channel.name,
      one_liner: oneLiner,
      identity: oneLiner,
      audience: '',
      card: oneLiner,
      ...content,
      owner_space_id: channel.owner_space_id,
      is_active: true,
      program_only: true,
      display_order: 1000,
    })
    .select('id')
    .single()
  if (templateError || !templateRow) {
    throw new Error(templateError?.message ?? 'Could not save the Program blueprint.')
  }
  const templateId = String((templateRow as { id: string }).id)

  // The stamp that makes the channel a Program.
  const { error: stampError } = await admin
    .from('topical_channels')
    .update({ template_id: templateId })
    .eq('id', input.channelId)
  if (stampError) {
    // No transaction spans the insert + stamp; never strand a live blueprint.
    await admin.from('circle_templates').delete().eq('id', templateId)
    throw new Error(stampError.message)
  }

  return { templateId }
}

/** Detach a channel's blueprint (ADR-870): clears template_id and soft-retires
 *  the blueprint row (is_active false; program_only keeps it fenced from the
 *  catalog forever). The channel goes back to a plain focus area — its circles,
 *  members, and room are untouched, and existing Chapters keep everything (a
 *  Chapter is a real circle that copied the snapshot at remix time). */
export async function detachProgramBlueprint(input: {
  channelId: string
  profileId: string
}): Promise<void> {
  const admin = db()
  const program = await requireStaffProgram(admin, input.channelId)

  const { error: channelError } = await admin
    .from('topical_channels')
    .update({ template_id: null })
    .eq('id', input.channelId)
  if (channelError) throw new Error(channelError.message)

  const { error: blueprintError } = await admin
    .from('circle_templates')
    .update({ is_active: false })
    .eq('id', program.templateId)
  if (blueprintError) throw new Error(blueprintError.message)
}

/** The staff twin of updateSpaceProgram (ADR-869 → ADR-870): same copy-patch
 *  body (channel + blueprint together, slug never moves), gated by being a
 *  Program instead of Space ownership. */
export async function updateProgramForStaff(input: {
  channelId: string
  profileId: string
  patch: ProgramCopyPatch
}): Promise<void> {
  const admin = db()
  const program = await requireStaffProgram(admin, input.channelId)
  await applyProgramCopyPatch(admin, input.channelId, program.templateId, input.patch)
}

/** The staff twin of setProgramPaused: flips the SAME is_active retire switch
 *  startChapter respects (ADR-865), on any Program. */
export async function setProgramPausedForStaff(input: {
  channelId: string
  profileId: string
  paused: boolean
}): Promise<void> {
  const admin = db()
  await requireStaffProgram(admin, input.channelId)
  const { error } = await admin
    .from('topical_channels')
    .update({ is_active: !input.paused })
    .eq('id', input.channelId)
  if (error) throw new Error(error.message)
}

/** The staff twin of refreshProgramBlueprint: re-snapshot from ANY live, real
 *  circle. Display copy stays as-is (updateProgramForStaff's job); existing
 *  Chapters are untouched (they copied the old snapshot at remix time). */
export async function refreshProgramBlueprintForStaff(input: {
  channelId: string
  profileId: string
  sourceCircleId: string
}): Promise<void> {
  const admin = db()
  const program = await requireStaffProgram(admin, input.channelId)
  const snapshot = await snapshotAnyLiveCircleForBlueprint(admin, input.sourceCircleId)
  const { error } = await admin
    .from('circle_templates')
    .update(snapshot)
    .eq('id', program.templateId)
  if (error) throw new Error(error.message)
}
