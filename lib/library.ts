// Community Library (ADR-109) — the unified, ranked catalog of community-created
// content (Practices · Journeys) and the leadership review queue. Reads go through
// the untyped admin client because the new tables/columns (content_ratings, *.status,
// community_library RPC) aren't in the generated types yet. Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

function db(): SupabaseClient {
  return createAdminClient()
}

export type ContentType = 'practice' | 'journey'

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
  /** The staff FEATURE mark (practices.featured_at / journey_plans.featured_at), or null. Enriched
   *  after the RPC because the `community_library` view predates the column, exactly the way
   *  lib/practices.ts enriches the admin library. Leads the catalog order (LIVE-264). */
  featuredAt: string | null
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

const TYPE_LABEL: Record<ContentType, string> = { practice: 'Practice', journey: 'Journey' }
export const typeLabel = (t: ContentType) => TYPE_LABEL[t]

/** A link to the underlying content. */
export function hrefFor(item: { contentType: ContentType; slug: string }): string {
  if (item.contentType === 'practice') return item.slug ? `/practices/${item.slug}` : '/practices'
  return `/journeys/${item.slug}`
}

async function resolvePeople(ids: (string | null)[]): Promise<Map<string, PersonLite>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  const map = new Map<string, PersonLite>()
  if (!unique.length) return map
  const { data } = await db().from('profiles').select('id, display_name, handle, avatar_url').in('id', unique)
  for (const p of (data as PersonLite[] | null) ?? []) map.set(p.id, p)
  return map
}

/**
 * The staff FEATURE marks for one page of library items, batched by type (LIVE-264).
 *
 * `practices.featured_at` and `journey_plans.featured_at` have existed since migration
 * 20260610180000, with a write path in `lib/admin/content-signals.ts`
 * (`setPracticeFeatured` / `setJourneyFeatured`) and a toggle in the admin library, and until now
 * NOTHING read them on a member-facing surface: a curator could feature a practice and the library
 * looked identical. The `community_library` RPC's columns are frozen and predate the column, so the
 * mark is enriched here rather than added to the view, which is the same shape `lib/practices.ts`
 * already uses for the admin library. TWO reads for the whole page, never one per row.
 *
 * FAIL-SAFE: any error yields an empty map, so the catalog renders in its ranked order with no
 * featured band rather than failing.
 */
async function featuredMarks(rows: readonly Record<string, unknown>[]): Promise<Map<string, string>> {
  const marks = new Map<string, string>()
  const byType = (t: ContentType) =>
    rows.filter((r) => r.content_type === t).map((r) => r.id as string).filter(Boolean)
  const practiceIds = byType('practice')
  const journeyIds = byType('journey')
  if (practiceIds.length === 0 && journeyIds.length === 0) return marks
  try {
    const d = db()
    const [pr, jp] = await Promise.all([
      practiceIds.length
        ? d.from('practices').select('id, featured_at').in('id', practiceIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      journeyIds.length
        ? d.from('journey_plans').select('id, featured_at').in('id', journeyIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ])
    for (const set of [pr.data, jp.data]) {
      for (const row of (set as { id: string; featured_at: string | null }[] | null) ?? []) {
        if (row.featured_at) marks.set(row.id, row.featured_at)
      }
    }
    return marks
  } catch {
    return marks
  }
}

/** The ranked best-of catalog (community_library RPC), with authors resolved and the staff FEATURE
 *  marks enriched. Featured items LEAD the catalog, most-recently featured first; everything else
 *  keeps the RPC's ranked order underneath (a stable sort, so the ranking is preserved exactly).
 *  Featuring is the one curated lever on this surface, and it is editorial, never purchased. */
export async function getLibrary(opts: { type?: ContentType | null; pillar?: string | null; limit?: number } = {}): Promise<LibraryItem[]> {
  const { data } = await db().rpc('community_library', {
    _type: opts.type ?? null,
    _pillar: opts.pillar ?? null,
    _limit: opts.limit ?? 80,
  })
  const rows = (data as Record<string, unknown>[] | null) ?? []
  const [people, featured] = await Promise.all([
    resolvePeople(rows.map((r) => r.author_id as string | null)),
    featuredMarks(rows),
  ])
  const items = rows.map((r) => ({
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
    featuredAt: featured.get(r.id as string) ?? null,
  }))

  // Featured first, most-recently featured leading; everything else keeps the RPC's ranked order.
  // `Array.prototype.sort` is stable, so the un-featured tail is untouched.
  return items.sort((a, b) => {
    if (a.featuredAt && b.featuredAt) return b.featuredAt.localeCompare(a.featuredAt)
    if (a.featuredAt) return -1
    if (b.featuredAt) return 1
    return 0
  })
}

/** Everything awaiting leadership review, across both types. */
export async function getPendingReview(): Promise<PendingItem[]> {
  const d = db()
  const [pr, jp] = await Promise.all([
    d.from('practices').select('id, title, description, created_by, created_at').eq('status', 'pending'),
    d.from('journey_plans').select('id, title, summary, author_id, created_at').eq('status', 'pending'),
  ])
  const items: PendingItem[] = []
  for (const r of (pr.data as Record<string, unknown>[] | null) ?? [])
    items.push({ contentType: 'practice', id: r.id as string, title: r.title as string, summary: (r.description as string) ?? null, authorId: (r.created_by as string) ?? null, author: null, createdAt: r.created_at as string })
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
