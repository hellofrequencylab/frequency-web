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

const CHANNEL_COLS = 'id, name, slug, description, cover_image, category, owner_space_id, template_id'

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
    throw new Error('This Space already runs a Program. Changes go through the crew.')
  }

  // The flagship must be this Space's own, live circle. A draft has not proven
  // anything yet; a circle from another Space is simply not theirs to franchise.
  const { data: circleData } = await admin
    .from('circles')
    .select('id, space_id, status, about, primary_pillar')
    .eq('id', input.sourceCircleId)
    .maybeSingle()
  const circle = circleData as
    | { id: string; space_id: string | null; status: string; about: string | null; primary_pillar: string | null }
    | null
  if (!circle) throw new Error('That Circle is not available.')
  if (circle.space_id !== input.spaceId) {
    throw new Error('Pick a Circle this Space runs. That one belongs to a different Space.')
  }
  if (circle.status === 'draft') {
    throw new Error('Publish the Circle first. A draft cannot anchor a Program.')
  }

  // The rich content lives on the 1:1 circle_profiles row when the circle came
  // through the builder; sane empty-json fallbacks otherwise.
  const { data: profileData } = await admin
    .from('circle_profiles')
    .select('meetup, gathering, agreements, pillars_inside, format, size_label, thread, remix_options')
    .eq('circle_id', input.sourceCircleId)
    .maybeSingle()
  const profile = (profileData ?? {}) as Record<string, unknown>

  // 1. The blueprint: a Space-owned circle_templates row. owner_space_id keeps
  //    it out of the global Starter Circles catalog (the list reads filter
  //    owner_space_id IS NULL); remix still loads it through getTemplateById.
  //    The card copy fields ride the one-liner for v1; changes go through the
  //    crew (ADR-864 has no Program edit surface yet).
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
      callouts: [],
      owner_space_id: input.spaceId,
      is_active: true,
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
