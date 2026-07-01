// Server-side readers for the Space CONTENT blocks (Puck content blocks, Phase 2, ADR-476/472).
// One place assembles everything the dynamic Space landing blocks need -- the brand Updates feed,
// the member Reviews (average + latest), and the operator FAQ -- from the space_updates /
// space_reviews / space_faqs tables (migration 20260918000200). The reader is injected into the
// Puck blocks via `metadata.space` (the same metadata-injection pattern LiveStats + the Circles
// index blocks use), so the PUBLISHED landing shows real rows while the EDITOR canvas (no metadata)
// shows a labelled placeholder the operator can drag-rearrange.
//
// FAIL-SAFE: every read defaults to empty on any error or missing table (pre-migration), so the
// landing never throws and a brand-new Space simply renders nothing for a block with no rows. Reads
// go through the service-role admin client (the tables' RLS already restricts public reads to
// published/visible rows on active Spaces); we additionally filter by status here so the public
// landing never shows a draft/hidden row even though the admin client bypasses RLS. NO N+1: each
// block gets ONE bounded query.
//
// The tables are not in the generated DB types yet (ADR-246), so the admin client is reached untyped
// per-query (the same `as unknown as ...` seam the Space landing actions use). These readers are the
// ONLY server path the blocks read through -- the block components themselves import nothing
// server-only, so the shared Puck config stays client-safe (the classic build trap).

import { createAdminClient } from '@/lib/supabase/admin'

// ── Shapes the blocks render (plain data, no server imports leak into the block components) ──────

export type SpaceUpdateItem = {
  id: string
  title: string
  body: string
  imageUrl: string | null
  publishedAt: string | null
  /** The interaction anchor post id, when the Update is wired to the reactions/comments system. */
  postId: string | null
}

export type SpaceReviewItem = {
  id: string
  rating: number
  body: string
  createdAt: string
  author: { displayName: string; avatarUrl: string | null } | null
}

export type SpaceReviewsData = {
  /** Rounded-to-one-decimal average of every VISIBLE review, or null when there are none. */
  average: number | null
  count: number
  latest: SpaceReviewItem[]
}

export type SpaceFaqItem = {
  id: string
  question: string
  answer: string
}

/** Everything the Space content blocks read, keyed under `metadata.space`. Every field is present
 *  and fail-safe (empty when there are no rows), so a block renders nothing rather than throwing. */
export type SpaceContentData = {
  spaceId: string
  updates: SpaceUpdateItem[]
  reviews: SpaceReviewsData
  faqs: SpaceFaqItem[]
}

// Bounded caps so a query can never scan an unbounded table. The blocks show the latest N with a
// "view all"; these ceilings are generous relative to what a landing shows.
const UPDATES_CAP = 24
const REVIEWS_CAP = 24
const FAQS_CAP = 50

// Untyped admin handle (ADR-246): the space_* tables are not in the generated types yet.
type Row = Record<string, unknown>
function untyped() {
  return createAdminClient() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Row[] | null }> } }
          order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Row[] | null }> }
        }
      }
    }
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** The latest PUBLISHED brand Updates for a Space, newest first. Fail-safe to []. */
export async function getSpaceUpdates(spaceId: string): Promise<SpaceUpdateItem[]> {
  try {
    const { data } = await untyped()
      .from('space_updates')
      .select('id, title, body, image_url, published_at, post_id')
      .eq('space_id', spaceId)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(UPDATES_CAP)
    return (data ?? []).map((r) => ({
      id: str(r.id),
      title: str(r.title),
      body: str(r.body),
      imageUrl: strOrNull(r.image_url),
      publishedAt: strOrNull(r.published_at),
      postId: strOrNull(r.post_id),
    }))
  } catch {
    return []
  }
}

type ReviewRow = Row & {
  author?: { display_name?: unknown; avatar_url?: unknown } | null
}

/** The VISIBLE reviews for a Space: the average, the count, and the latest few (newest first).
 *  Fail-safe to an empty summary (average null, count 0, latest []). ONE query, no N+1: the author
 *  display fields ride the embedded select. */
export async function getSpaceReviews(spaceId: string): Promise<SpaceReviewsData> {
  const empty: SpaceReviewsData = { average: null, count: 0, latest: [] }
  try {
    const { data } = await untyped()
      .from('space_reviews')
      .select('id, rating, body, created_at, author:profiles!author_profile_id ( display_name, avatar_url )')
      .eq('space_id', spaceId)
      .eq('status', 'visible')
      .order('created_at', { ascending: false })
      .limit(REVIEWS_CAP)
    const rows = (data ?? []) as ReviewRow[]
    if (rows.length === 0) return empty
    const ratings = rows.map((r) => (typeof r.rating === 'number' ? r.rating : Number(r.rating) || 0))
    const sum = ratings.reduce((a, b) => a + b, 0)
    const average = Math.round((sum / rows.length) * 10) / 10
    const latest: SpaceReviewItem[] = rows.map((r) => ({
      id: str(r.id),
      rating: typeof r.rating === 'number' ? r.rating : Number(r.rating) || 0,
      body: str(r.body),
      createdAt: str(r.created_at),
      author: r.author
        ? { displayName: str(r.author.display_name) || 'Member', avatarUrl: strOrNull(r.author.avatar_url) }
        : null,
    }))
    return { average, count: rows.length, latest }
  } catch {
    return empty
  }
}

/** The operator FAQ for a Space, ordered by position. Fail-safe to []. */
export async function getSpaceFaqs(spaceId: string): Promise<SpaceFaqItem[]> {
  try {
    const { data } = await untyped()
      .from('space_faqs')
      .select('id, question, answer, position')
      .eq('space_id', spaceId)
      .order('position', { ascending: true })
      .limit(FAQS_CAP)
    return (data ?? []).map((r) => ({
      id: str(r.id),
      question: str(r.question),
      answer: str(r.answer),
    }))
  } catch {
    return []
  }
}

/** Assemble every Space content block's data in one pass (three bounded, parallel reads). Injected
 *  into <Render> as `metadata.space`. FAIL-SAFE throughout: any miss yields empty, so the landing
 *  never throws. */
export async function getSpaceContentData(spaceId: string): Promise<SpaceContentData> {
  const [updates, reviews, faqs] = await Promise.all([
    getSpaceUpdates(spaceId),
    getSpaceReviews(spaceId),
    getSpaceFaqs(spaceId),
  ])
  return { spaceId, updates, reviews, faqs }
}
