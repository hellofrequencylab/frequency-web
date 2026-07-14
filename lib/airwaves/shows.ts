import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { slugify } from '@/lib/utils'
import {
  asFeedVisibility,
  asShowStatus,
  isRecordingPublic,
  type FeedVisibility,
  type Recording,
  type Show,
  type ShowStatus,
} from './types'
import { mapRecordingRow, RECORDING_SELECT } from './recordings'

// Airwaves P3 — Shows: the podcast-feed layer over Recordings (ADR-608). A Show groups Recordings into
// one RSS feed (an Episode is a Recording with show_id set). SERVICE-ROLE only: podcast_shows is RLS-on/
// no-policy (deny-all), so every read/write rides the admin client behind app-layer authz. WRITES gate
// on the caller's per-Space edit capability (owner / admin / editor / staff), the same authority the
// Recordings CRUD uses. Pure feed-assembly (the RSS XML) lives in ./rss.ts; this module is the IO + gate
// seam and the ONE place that joins a Show to its published Episodes + their Loom file URLs.
//
// podcast_shows isn't in lib/database.types.ts yet, so this reaches it through the untyped admin handle
// (ADR-246, repo convention). Mirrors lib/airwaves/recordings.ts column-for-column.

// eslint-disable-next-line no-restricted-syntax -- podcast_shows / library_assets aren't in lib/database.types.ts yet; genuinely untyped table access
const db = () => createAdminClient() as unknown as SupabaseClient

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

// ── Gate (mirrors recordings.ts authorizeSpaceEditor) ────────────────────────────────────────────

type SpaceGateRow = { id: string; owner_profile_id: string | null; entitlements: unknown }

async function loadSpaceGateRow(spaceId: string): Promise<SpaceGateRow | null> {
  const id = (spaceId ?? '').trim()
  if (!id) return null
  try {
    const { data } = await db().from('spaces').select('id, owner_profile_id, entitlements').eq('id', id).maybeSingle()
    return (data as SpaceGateRow | null) ?? null
  } catch {
    return null
  }
}

/** Authorize the caller as an editor of a Space; the Space id on success, else null (fail-safe). */
async function authorizeSpaceEditor(
  spaceId: string,
  actorProfileId: string | null | undefined,
): Promise<string | null> {
  const pid = (actorProfileId ?? '').trim()
  if (!pid) return null
  const row = await loadSpaceGateRow(spaceId)
  if (!row) return null
  try {
    const caps = await getSpaceCapabilities(
      { id: row.id, ownerProfileId: row.owner_profile_id, entitlements: row.entitlements },
      pid,
    )
    return caps.canEditProfile ? row.id : null
  } catch {
    return null
  }
}

// ── Row mapper ───────────────────────────────────────────────────────────────────────────────────

const SHOW_SELECT =
  'id, space_id, slug, title, description, author, cover_asset_id, itunes_category, explicit, language, owner_name, owner_email, feed_visibility, status, created_at, updated_at'

