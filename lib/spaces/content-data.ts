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

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProfileStats, type ResolvedStat } from '@/lib/spaces/profile-stats'
import type { SectionPresence } from '@/lib/spaces/section-anchors'
import type { SpaceProfileData } from '@/lib/spaces/profile-data'
import type { LayoutPreset } from '@/lib/spaces/layout-presets'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { listEventsForSpace } from '@/lib/events/store'
import { listPracticesForSpace } from '@/lib/practices'
import { listJourneyPlansForSpace } from '@/lib/journey-plans'
import { listCirclesForSpace } from '@/lib/circles/store'
import { spaceRoleRank } from '@/lib/spaces/membership'

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

/** The FULL resolved stat set (every template metric with its live count, positive or not), so the
 *  operator-configurable SpaceStats block can select WHICH metrics to show by `metric` key and still
 *  hide any that resolve to zero (honest at day zero). Carries the metric key so a label override in
 *  the block maps to the right stat. */
export type SpaceStat = { metric: ResolvedStat['metric']; label: string; value: number }

/** One upcoming event the SpaceEvents block lists, from the Space's own events (soonest first, live
 *  only). Plain shape so the block imports nothing server-only. */
export type SpaceEventItem = {
  id: string
  slug: string
  title: string
  startsAt: string
}

/** Whether the Space is currently taking bookings, for the SpaceBooking block. Honest: `enabled` is
 *  true only when the Space actually publishes availability windows, so the block is a real entry, not
 *  an empty promise. `href` is the slug-relative booking tab. */
export type SpaceBookingInfo = { enabled: boolean; href: string | null }

/** One live practice OR journey the SpacePractices block lists, from the Space's OWN rows (the same
 *  readers the entity-practices module uses: listPracticesForSpace + listJourneyPlansForSpace). Plain
 *  shape so the block imports nothing server-only. `kind` splits the two groups the block renders. */
export type SpacePracticeItem = {
  kind: 'practice' | 'journey'
  id: string
  slug: string
  title: string
  summary: string | null
  /** The emoji face (a practice icon or a journey emoji), or null. */
  emoji: string | null
  /** Live adoption count for a journey (0 for a practice), only surfaced when positive. */
  adoptCount: number
}

/** The live practices + journeys the SpacePractices block reads. Split so the block can render the two
 *  labelled groups (entity-practices' "Practices to start" / "Journeys to begin") without re-filtering. */
export type SpacePracticesData = {
  practices: SpacePracticeItem[]
  journeys: SpacePracticeItem[]
}

/** One live Circle the SpaceCommunity block lists, from the Space's OWN active circles (the same
 *  reader the entity-community module uses: listCirclesForSpace). Plain shape so the block imports
 *  nothing server-only. */
export type SpaceCircleItem = {
  id: string
  slug: string
  name: string
  about: string | null
  memberCount: number
}

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

/** One person on a Space's TEAM — an active member holding an operator role (editor / moderator /
 *  admin), joined to their public profile. The Team block reads these off the data bag. Plain shape so
 *  the block imports nothing server-only. */
export type SpaceTeamMember = {
  profileId: string
  /** Display name, or `@handle` fallback, never blank. */
  name: string
  handle: string | null
  avatarUrl: string | null
  /** The space role ('admin' | 'moderator' | 'editor'), for an optional role chip. */
  role: string
}

/** Everything the Space content blocks read, keyed under `metadata.space`. Every field is present
 *  and fail-safe (empty when there are no rows), so a block renders nothing rather than throwing. */
