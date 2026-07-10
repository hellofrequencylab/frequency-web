// Community Library (ADR-109) — the unified, ranked catalog of community-created
// content (Practices · Programs · Journeys) and the leadership review queue. Reads
// go through the untyped admin client because the new tables/columns (programs,
// content_ratings, *.status, community_library RPC) aren't in the generated types
// yet. Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRootSpaceId } from '@/lib/spaces/store'

function db(): SupabaseClient {
  return createAdminClient()
}

export type ContentType = 'practice' | 'program' | 'journey'

/** A program (community_library `programs` table) as the by-space read returns it. */
export interface SpaceProgram {
  id: string
  slug: string
  title: string
  summary: string | null
  author_id: string | null
  pillar: string | null
  status: string
  space_id: string | null
  created_at: string
}

/**
 * The space_id to stamp on a NEW program: the explicit owning space, else the root space (so the
 * existing single-tenant create flow defaults to root and behaves exactly as today). Returns null
 * only if the root row is missing (pre-migration) — the caller then omits the field, leaving the
 * column NULL, which the backfill later sweeps to root.
 */
export async function stampProgramSpaceId(spaceId?: string | null): Promise<string | null> {
  return spaceId ?? (await loadRootSpaceId())
}

/**
 * Programs that BELONG TO a space (tenancy axis, Phase 0 / ENTITY-SPACES §4.3), newest first.
 * Defaults to the root space (so a caller that passes no spaceId reads the root's programs, the
 * canary). Filtered by space_id so a program in space A can never resolve for space B — the
 * by-space read the Phase 1 profile uses. FAIL-SAFE: [] on any error / missing tenant. space_id
 * is reached with an untyped handle (ADR-246).
 */
export async function listProgramsForSpace(spaceId?: string | null, limit = 50): Promise<SpaceProgram[]> {
  const sid = spaceId ?? (await loadRootSpaceId())
  if (!sid) return []
  try {
    const q = db().from('programs') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: unknown; error: unknown }>
          }
        }
      }
    }
    const { data, error } = await q
      .select('id, slug, title, summary, author_id, pillar, status, space_id, created_at')
      .eq('space_id', sid)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return []
    return (data as SpaceProgram[] | null) ?? []
  } catch {
    return []
  }
}

export type PersonLite = { id: string; display_name: string; handle: string | null; avatar_url: string | null }

export type LibraryItem = {
  contentType: ContentType
  id: string
  slug: string
  title: string
  summary: string | null
  pillar: string | null
  authorId: string | null
  coverImage: string | null
  createdAt: string
  adoptions: number
  completions: number
  ratings: number
  score: number
  author: PersonLite | null
  // Time / size data (migration 20261109000000_library_card_times). FAIL-SAFE: all four
  // are null when the RPC predates the migration, so the card simply drops its time chip.
  /** Practice session length in minutes (practices.duration_min). */
  durationMin: number | null
  /** Practice rhythm, e.g. 'Daily' (practices.cadence). */
  cadence: string | null
  /** Journey structural size — weekly Phases, else lesson/step count. */
  unitCount: number | null
  /** Pluralized descriptor for unitCount, e.g. 'weeks · 24 lessons' or 'lessons'. */
  unitLabel: string | null
}

export type PendingItem = {
  contentType: ContentType
  id: string
  title: string
  summary: string | null
  authorId: string | null
  author: PersonLite | null
  createdAt: string
}

const TYPE_LABEL: Record<ContentType, string> = { practice: 'Practice', program: 'Program', journey: 'Journey' }
export const typeLabel = (t: ContentType) => TYPE_LABEL[t]

/** A link to the underlying content. Programs render inline in the Library (no
 *  detail route yet), so they have no external href. */
export function hrefFor(item: { contentType: ContentType; slug: string }): string | null {
  if (item.contentType === 'practice') return item.slug ? `/practices/${item.slug}` : '/practices'
  if (item.contentType === 'journey') return `/journeys/${item.slug}`
  return null
}

