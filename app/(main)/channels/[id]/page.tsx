import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  Users,
  Circle as CircleIcon,
  Hash,
  Settings,
  LayoutDashboard,
} from 'lucide-react'
import {
  CHANNEL_CATEGORY_ICON,
  FALLBACK_CHANNEL_CATEGORY_ICON,
  channelCategoryAccent,
  channelCategoryLabel,
} from '@/lib/channels/categories'
import { createAdminClient } from '@/lib/supabase/admin'
import { DISCOVERABLE_CIRCLE_VISIBILITY } from '@/lib/circles/visibility'
import { createClient } from '@/lib/supabase/server'
import { relativeTime } from '@/lib/utils'
import { TuneInButton, TunedInButton } from '../channel-toggle'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'
import type { RawPost } from '@/components/feed/post-card'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { canCreate, getChannelCapabilities } from '@/lib/core/load-capabilities'
import { DetailTemplate, PageHero, HERO_ACTION_CLASS, type DetailTab } from '@/components/templates'
import { resolveHeaderElement } from '@/lib/elements/header'
import { buttonClasses } from '@/components/ui/button'
import { ModuleCard } from '@/components/modules/module-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { isProgram, listChapters, type ChapterSummary } from '@/lib/channels/programs'
import {
  readChannelCoverFocus,
  readChannelHeroHeight,
  hasChannelHeroHeight,
} from '@/lib/channels/hero'
import { StartChapterButton } from '@/components/channels/start-chapter-button'
import { ChaptersNearMe } from '@/components/channels/chapters-near-me'
import { ChannelRail } from '@/components/channels/channel-rail'
import { GroupCard, type GroupCardData } from '@/components/channels/group-card'
import type { CircleBase } from '@/lib/types/circle'

// ─────────────────────────────────────────────────────────────────────────────
// CHANNEL PAGE = the focus area's home (ADR-864 broadened the canon; ADR-868 put
// Channels in the main menu). A Channel is a community destination that HOSTS
// Circles, a forum, an open room, and (for Programs) a Chapter blueprint. The
// page must read as that destination, never as one Circle.
//
// Community-hub patterns applied here (researched July 2026):
//   1. Identity band with one clear value prop + a single primary join CTA
//      (Meetup group headers: https://www.meetup.com/).
//   2. Social proof rides the header fact row: tuned-in count + group count
//      (Meetup / Skool member counts:
//      https://www.carriemelissajones.com/blog/circle-vs-skool-comparison-2026).
//   3. Segmented body (Home / Feed / Circles / About) instead of one long
//      scroll: dedicated areas per content type beat one mixed feed
//      (Circle.so Spaces: https://www.group.app/blog/skool-vs-circle/).
//   4. The sub-group directory is first-class content with a geo affordance
//      ("find one near you": https://www.meetup.com/cities/,
//      https://www.acm.org/chapters/acm-meetups).
//   5. Upcoming events surface on the hub home, not buried in a sub-page
//      (Meetup group homes: https://www.meetup.com/find/).
//   6. A quiet about block explains what joining means, so newcomers orient
//      without a tutorial (Skool about panel / Circle.so onboarding guidance:
//      https://linodash.com/skool-vs-circle/).
//   7. SCOPE RAIL (owner request, 2026-07-28: "Give it a right column for activity, upcoming
//      event, associated circles"). The page fills DetailTemplate's `sidebar` slot with
//      <ChannelRail>, and lib/layout/page-chrome.ts marks /channels/<id> as 'scoped' so the
//      GLOBAL member rail is suppressed here. Before this, a wide, sparse content column sat
//      beside a rail of generic member modules (Your Quest, Your stats) that said nothing about
//      the Channel. Now the column carries the conversation and the rail carries the Channel's
//      own facts. docs/PAGE-FRAMEWORK.md §6 always specified exactly this shape for this route:
//      "rail: program, circles-in-topic, events".
// ─────────────────────────────────────────────────────────────────────────────