export type SpaceContentData = {
  spaceId: string
  /** The SHORT about intro from the `spaces.about` COLUMN (ADR-535), for the `about` profile block. The
   *  longer narrative (the `story` block) reads `profile.about` off the preferences blob instead. Empty
   *  string when unset, so the about block renders nothing (fail-safe). */
  aboutShort: string
  updates: SpaceUpdateItem[]
  reviews: SpaceReviewsData
  faqs: SpaceFaqItem[]
  /** The shared cover + logo + name identity (Phase 4). Present on the Space landing + a brand/space
   *  Spotlight; undefined in the editor canvas + a member Spotlight (the Profile blocks fall back). */
  identity?: SpaceIdentity
  /** The live highlight counts (members / offerings / ...) the SpaceHighlights strip reads, template
   *  ordered, only the positive ones. Empty for a brand-new Space (the strip renders nothing). */
  highlights?: SpaceHighlight[]
  /** The FULL resolved stat set the operator-configurable SpaceStats block reads (every metric with
   *  its live count, so the block picks by metric key + hides zero ones). Empty in the editor / a
   *  member Spotlight. */
  stats?: SpaceStat[]
  /** The Space's upcoming events the SpaceEvents block lists (soonest first). Empty when none. */
  events?: SpaceEventItem[]
  /** Whether the Space is taking bookings + the booking tab href, for the SpaceBooking block. */
  booking?: SpaceBookingInfo
  /** The Space's live practices + journeys the SpacePractices block lists (both empty for a brand-new
   *  Space). Undefined in the editor / a member Spotlight (the block falls back to its placeholder). */
  practices?: SpacePracticesData
  /** The Space's live active Circles the SpaceCommunity block lists. Empty when none; undefined in the
   *  editor / a member Spotlight. */
  community?: SpaceCircleItem[]
  /** The Space's TEAM — active members with an operator role (editor / moderator / admin), for the Team
   *  block. Empty when the operator has added no team (honest-empty; the block renders nothing). */
  team?: SpaceTeamMember[]
  /** Team-block MEMBER PICKS resolved to live cards, keyed by profile id. The operator picks members
   *  from the whole network (member-picker-field.tsx); the render path pre-resolves the chosen ids
   *  found in the page doc so each card links to `/people/<handle>` without a per-block await. Absent in
   *  the editor canvas (the block falls back to its stored/manual entries). */
  teamPicks?: Record<string, SpaceTeamMember>
  /** The CENTRAL, single-source profile data (business info + story) every authored block reads off,
   *  so editing it once updates every surface (lib/spaces/profile-data.ts). Undefined in the editor /
   *  a member Spotlight (the blocks fall back to their own inline props). */
  profile?: SpaceProfileData
  /** The page's DISPLAY layout preset (stack / main-rail / sections). The renderer's root reads this to
   *  set the page rhythm; the content is arranged for the preset upstream (applyLayoutPreset). */
  layoutPreset?: LayoutPreset
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

/** The SHORT about intro from the `spaces.about` COLUMN (ADR-535), for the `about` profile block. Read
 *  through the untyped admin handle (the column is not in the generated types yet, ADR-246), the same
 *  seam readProfileExtras uses. The longer narrative lives in preferences.profileData (the `story`
 *  block). FAIL-SAFE to '' (an unset column ⇒ the about block renders nothing). */
export async function getSpaceAbout(spaceId: string): Promise<string> {
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { about?: unknown } | null }> }
        }
      }
    }
    const { data } = await admin.from('spaces').select('about').eq('id', spaceId).maybeSingle()
    return str(data?.about).trim()
  } catch {
    return ''
  }
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
  /** The Space slug, so the events + booking blocks can build slug-relative hrefs. */
  slug?: string
  /** The CENTRAL profile data (business info + story) read off preferences.profileData, injected so
   *  every authored block renders from the ONE source. Omit it (a non-space render path) and the
   *  blocks fall back to their inline props. */
  profile?: SpaceProfileData
  /** The page's DISPLAY layout preset, echoed into metadata so the renderer root sets the rhythm. */
  layoutPreset?: LayoutPreset
}

/** ONE request-cached round of every live content read for a Space, keyed on (spaceId, slug). The
 *  profile LAYOUT (which derives the anchor menu from what will actually render) and the page BODY
 *  (which injects the same rows into the blocks) both read through here, so the two never disagree
 *  AND the queries run once per request. React.cache: per-request, primitive-keyed. */
const getSpaceLiveContent = cache(async (spaceId: string, slug: string | null) => {
  const [aboutShort, updates, reviews, faqs, highlights, stats, events, booking, practices, community, team] =
    await Promise.all([
      getSpaceAbout(spaceId),
      getSpaceUpdates(spaceId),
      getSpaceReviews(spaceId),
      getSpaceFaqs(spaceId),
      getSpaceHighlights(spaceId),
      getSpaceStats(spaceId),
      getSpaceUpcomingEvents(spaceId),
      getSpaceBookingInfo(spaceId, slug),
      getSpacePractices(spaceId),
      getSpaceCommunity(spaceId),
      getSpaceTeam(spaceId),
    ])
  return { aboutShort, updates, reviews, faqs, highlights, stats, events, booking, practices, community, team }
})

/** Which live sections currently have real rows, for the pre-populated anchor menu (the chrome shows
 *  an anchor only when its section will render). Shares the ONE cached read with the page body. */
export async function getSpaceSectionPresence(spaceId: string, slug: string | null): Promise<SectionPresence> {
  const c = await getSpaceLiveContent(spaceId, slug)
  return {
    booking: c.booking.enabled && !!c.booking.href,
    events: c.events.length > 0,
    reviews: c.reviews.count > 0,
    faqs: c.faqs.length > 0,
    updates: c.updates.length > 0,
    practices: c.practices.practices.length + c.practices.journeys.length > 0,
    community: c.community.length > 0,
  }
}