function mapShow(r: Record<string, unknown>): Show {
  return {
    id: String(r.id),
    spaceId: String(r.space_id),
    slug: String(r.slug ?? ''),
    title: String(r.title ?? ''),
    description: (r.description as string | null) ?? null,
    author: (r.author as string | null) ?? null,
    coverAssetId: (r.cover_asset_id as string | null) ?? null,
    itunesCategory: String(r.itunes_category ?? 'Society & Culture'),
    explicit: r.explicit === true,
    language: String(r.language ?? 'en'),
    ownerName: (r.owner_name as string | null) ?? null,
    ownerEmail: (r.owner_email as string | null) ?? null,
    feedVisibility: asFeedVisibility(r.feed_visibility),
    status: asShowStatus(r.status),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────────────────────────

/** A Space's Shows, newest first (owner console). FAIL-SAFE to []. */
export async function listShowsForSpace(spaceId: string): Promise<Show[]> {
  const sid = (spaceId ?? '').trim()
  if (!sid) return []
  try {
    const { data } = await db()
      .from('podcast_shows')
      .select(SHOW_SELECT)
      .eq('space_id', sid)
      .order('created_at', { ascending: false })
      .limit(200)
    return ((data as Array<Record<string, unknown>> | null) ?? []).map(mapShow)
  } catch {
    return []
  }
}

/** One Show by id (no Space scope). null on a miss. */
export async function getShowById(id: string): Promise<Show | null> {
  const sid = (id ?? '').trim()
  if (!sid) return null
  try {
    const { data } = await db().from('podcast_shows').select(SHOW_SELECT).eq('id', sid).maybeSingle()
    return data ? mapShow(data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** One Show by (space, slug) — the public feed lookup. null on a miss. */
export async function getShowBySlug(spaceId: string, slug: string): Promise<Show | null> {
  const sid = (spaceId ?? '').trim()
  const s = (slug ?? '').trim()
  if (!sid || !s) return null
  try {
    const { data } = await db()
      .from('podcast_shows')
      .select(SHOW_SELECT)
      .eq('space_id', sid)
      .eq('slug', s)
      .maybeSingle()
    return data ? mapShow(data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Every Episode (Recording with this show_id) for a Show, ordered for the feed: sort_order then newest
 *  published first. `publicOnly` keeps only published + public episodes (the RSS / public-page floor).
 *  FAIL-SAFE to []. */
export async function listEpisodesForShow(showId: string, opts?: { publicOnly?: boolean }): Promise<Recording[]> {
  const sid = (showId ?? '').trim()
  if (!sid) return []
  try {
    const { data } = await db()
      .from('recordings')
      .select(RECORDING_SELECT)
      .eq('show_id', sid)
      .order('sort_order', { ascending: true })
      .order('published_at', { ascending: false })
      .limit(500)
    const rows = ((data as Array<Record<string, unknown>> | null) ?? []).map(mapRecordingRow)
    return opts?.publicOnly ? rows.filter((r) => isRecordingPublic(r)) : rows
  } catch {
    return []
  }
}

// ── Loom asset resolution (enclosure + cover) ────────────────────────────────────────────────────

/** The Loom file facts an RSS enclosure / a player needs: the public URL, its MIME, and byte length
 *  (RSS `enclosure length` is required; 0 is tolerated by clients when unknown). */
export interface AssetMeta {
  url: string
  mime: string
  bytes: number
}

/** Resolve one library_assets row to its enclosure facts, or null on a miss. */
export async function getAssetMeta(assetId: string | null | undefined): Promise<AssetMeta | null> {
  const id = (assetId ?? '').trim()
  if (!id) return null
  try {
    const { data } = await db().from('library_assets').select('url, mime, bytes').eq('id', id).maybeSingle()
    const row = data as { url?: unknown; mime?: unknown; bytes?: unknown } | null
    if (!row || typeof row.url !== 'string' || !row.url) return null
    return {
      url: row.url,
      mime: typeof row.mime === 'string' && row.mime ? row.mime : 'audio/mpeg',
      bytes: typeof row.bytes === 'number' && Number.isFinite(row.bytes) ? row.bytes : 0,
    }
  } catch {
    return null
  }
}

/** An Episode paired with its Loom enclosure facts, for the feed + the public page. */
export interface FeedEpisode {
  recording: Recording
  enclosure: AssetMeta
}

/** The fully-resolved public feed for a Show: the Show, its cover art URL (or null), and the published
 *  public Episodes each paired with a real, playable enclosure (episodes whose Loom file cannot be
 *  resolved are dropped, so the feed never emits a dead enclosure). One call shared by the RSS route and
 *  the public Show page. FAIL-SAFE: a missing show returns null; a show with no ready episodes returns an
 *  empty list. */
export interface ShowFeed {
  show: Show
  coverUrl: string | null
  episodes: FeedEpisode[]
}

/** Assemble the public feed for a Space's Show by slug. Returns null when the Show is missing or not
 *  published (the RSS route + public page 404 on null). Private feeds (feed_visibility='private') are P4;
 *  this returns null for them so they never leak through the public path. */
export async function assembleShowFeed(spaceId: string, showSlug: string): Promise<ShowFeed | null> {
  const show = await getShowBySlug(spaceId, showSlug)
  if (!show) return null
  if (show.status !== 'published') return null
  if (show.feedVisibility !== 'public') return null

  const [coverMeta, episodes] = await Promise.all([
    getAssetMeta(show.coverAssetId),
    listEpisodesForShow(show.id, { publicOnly: true }),
  ])

  const withEnclosures = await Promise.all(
    episodes.map(async (recording) => {
      const enclosure = await getAssetMeta(recording.loomAssetId)
      return enclosure ? { recording, enclosure } : null
    }),
  )

  return {
    show,
    coverUrl: coverMeta?.url ?? null,
    episodes: withEnclosures.filter((e): e is FeedEpisode => e !== null),
  }
}

// ── Writes (gated) ─────────────────────────────────────────────────────────────────────────────

export interface CreateShowInput {
  spaceId: string
  title: string
  slug?: string | null
  description?: string | null
  author?: string | null
  coverAssetId?: string | null
  itunesCategory?: string | null
  explicit?: boolean
  language?: string | null
  ownerName?: string | null
  ownerEmail?: string | null
  feedVisibility?: FeedVisibility
  status?: ShowStatus
}

const DEFAULT_CATEGORY = 'Society & Culture'

/** Create a Show, gated on edit permission for the Space. Slug derives from the title when blank and is
 *  unique per Space (a collision is reported, not silently reused). Returns the new Show. */
export async function createShow(
  actorProfileId: string | null | undefined,
  input: CreateShowInput,
): Promise<Result<Show>> {
  const spaceId = await authorizeSpaceEditor(input.spaceId, actorProfileId)
  if (!spaceId) return { ok: false, error: 'You do not have access to add a show to this space.' }

  const title = (input.title ?? '').trim()
  if (!title) return { ok: false, error: 'Give the show a title.' }
  const slug = (input.slug?.trim() ? slugify(input.slug) : slugify(title)) || `show-${Date.now().toString(36)}`

  const existing = await getShowBySlug(spaceId, slug)
  if (existing) return { ok: false, error: 'A show with that link already exists. Choose another name.' }

  try {
    const { data, error } = await db()
      .from('podcast_shows')
      .insert({
        space_id: spaceId,
        slug,
        title: title.slice(0, 200),
        description: input.description?.trim() || null,
        author: input.author?.trim() || null,
        cover_asset_id: input.coverAssetId?.trim() || null,
        itunes_category: input.itunesCategory?.trim() || DEFAULT_CATEGORY,
        explicit: input.explicit === true,
        language: input.language?.trim() || 'en',
        owner_name: input.ownerName?.trim() || null,
        owner_email: input.ownerEmail?.trim() || null,
        feed_visibility: asFeedVisibility(input.feedVisibility),
        status: asShowStatus(input.status),
      })
      .select(SHOW_SELECT)
      .maybeSingle()
    if (error || !data) return { ok: false, error: 'Could not save the show. Try again.' }
    return { ok: true, value: mapShow(data as Record<string, unknown>) }
  } catch {
    return { ok: false, error: 'Could not save the show. Try again.' }
  }
}

export interface UpdateShowInput {
  title?: string
  slug?: string | null
  description?: string | null
  author?: string | null
  coverAssetId?: string | null
  itunesCategory?: string | null
  explicit?: boolean
  language?: string | null
  ownerName?: string | null
  ownerEmail?: string | null
  feedVisibility?: FeedVisibility
  status?: ShowStatus
}

/** Update a Show's metadata, gated on edit permission for its Space. A slug change re-checks uniqueness. */
export async function updateShow(
  actorProfileId: string | null | undefined,
  showId: string,
  fields: UpdateShowInput,
): Promise<Result<Show>> {
  const existing = await getShowById(showId)
  if (!existing) return { ok: false, error: 'That show no longer exists.' }
  const spaceId = await authorizeSpaceEditor(existing.spaceId, actorProfileId)
  if (!spaceId) return { ok: false, error: 'You do not have access to edit this show.' }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (fields.title !== undefined) {
    const t = fields.title.trim()
    if (!t) return { ok: false, error: 'Give the show a title.' }
    patch.title = t.slice(0, 200)
  }
  if (fields.slug !== undefined) {
    const nextSlug = fields.slug?.trim() ? slugify(fields.slug) : existing.slug
    if (nextSlug !== existing.slug) {
      const clash = await getShowBySlug(spaceId, nextSlug)
      if (clash) return { ok: false, error: 'A show with that link already exists. Choose another name.' }
    }
    patch.slug = nextSlug
  }
  if (fields.description !== undefined) patch.description = fields.description?.trim() || null
  if (fields.author !== undefined) patch.author = fields.author?.trim() || null
  if (fields.coverAssetId !== undefined) patch.cover_asset_id = fields.coverAssetId?.trim() || null
  if (fields.itunesCategory !== undefined) patch.itunes_category = fields.itunesCategory?.trim() || DEFAULT_CATEGORY
  if (fields.explicit !== undefined) patch.explicit = fields.explicit === true
  if (fields.language !== undefined) patch.language = fields.language?.trim() || 'en'
  if (fields.ownerName !== undefined) patch.owner_name = fields.ownerName?.trim() || null
  if (fields.ownerEmail !== undefined) patch.owner_email = fields.ownerEmail?.trim() || null
  if (fields.feedVisibility !== undefined) patch.feed_visibility = asFeedVisibility(fields.feedVisibility)
  if (fields.status !== undefined) patch.status = asShowStatus(fields.status)

  try {
    const { data, error } = await db()
      .from('podcast_shows')
      .update(patch)
      .eq('id', existing.id)
      .select(SHOW_SELECT)
      .maybeSingle()
    if (error || !data) return { ok: false, error: 'Could not save your changes. Try again.' }
    return { ok: true, value: mapShow(data as Record<string, unknown>) }
  } catch {
    return { ok: false, error: 'Could not save your changes. Try again.' }
  }
}

/** Delete a Show, gated on edit permission for its Space. Episodes are NOT deleted — their show_id is
 *  cleared (they fall back to library-only Recordings), so deleting a Show never destroys media. */
export async function deleteShow(
  actorProfileId: string | null | undefined,
  showId: string,
): Promise<Result<{ id: string }>> {
  const existing = await getShowById(showId)
  if (!existing) return { ok: true, value: { id: (showId ?? '').trim() } }
  const spaceId = await authorizeSpaceEditor(existing.spaceId, actorProfileId)
  if (!spaceId) return { ok: false, error: 'You do not have access to delete this show.' }
  try {
    // Unlink episodes first so a Show delete never cascades into recordings.
    await db().from('recordings').update({ show_id: null }).eq('show_id', existing.id)
    const { error } = await db().from('podcast_shows').delete().eq('id', existing.id)
    if (error) return { ok: false, error: 'Could not delete the show. Try again.' }
    return { ok: true, value: { id: existing.id } }
  } catch {
    return { ok: false, error: 'Could not delete the show. Try again.' }
  }
}
