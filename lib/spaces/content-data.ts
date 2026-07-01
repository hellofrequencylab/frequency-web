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
import { resolveProfileStats } from '@/lib/spaces/profile-stats'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import type { TemplateResolverInput } from '@/lib/spaces/templates'

// ── Shapes the blocks render (plain data, no server imports leak into the block components) ──────

/** The shared IDENTITY a Space presents on BOTH its landing page AND its Spotlight (Phase 4). The
 *  Profile blocks (SpaceIdentityHeader, SpaceHighlights, SpaceOfferings, SpaceContact, SpaceTeam,
 *  SpaceCTA) read this off `metadata.space.identity`, injected by the RSC render paths
 *  (components/spaces/space-landing.tsx + the Spotlight render bridge). Every field is optional so a
 *  block on a page WITHOUT identity metadata (a stray copy, a member Spotlight) degrades to a
 *  placeholder in the editor and to nothing on the live render, never a crash. */
export type SpaceIdentity = {
  /** The display brand name (brand name preferred, else the plain Space name). */
  name: string
  /** The plain type badge label ("Practitioner", "Event Space"). */
  typeLabel: string
  /** The operator's brand logo URL (an arbitrary https / same-origin URL), or null. */
  logoUrl: string | null
  /** The operator's uploaded cover banner (spaces.cover_image_url), or null. */
  coverUrl: string | null
  /** The one-line tagline under the name, or null. */
  tagline: string | null
  /** The primary action the identity header surfaces: a plain-verb label + the tab-relative href
   *  the resolved template names (e.g. "Book a session" -> the /book tab). */
  primaryCta: { label: string; href: string } | null
}

/** One resolved highlight tile for the SpaceHighlights strip: a plain-noun label + a live count from
 *  the Space's own rows. Only positive counts are carried, so a brand-new Space shows nothing (honest
 *  at day zero, no invented numbers). */
export type SpaceHighlight = { label: string; value: number }

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
  /** The shared cover + logo + name identity (Phase 4). Present on the Space landing + a brand/space
   *  Spotlight; undefined in the editor canvas + a member Spotlight (the Profile blocks fall back). */
  identity?: SpaceIdentity
  /** The live highlight counts (members / offerings / ...) the SpaceHighlights strip reads, template
   *  ordered, only the positive ones. Empty for a brand-new Space (the strip renders nothing). */
  highlights?: SpaceHighlight[]
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

/** The identity + highlight inputs a render path hands to getSpaceContentData so the Profile blocks
 *  (Phase 4) can read the shared cover/logo/name off `metadata.space`. All raw + tolerant: the reader
 *  builds the SpaceIdentity + resolves the live highlight counts. Omit it (the pre-Phase-4 call) and
 *  the Profile blocks fall back to their editor placeholders, so this is fully additive. */
export interface SpaceContentInput {
  /** The display brand name (brand name preferred, else the plain Space name). */
  name: string
  /** The raw `spaces.type` value, turned into a plain badge label. */
  type: string
  /** The operator's brand logo URL, or null. */
  logoUrl?: string | null
  /** The operator's uploaded cover banner (spaces.cover_image_url), or null. */
  coverUrl?: string | null
  /** The one-line tagline, or null. */
  tagline?: string | null
  /** The primary CTA the identity header surfaces (label + tab-relative href), or null. */
  primaryCta?: { label: string; href: string } | null
  /** The template resolver input, so the live highlight counts match the page's resolved template. */
  statsInput?: TemplateResolverInput
}

/** Assemble every Space content block's data in one pass. The three content reads (updates / reviews
 *  / faqs) plus, when `input` is given (Phase 4), the shared identity + the live highlight counts.
 *  Injected into <Render> as `metadata.space`. FAIL-SAFE throughout: any miss yields empty, so the
 *  landing never throws; the highlight resolve degrades to [] on any error. */
export async function getSpaceContentData(
  spaceId: string,
  input?: SpaceContentInput,
): Promise<SpaceContentData> {
  const [updates, reviews, faqs, highlights] = await Promise.all([
    getSpaceUpdates(spaceId),
    getSpaceReviews(spaceId),
    getSpaceFaqs(spaceId),
    input?.statsInput ? getSpaceHighlights(spaceId, input.statsInput) : Promise.resolve([]),
  ])
  const identity: SpaceIdentity | undefined = input
    ? {
        name: input.name,
        typeLabel: spaceTypeLabel(input.type),
        logoUrl: input.logoUrl ?? null,
        coverUrl: input.coverUrl ?? null,
        tagline: input.tagline?.trim() ? input.tagline.trim() : null,
        primaryCta: input.primaryCta ?? null,
      }
    : undefined
  return { spaceId, updates, reviews, faqs, identity, highlights }
}

/** The live highlight counts (members / offerings / ...) for the SpaceHighlights strip, from the same
 *  resolver the hero stats + the entity-stats module read, so the strip never disagrees with the hero.
 *  Only the positive counts ride through (honest at day zero). FAIL-SAFE to []. */
export async function getSpaceHighlights(
  spaceId: string,
  input: TemplateResolverInput,
): Promise<SpaceHighlight[]> {
  try {
    const stats = await resolveProfileStats(spaceId, input)
    return stats.filter((s) => s.value > 0).map((s) => ({ label: s.label, value: s.value }))
  } catch {
    return []
  }
}