/** Assemble every Space content block's data in one pass (through the request-cached live read), plus,
 *  when `input` is given (Phase 4), the shared identity. Injected into <Render> as `metadata.space`.
 *  FAIL-SAFE throughout: any miss yields empty, so the landing never throws. */
export async function getSpaceContentData(
  spaceId: string,
  input?: SpaceContentInput,
): Promise<SpaceContentData> {
  const slug = input?.slug?.trim() || null
  const { aboutShort, updates, reviews, faqs, highlights, stats, events, booking, practices, community, team } =
    await getSpaceLiveContent(spaceId, slug)
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
  return {
    spaceId,
    aboutShort,
    updates,
    reviews,
    faqs,
    identity,
    highlights,
    stats,
    events,
    booking,
    practices,
    community,
    team,
    profile: input?.profile,
    layoutPreset: input?.layoutPreset,
  }
}

/** The live highlight counts (members / offerings / ...) for the SpaceHighlights strip, from the same
 *  resolver the hero stats + the entity-stats module read, so the strip never disagrees with the hero.
 *  Only the positive counts ride through (honest at day zero). FAIL-SAFE to []. */
export async function getSpaceHighlights(spaceId: string): Promise<SpaceHighlight[]> {
  try {
    const stats = await resolveProfileStats(spaceId)
    return stats.filter((s) => s.value > 0).map((s) => ({ label: s.label, value: s.value }))
  } catch {
    return []
  }
}

/** The FULL resolved stat set (every template metric with its live count, positive or not) for the
 *  operator-configurable SpaceStats block, from the SAME resolver as the hero/highlights, so the two
 *  never disagree. The block selects WHICH metrics to show + hides any that resolve to zero, so this
 *  carries the whole set (including zeros) but never invents a number. FAIL-SAFE to []. */
export async function getSpaceStats(spaceId: string): Promise<SpaceStat[]> {
  try {
    const stats = await resolveProfileStats(spaceId)
    return stats.map((s) => ({ metric: s.metric, label: s.label, value: s.value }))
  } catch {
    return []
  }
}

/** The Space's UPCOMING events (soonest first, cancelled dropped), for the SpaceEvents block. Reuses
 *  listEventsForSpace (never re-queries events raw). FAIL-SAFE to []. */
export async function getSpaceUpcomingEvents(spaceId: string): Promise<SpaceEventItem[]> {
  try {
    const events = await listEventsForSpace(spaceId, { limit: 24, upcomingOnly: true })
    return events
      .filter((e) => !e.is_cancelled)
      .map((e) => ({ id: e.id, slug: e.slug, title: e.title, startsAt: e.starts_at }))
  } catch {
    return []
  }
}

/** Whether the Space is currently taking bookings + the booking tab href, for the SpaceBooking block.
 *  HONEST: `enabled` is true only when the Space actually publishes at least one availability window
 *  (space_availability row), so the block is a real entry, never an empty promise. Reads the count via
 *  the untyped admin handle (the table is not in the generated types yet, ADR-246). FAIL-SAFE to a
 *  disabled state. */
export async function getSpaceBookingInfo(
  spaceId: string,
  slug: string | null,
): Promise<SpaceBookingInfo> {
  const href = slug ? `/spaces/${slug}/book` : null
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (cols: string, opts: { count: 'exact'; head: true }) => {
          eq: (c: string, v: string) => Promise<{ count: number | null }>
        }
      }
    }
    const { count } = await admin
      .from('space_availability')
      .select('id', { count: 'exact', head: true })
      .eq('space_id', spaceId)
    return { enabled: (count ?? 0) > 0, href }
  } catch {
    return { enabled: false, href }
  }
}

// How many practices / journeys / circles a Profile block surfaces. Generous relative to what a
// card grid shows; the block slices to its own cap.
const PRACTICES_CAP = 6
const JOURNEYS_CAP = 6
const CIRCLES_CAP = 6

/** The Space's live practices + journeys for the SpacePractices block, from the SAME readers the
 *  entity-practices module uses (listPracticesForSpace + listJourneyPlansForSpace, both space_id-
 *  filtered + fail-safe), shaped to the plain block item. No new raw query. FAIL-SAFE to empty groups. */