async function resolvePeople(ids: (string | null)[]): Promise<Map<string, PersonLite>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  const map = new Map<string, PersonLite>()
  if (!unique.length) return map
  const { data } = await db().from('profiles').select('id, display_name, handle, avatar_url').in('id', unique)
  for (const p of (data as PersonLite[] | null) ?? []) map.set(p.id, p)
  return map
}

/** The ranked best-of catalog (community_library RPC), with authors resolved. */
export async function getLibrary(opts: { type?: ContentType | null; pillar?: string | null; limit?: number } = {}): Promise<LibraryItem[]> {
  const { data } = await db().rpc('community_library', {
    _type: opts.type ?? null,
    _pillar: opts.pillar ?? null,
    _limit: opts.limit ?? 80,
  })
  const rows = (data as Record<string, unknown>[] | null) ?? []
  const people = await resolvePeople(rows.map((r) => r.author_id as string | null))
  return rows.map((r) => ({
    contentType: r.content_type as ContentType,
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    summary: (r.summary as string) ?? null,
    pillar: (r.pillar as string) ?? null,
    authorId: (r.author_id as string) ?? null,
    coverImage: (r.cover_image as string) ?? null,
    createdAt: r.created_at as string,
    adoptions: Number(r.adoptions) || 0,
    completions: Number(r.completions) || 0,
    ratings: Number(r.ratings) || 0,
    score: Number(r.score) || 0,
    author: r.author_id ? people.get(r.author_id as string) ?? null : null,
    // Fail-safe: absent (pre-migration RPC) or null columns all map to null.
    durationMin: r.duration_min == null ? null : Number(r.duration_min) || null,
    cadence: (r.cadence as string) ?? null,
    unitCount: r.unit_count == null ? null : Number(r.unit_count) || null,
    unitLabel: (r.unit_label as string) ?? null,
  }))
}

/** Everything awaiting leadership review, across the three types. */
export async function getPendingReview(): Promise<PendingItem[]> {
  const d = db()
  const [pr, pg, jp] = await Promise.all([
    d.from('practices').select('id, title, description, created_by, created_at').eq('status', 'pending'),
    d.from('programs').select('id, title, summary, author_id, created_at').eq('status', 'pending'),
    d.from('journey_plans').select('id, title, summary, author_id, created_at').eq('status', 'pending'),
  ])
  const items: PendingItem[] = []
  for (const r of (pr.data as Record<string, unknown>[] | null) ?? [])
    items.push({ contentType: 'practice', id: r.id as string, title: r.title as string, summary: (r.description as string) ?? null, authorId: (r.created_by as string) ?? null, author: null, createdAt: r.created_at as string })
  for (const r of (pg.data as Record<string, unknown>[] | null) ?? [])
    items.push({ contentType: 'program', id: r.id as string, title: r.title as string, summary: (r.summary as string) ?? null, authorId: (r.author_id as string) ?? null, author: null, createdAt: r.created_at as string })
  for (const r of (jp.data as Record<string, unknown>[] | null) ?? [])
    items.push({ contentType: 'journey', id: r.id as string, title: r.title as string, summary: (r.summary as string) ?? null, authorId: (r.author_id as string) ?? null, author: null, createdAt: r.created_at as string })

  const people = await resolvePeople(items.map((i) => i.authorId))
  for (const i of items) i.author = i.authorId ? people.get(i.authorId) ?? null : null
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return items
}

export async function pendingReviewCount(): Promise<number> {
  return (await getPendingReview()).length
}

/** The "type:id" keys the viewer has rated (for the rated/unrated toggle state). */
export async function getMyRatings(profileId: string): Promise<Set<string>> {
  const { data } = await db().from('content_ratings').select('content_type, content_id').eq('profile_id', profileId)
  const set = new Set<string>()
  for (const r of (data as { content_type: string; content_id: string }[] | null) ?? []) set.add(`${r.content_type}:${r.content_id}`)
  return set
}