type TopicalChannel = {
  id: string
  name: string
  slug: string
  category: string
  description: string | null
  cover_image: string | null
  theme: unknown
  is_active: boolean
  template_id: string | null
  owner_space_id: string | null
  pillar_id: string | null
}

type CircleRow = CircleBase & {
  slug: string
  type: 'in-person' | 'online'
  city: string | null
  neighborhood: string | null
  host: { display_name: string; handle: string } | null
}

// The normalized Circle/Chapter card shape (GroupCardData) and its card component now live in
// components/channels/group-card.tsx, because the scope RAIL renders the same card as the body
// directory. One component, two placements, no drift.

// The category icon, accent, and label all come from lib/channels/categories (ADR-879), the same
// file the staff settings select reads, so an operator can no longer pick a category this page
// does not know. Every reader is total: an off-list legacy value keeps its own text and the
// generic Radio icon.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Home-tab forum preview: the three latest posts through the SAME visibility
 *  RPC FeedList uses (scoped_feed_for_viewer), so a non-member previews only
 *  the Channel's public posts. Compact rows, then a pointer to the Feed tab. */
async function ForumPreview({
  channelId,
  myProfileId,
  isTunedIn,
  feedHref,
}: {
  channelId: string
  myProfileId: string | null
  isTunedIn: boolean
  feedHref: string
}) {
  let posts: RawPost[] = []
  if (myProfileId) {
    const supabase = await createClient()
    const { data } = await supabase.rpc('scoped_feed_for_viewer', {
      _scope_ids: [channelId],
      _sort: 'recent',
      _limit: 3,
    })
    posts = (data as RawPost[] | null) ?? []
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border bg-surface/60 px-4 py-3">
        <p className="text-meta text-muted leading-relaxed">
          {!myProfileId
            ? 'The forum is where people tuned in talk shop. Sign in to read and post.'
            : isTunedIn
              ? 'No posts yet. Start the conversation from the Feed tab.'
              : 'No posts to show. Tune in to follow this forum from your feed.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {posts.map((p) => (
        <Link
          key={p.id}
          href={feedHref}
          className="block rounded-2xl border border-border bg-surface px-3 py-2.5 hover:border-primary-bg dark:hover:border-primary transition-colors"
        >
          <div className="flex items-center gap-2 text-meta text-muted">
            <span className="font-medium text-text">{p.author?.display_name ?? 'Someone'}</span>
            <span>{relativeTime(p.created_at)}</span>
          </div>
          {p.body && <p className="mt-1 text-body-sm text-text line-clamp-2">{p.body}</p>}
        </Link>
      ))}
      <Link
        href={feedHref}
        className="inline-flex items-center gap-1 text-meta font-medium text-primary-strong hover:underline"
      >
        Open the full feed →
      </Link>
    </div>
  )
}

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const admin = createAdminClient()
  const [{ id }, { tab: rawTab }, supabase] = await Promise.all([
    params,
    searchParams,
    createClient(),
  ])

  const matchField = UUID_RE.test(id) ? 'id' : 'slug'
  const { data: rawChannel } = await admin
    .from('topical_channels')
    .select('id, name, slug, category, description, cover_image, theme, is_active, template_id, owner_space_id, pillar_id')
    .eq(matchField, id)
    .maybeSingle()

  // `theme` post-dates lib/database.types.ts, so the typed select narrows to a query-error union and
  // the row is read through unknown (ADR-246, the repo's standing seam for a not-yet-generated column).
  const channel = rawChannel as unknown as TopicalChannel | null
  if (!channel || !channel.is_active) notFound()

  // A Channel with a blueprint attached is a PROGRAM: its circles are Chapters
  // (local circles running the model), and the primary create verb becomes
  // "Start a Chapter" (the Remix flow, stamped into this channel).
  const isProgramChannel = isProgram(channel)
  const groupNoun = isProgramChannel ? 'Chapter' : 'Circle'
  const groupNounPlural = isProgramChannel ? 'Chapters' : 'Circles'

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let myProfileId: string | null = null
  let isTunedIn = false
  let canStartCircle = false

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      myProfileId = profile.id
      // Real Crew (or steward/staff) may start a circle here; others get the popup.
      canStartCircle = await canCreate('circle.create')
      const { data: membership } = await admin
        .from('topical_channel_memberships')
        .select('id')
        .eq('topical_channel_id', channel.id)
        .eq('profile_id', myProfileId)
        .maybeSingle()
      isTunedIn = !!membership
    }
  }

  // Header + directory data, all independent → one concurrent batch:
  //   - tuned-in count (fact row)
  //   - the channel's open room (Phase B: one per channel, read-open; tuned-in members post)
  //   - the Circles directory (non-programs; exact count for the fact row, top 12 for the grid)
  //   - the Chapters directory (programs, via lib/channels/programs for the geo sort)
  //   - the Pillar this Channel sorts under (topical_channels.pillar_id; table is
  //     newer than the generated types → untyped read, same as channels-list)
  //   - the viewer's channel capabilities (channel.manage = staff, ADR-515 Phase 5)
  //   - the standardized header element config (ADR-793): identity layout at the
  //     standard height unless an /admin/elements master retunes it (no deploy)
  const [
    { count: memberCount },
    { data: channelRoom },
    circlesRes,
    chapters,
    pillarRow,
    channelCaps,
    header,
  ] = await Promise.all([
    admin
      .from('topical_channel_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('topical_channel_id', channel.id),
    admin
      .from('rooms')
      .select('id')
      .eq('visibility', 'channel')
      .eq('scope_id', channel.id)
      .maybeSingle(),
    isProgramChannel
      ? Promise.resolve({ data: null, count: null })
      : admin
          .from('circles')
          .select(
            `id, name, slug, type, member_count, member_cap, status, city, neighborhood,
             host:profiles!host_id ( display_name, handle )`,
            { count: 'exact' }
          )
          .eq('topical_channel_id', channel.id)
          .neq('status', 'archived')
          // 🔴 Admin client = no RLS (ADR-1015). An Interest page is a BROWSE surface, so it may
          // only name circles anyone could already browse: unlisted and private both drop out.
          .in('visibility', [...DISCOVERABLE_CIRCLE_VISIBILITY])
          .order('member_count', { ascending: false })
          .limit(12),
    isProgramChannel ? listChapters(channel.id) : Promise.resolve<ChapterSummary[]>([]),
    channel.pillar_id
      ? (admin)
          .from('pillars')
          .select('name')
          .eq('id', channel.pillar_id)
          .maybeSingle()
          .then(({ data }) => data as { name: string } | null)
      : Promise.resolve(null),
    getChannelCapabilities(channel.id),
    resolveHeaderElement({ defaults: { layout: 'identity', height: 'standard' } }),
  ])

  const channelRoomId = (channelRoom as { id: string } | null)?.id ?? null
  const circles = ((circlesRes.data ?? []) as unknown) as CircleRow[]
  const groupCount = isProgramChannel ? chapters.length : (circlesRes.count ?? circles.length)
  const pillarName = pillarRow?.name ?? null

  // One normalized card list for the Home strip + non-program directory grid.
  const groupCards: GroupCardData[] = isProgramChannel
    ? chapters.map((c) => ({
        id: c.id, name: c.name, slug: c.slug, type: c.type,
        city: c.city, neighborhood: c.neighborhood,
        members: c.memberCount, cap: c.memberCap,
      }))
    : circles.map((c) => ({
        id: c.id, name: c.name, slug: c.slug, type: c.type,
        city: c.city, neighborhood: c.neighborhood,
        members: c.member_count, cap: c.member_cap,
      }))

  // Staff-only in-place Edit (ADR-515 Phase 5): channel.manage resolves to staff only.
  // When held, the header carries the standardized admin-bar trigger PLUS the link into
  // the /channels/[id]/manage console — mirroring the event header's Edit + Manage pair.
  const canManageChannel = channelCaps.has('channel.manage')

  // The saved header settings (topical_channels.theme, ADR-886). An untouched Channel resolves to
  // the centered default and NO explicit height, which is exactly today's render.
  //
  // savedHeroHeight is deliberately null-unless-chosen rather than always a value: the header
  // ELEMENT config (resolveHeaderElement, ADR-793) also has an opinion about height, and it should
  // keep deciding for every Channel no operator has tuned. Once an operator picks one, theirs wins.
  const channelCoverFocus = readChannelCoverFocus(channel.theme)
  const storedHeight = readChannelHeroHeight(channel.theme)
  const savedHeroHeight = hasChannelHeroHeight(channel.theme) ? storedHeight : null

  const Icon = CHANNEL_CATEGORY_ICON[channel.category] ?? FALLBACK_CHANNEL_CATEGORY_ICON
  const accent = channelCategoryAccent(channel.category)
  const categoryLabel = channelCategoryLabel(channel.category)

  // Defensive: the 20240206 migration rewrites the seeded descriptions to
  // remove em dashes, but until it lands on every environment we strip
  // them at render time so the UI is consistent everywhere.
  const description = (channel.description ?? 'A global channel anyone can tune into.')
    .replace(/\s*—\s*/g, '. ')

  // ── Segmented body (?tab=): server-rendered + shareable, the same idiom the
  // events manage hub uses for its sections. 'chapters' and 'circles' are one
  // tab whose label follows the channel kind; both params resolve to it.
  const base = `/channels/${id}`
  const groupsParam = isProgramChannel ? 'chapters' : 'circles'
  type Tab = 'home' | 'feed' | 'groups' | 'about'
  const tab: Tab =
    rawTab === 'feed' ? 'feed'
    : rawTab === 'about' ? 'about'
    : rawTab === 'chapters' || rawTab === 'circles' ? 'groups'
    : 'home'
  const feedHref = `${base}?tab=feed`
  const groupsHref = `${base}?tab=${groupsParam}`
  const tabs: DetailTab[] = [
    { href: base, label: 'Home', active: tab === 'home' },
    { href: feedHref, label: 'Feed', active: tab === 'feed' },
    { href: groupsHref, label: groupNounPlural, active: tab === 'groups' },
    { href: `${base}?tab=about`, label: 'About', active: tab === 'about' },
  ]

  // Shared blocks (Home strip + directory tab render the same pieces).
  const startGroupCta = isProgramChannel ? (
    <StartChapterButton channelId={channel.id} label="Start the first Chapter" canCreate={canStartCircle} />
  ) : (
    <NewCircleCompose
      topicalChannelId={channel.id}
      topicalChannelName={channel.name}
      buttonLabel="Start the first Circle"
      canCreate={canStartCircle}
    />
  )
  const emptyDirectory = (
    <EmptyState
      icon={CircleIcon}
      title={`No ${groupNounPlural} yet`}
      description={
        isProgramChannel
          ? `Start the first Chapter of ${channel.name} where you live.`
          : `A Channel gathers the Circles practicing it. Start the first ${channel.name} Circle where you live.`
      }
      action={myProfileId ? startGroupCta : undefined}
    />
  )
  const directoryNote = isProgramChannel ? (
    <p className="mt-4 text-meta text-muted leading-relaxed">
      A Chapter is a local Circle of up to 50 people running the {channel.name} model.
      Start one where you live. You get a private draft to shape before anyone sees it.
    </p>
  ) : (
    <p className="mt-4 text-meta text-muted leading-relaxed">
      Circles are local crews of up to 50 people who meet regularly, in-person or
      online. Each one declares a Channel as its practice. Start one from the header
      above and you are its first Host.
    </p>
  )

  return (
    <div>
      {/* ── UNIFIED ENTITY HEADER (the events/Spaces grammar, ADR-793) ─────────────────────────
          Extracted rules, mirrored from the Space profile ((profile)/layout.tsx), the Journey page,
          and the person profile — the ONE header system every destination page now opens on:
            1. COVER: one immersive PageHero band as DetailTemplate's `hero` slot (rounded-3xl,
               border, min-height off the header element's size ladder), never a standalone cover
               card with the title stranded below it. No cover = the neutral token gradient.
            2. TUNABLE: layout/height/overlay resolve through resolveHeaderElement (identity/
               standard defaults, the entity-page idiom), so /admin/elements retunes it, no deploy.
            3. TITLE: the single h1 rides the cover, bottom-left, over the ink scrim (on-ink copy),
               with a leading chip (the category icon) and the uppercase accent eyebrow above it —
               the Space-page lockup.
            4. SUBTITLE: one quiet on-ink line on the cover (the value prop).
            5. ACTIONS: bottom-right ON the cover. ONE filled primary CTA (Tune in, the Space
               pattern: accent fill + lift-1 so it lifts off the photo); secondaries use the
               glassy on-ink HERO_ACTION_CLASS.
            6. ADMIN: never on the cover — Edit + Manage read as a light row in the `band` below
               the hero (the Journey/Profile placement).
            7. BAND: icon fact rows, key fact semibold (the events subtitle idiom); social proof
               up front (pattern 2).
            8. BACK: DetailTemplate's `back` slot, above the band. Tabs stay in `tabs`. */}
      <DetailTemplate
        back={{ href: '/channels', label: 'Channels' }}
        title={channel.name}
        hero={
          <PageHero
            variant={header.layout}
            size={savedHeroHeight ?? header.height}
            overlayStyle={header.overlayStyle}
            coverImage={channel.cover_image}
            coverFocus={channelCoverFocus}
            leading={
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow ring-1 ring-on-ink/10 backdrop-blur ${accent}`}>
                <Icon className="h-6 w-6" />
              </span>
            }
            eyebrow={categoryLabel}
            title={channel.name}
            subtitle={description}
            actions={
              myProfileId ? (
                <>
                  {channelRoomId && (
                    <Link href={`/messages/r/${channelRoomId}`} className={HERO_ACTION_CLASS}>
                      <Hash className="h-4 w-4" /> Open room
                    </Link>
                  )}
                  {isProgramChannel ? (
                    // A program channel's one create verb: Start a Chapter (the
                    // Remix flow). Same gate as Remix AND as starting a Circle —
                    // a Chapter is one (ADR-891), so the crew popup applies here too.
                    <StartChapterButton
                      channelId={channel.id}
                      className={`${HERO_ACTION_CLASS} whitespace-nowrap`}
                      canCreate={canStartCircle}
                    />
                  ) : (
                    // Kept, but demoted to a secondary button: on a hub the one
                    // primary action is Tune in (pattern 1).
                    <NewCircleCompose
                      topicalChannelId={channel.id}
                      topicalChannelName={channel.name}
                      buttonLabel="Start a Circle"
                      buttonClass={`${HERO_ACTION_CLASS} whitespace-nowrap`}
                      canCreate={canStartCircle}
                    />
                  )}
                  {isTunedIn
                    ? (
                      <TunedInButton
                        channelId={channel.id}
                        channelName={channel.name}
                        size="md"
                        className={HERO_ACTION_CLASS}
                      />
                    )
                    : (
                      <TuneInButton
                        channelId={channel.id}
                        slug={channel.slug}
                        size="md"
                        // The kit's primary tokens + the hero lift (§8.5: primary CTAs on a
                        // cover stay bg-primary with lift-1) — never a hand-rolled string.
                        className={buttonClasses('primary', 'md', 'shrink-0 lift-1')}
                      />
                    )
                  }
                </>
              ) : (
                // Signed-out visitors still get the one primary join CTA.
                <Link
                  href={`/sign-in?next=/channels/${channel.slug}`}
                  className={buttonClasses('primary', 'md', 'shrink-0 lift-1')}
                >
                  Sign in to tune in
                </Link>
              )
            }
          />
        }
        band={
          <div className="min-w-0 space-y-2">
            {/* Staff tools read as a normal light row BELOW the header (never riding the
                cover) — the Journey/Profile placement for the standardized admin affordances. */}
            {canManageChannel && (
              <div className="flex flex-wrap items-center gap-2 pb-1">
                <OpenAdminBarButton
                  scope={{ kind: 'channel', id: channel.id }}
                  caps={Array.from(channelCaps)}
                  label="Edit"
                  icon={<Settings className="h-4 w-4" />}
                />
                <Link
                  href={`${base}/manage`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-body-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
                >
                  <LayoutDashboard className="h-4 w-4 text-subtle" />
                  Manage
                </Link>
              </div>
            )}

            {/* Fact row — the events-header idiom: icon rows, social proof up front
                (pattern 2), the key fact a step stronger. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-primary-strong shrink-0" />
                <span className="font-semibold text-text">
                  {(memberCount ?? 0).toLocaleString()} tuned in
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <CircleIcon className="w-4 h-4 text-subtle shrink-0" />
                <span>
                  {groupCount} {groupCount === 1 ? groupNoun : groupNounPlural}
                </span>
              </span>
              {pillarName && (
                <span className="inline-flex items-center rounded-pill bg-surface-elevated px-2 py-0.5 text-meta font-medium text-muted">
                  {pillarName} Pillar
                </span>
              )}
            </div>
          </div>
        }
        tabs={tabs}
        sidebar={
          /* ── THE CHANNEL SCOPE RAIL (pattern 7) ────────────────────────────────────────────
             Activity · Upcoming · the {groupNounPlural} practicing this Channel. The global
             member rail is suppressed on this exact route by lib/layout/page-chrome.ts
             (SCOPED_PATTERNS), so there is still exactly one right column. Nothing here is
             awaited on the page's top-level path: the two modules that read the database sit
             behind their own <Suspense> inside the rail, and the directory module renders the
             Circles this page already loaded. */
          <ChannelRail
            tab={tab}
            channelId={channel.id}
            channelName={channel.name}
            groupNoun={groupNoun}
            groupNounPlural={groupNounPlural}
            groups={groupCards}
            groupCount={groupCount}
            groupsHref={groupsHref}
            startGroupCta={myProfileId ? startGroupCta : undefined}
          />
        }
      >
        <div className="space-y-8">
          {/* ── HOME: orientation + a taste of everything, each section pointing
                 into its full tab (pattern 3). */}
          {tab === 'home' && (
            <>
              <ModuleCard title={`Welcome to ${channel.name}`}>
                <p className="text-body-sm text-muted leading-relaxed">
                  Tune in to follow the forum from your feed. Find a {groupNoun} near you
                  under {groupNounPlural}. The About tab covers how this Channel works.
                </p>
              </ModuleCard>

              {/* The content column carries the CONVERSATION. The Channel's facts (its pulse,
                  what is coming up, the {groupNounPlural} practicing it) live in the scope rail
                  beside it, so neither column repeats the other (pattern 7). */}
              <section>
                <SectionHeader title="Latest in the forum" href={feedHref} />
                <Suspense fallback={<div className="h-24 rounded-2xl bg-surface animate-pulse" />}>
                  <ForumPreview
                    channelId={channel.id}
                    myProfileId={myProfileId}
                    isTunedIn={isTunedIn}
                    feedHref={feedHref}
                  />
                </Suspense>
              </section>
            </>
          )}

          {/* ── FEED: the full forum, exactly the pre-redesign behavior (composer
                 for tuned-in members, tune-in note otherwise, then the list). */}
          {tab === 'feed' && (
            <section>
              <div className="mb-4">
                <h2 className="text-body-sm font-bold text-text">Forum</h2>
                <p className="text-meta text-muted leading-relaxed mt-0.5">
                  Open to anyone tuned in. Talk shop, share, swap notes.
                </p>
              </div>
              {isTunedIn ? (
                <Composer
                  scopeId={channel.id}
                  visibility="public"
                  placeholder={`Post to ${channel.name}…`}
                />
              ) : (
                myProfileId && (
                  <div className="mb-4 rounded-card border border-dashed border-border bg-surface/60 px-4 py-3">
                    <p className="text-meta text-muted leading-relaxed">
                      Tune in to post and follow this forum from your feed.
                    </p>
                  </div>
                )
              )}
              <Suspense fallback={<div className="h-32 rounded-2xl bg-surface animate-pulse" />}>
                <FeedList
                  circleIds={[channel.id]}
                  showPublicLayer={false}
                  myProfileId={myProfileId}
                  emptyMessage={
                    isTunedIn
                      ? 'No posts yet. Start the conversation.'
                      : 'No posts yet. Tune in to see and join the conversation.'
                  }
                />
              </Suspense>
            </section>
          )}

          {/* ── CIRCLES / CHAPTERS: the full directory (pattern 4). Programs get
                 the geo-sortable ChaptersNearMe; non-programs get the card grid. */}
          {tab === 'groups' && (
            <ModuleCard
              title={isProgramChannel ? `Chapters of ${channel.name}` : `Circles practicing ${channel.name}`}
              badge={groupCount > 0 ? String(groupCount) : undefined}
            >
              {groupCards.length === 0 ? (
                emptyDirectory
              ) : isProgramChannel ? (
                <ChaptersNearMe chapters={chapters} />
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {groupCards.map((g) => (
                    <GroupCard key={g.id} group={g} />
                  ))}
                </div>
              )}
              {directoryNote}
            </ModuleCard>
          )}

          {/* ── ABOUT: the quiet orientation block (pattern 6). */}
          {tab === 'about' && (
            <>
              <ModuleCard title={`About ${channel.name}`}>
                <p className="text-body-sm text-muted leading-relaxed">{description}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-meta">
                  <span className="rounded-pill bg-surface-elevated px-2 py-0.5 font-medium text-muted">
                    {categoryLabel}
                  </span>
                  {pillarName && (
                    <span className="rounded-pill bg-surface-elevated px-2 py-0.5 font-medium text-muted">
                      {pillarName} Pillar
                    </span>
                  )}
                </div>
              </ModuleCard>

              <ModuleCard title="How this Channel works">
                <div className="space-y-3 text-body-sm text-muted leading-relaxed">
                  <p>
                    Tuning in follows this Channel: forum posts reach your feed and you
                    can post here. Tune out any time from the header.
                  </p>
                  <p>
                    {isProgramChannel
                      ? `${channel.name} runs as a Program. Chapters are local Circles of up to 50 people running its model where they live. Find one near you under Chapters.`
                      : `Circles are local crews of up to 50 people who meet regularly, in-person or online. The ones practicing ${channel.name} live under Circles.`}
                  </p>
                  {channelRoomId ? (
                    <p>
                      Every Channel has one open room. Anyone can read it; tuned-in members
                      post.{' '}
                      <Link
                        href={`/messages/r/${channelRoomId}`}
                        className="font-medium text-primary-strong hover:underline"
                      >
                        Open the room
                      </Link>
                    </p>
                  ) : null}
                  {isProgramChannel && (
                    <p>
                      Starting a Chapter uses the Program&apos;s blueprint: you get a private
                      draft to shape before anyone sees it, and it lands here when you publish.
                    </p>
                  )}
                </div>
              </ModuleCard>
            </>
          )}
        </div>
      </DetailTemplate>
    </div>
  )
}