export async function getSpacePractices(spaceId: string): Promise<SpacePracticesData> {
  try {
    const [practices, journeys] = await Promise.all([
      listPracticesForSpace(spaceId, PRACTICES_CAP),
      listJourneyPlansForSpace(spaceId, JOURNEYS_CAP),
    ])
    return {
      practices: practices.map((p) => ({
        kind: 'practice' as const,
        id: p.id,
        slug: p.slug || p.id,
        title: p.title,
        summary: p.summary ?? p.description ?? null,
        emoji: p.icon ?? null,
        adoptCount: 0,
      })),
      journeys: journeys.map((j) => ({
        kind: 'journey' as const,
        id: j.id,
        slug: j.slug,
        title: j.title,
        summary: j.summary ?? null,
        emoji: j.emoji ?? null,
        adoptCount: j.adopt_count > 0 ? j.adopt_count : 0,
      })),
    }
  } catch {
    return { practices: [], journeys: [] }
  }
}

// How many team members the Team block surfaces, and the operator roles that count as "team" (a viewer
// is a follower/member, not staff). Kept in lock-step with the space-role ladder (lib/spaces/membership).
const TEAM_CAP = 24
const TEAM_ROLES = ['admin', 'moderator', 'editor'] as const

type TeamRow = Row & {
  member?: { display_name?: unknown; handle?: unknown; avatar_url?: unknown } | null
}

/** The people who RUN a Space, for the Team block: active `space_members` holding an operator role
 *  (editor / moderator / admin), joined to each person's public profile, ordered by authority (admin
 *  first). Reads the not-yet-typed table via the untyped admin handle (ADR-246). The Space OWNER has no
 *  membership row (spaces.owner_profile_id), so this is exactly the team the operator has added — never
 *  invented. FAIL-SAFE to [] (a brand-new / soloed Space renders no Team section). */
export async function getSpaceTeam(spaceId: string): Promise<SpaceTeamMember[]> {
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => {
              in: (c: string, v: readonly string[]) => {
                limit: (n: number) => Promise<{ data: TeamRow[] | null }>
              }
            }
          }
        }
      }
    }
    const { data } = await admin
      .from('space_members')
      .select('profile_id, role, member:profiles!profile_id ( display_name, handle, avatar_url )')
      .eq('space_id', spaceId)
      .eq('status', 'active')
      .in('role', TEAM_ROLES)
      .limit(TEAM_CAP)
    const rows = (data ?? []) as TeamRow[]
    return rows
      .map((r) => {
        const handle = strOrNull(r.member?.handle)
        return {
          profileId: str(r.profile_id),
          role: str(r.role),
          name: str(r.member?.display_name) || (handle ? `@${handle}` : 'Member'),
          handle,
          avatarUrl: strOrNull(r.member?.avatar_url),
        }
      })
      .filter((m) => m.profileId.length > 0)
      .sort((a, b) => spaceRoleRank(b.role) - spaceRoleRank(a.role))
  } catch {
    return []
  }
}

/** Resolve arbitrary picked NETWORK member ids to team-card shape (name / handle / avatar), for the
 *  Team block's member picker. Unlike getSpaceTeam (the Space's own role-holders), these are members
 *  the operator CHOSE from the whole network, so there is no space role to show. Only active members
 *  with a handle resolve (a handle is what the card links to, `/people/<handle>`); order follows the
 *  input `ids`, so the operator's chosen order is honored. FAIL-SAFE to []. */
export async function resolveMemberCards(ids: string[]): Promise<SpaceTeamMember[]> {
  const clean = Array.from(new Set((ids ?? []).map((id) => str(id).trim()).filter(Boolean)))
  if (clean.length === 0) return []
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('id, display_name, handle, avatar_url')
      .in('id', clean)
      .eq('is_active', true)
      .not('handle', 'is', null)
    const byId = new Map<string, SpaceTeamMember>()
    for (const r of (data ?? []) as Row[]) {
      const handle = strOrNull(r.handle)
      if (!handle) continue
      byId.set(str(r.id), {
        profileId: str(r.id),
        role: '',
        name: str(r.display_name) || `@${handle}`,
        handle,
        avatarUrl: strOrNull(r.avatar_url),
      })
    }
    return clean.map((id) => byId.get(id)).filter((m): m is SpaceTeamMember => Boolean(m))
  } catch {
    return []
  }
}

/** The Space's live active Circles for the SpaceCommunity block, from the SAME reader the
 *  entity-community module uses (listCirclesForSpace, space_id-filtered + fail-safe), keeping only
 *  active circles and shaping to the plain block item. No new raw query. FAIL-SAFE to []. */
export async function getSpaceCommunity(spaceId: string): Promise<SpaceCircleItem[]> {
  try {
    const circles = await listCirclesForSpace(spaceId, CIRCLES_CAP)
    return circles
      .filter((c) => c.status === 'active')
      .map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        about: c.about ?? null,
        memberCount: c.member_count ?? 0,
      }))
  } catch {
    return []
  }
}
