import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles,
  Activity,
  Heart,
  MessagesSquare,
  Megaphone,
  Palette,
  Briefcase,
  Radio,
  Users,
  Circle as CircleIcon,
  MapPin,
  Hash,
  Settings,
  LayoutDashboard,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { relativeTime } from '@/lib/utils'
import { TuneInButton, TunedInButton } from '../channel-toggle'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'
import type { RawPost } from '@/components/feed/post-card'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { canCreate, getChannelCapabilities } from '@/lib/core/load-capabilities'
import { DetailTemplate, type DetailTab } from '@/components/templates/detail-template'
import { ChannelCover } from '@/components/channels/channel-cover'
import { ModuleCard } from '@/components/modules/module-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { UpcomingEventsWidget } from '@/components/events/upcoming-widget'
import { isProgram, listChapters, type ChapterSummary } from '@/lib/channels/programs'
import { StartChapterButton } from '@/components/channels/start-chapter-button'
import { ChaptersNearMe } from '@/components/channels/chapters-near-me'
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
// ─────────────────────────────────────────────────────────────────────────────

type TopicalChannel = {
  id: string
  name: string
  slug: string
  category: string
  description: string | null
  cover_image: string | null
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

/** One normalized card shape for the Circles/Chapters strips and grids, so the
 *  program and non-program branches render through the SAME card component. */
type GroupCardData = {
  id: string
  name: string
  slug: string
  type: 'in-person' | 'online'
  city: string | null
  neighborhood: string | null
  members: number
  cap: number
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  spirituality:     Sparkles,
  movement:         Activity,
  'holistic-health': Heart,
  'human-relating': MessagesSquare,
  activism:         Megaphone,
  creative:         Palette,
  'business-support': Briefcase,
}

const CATEGORY_ACCENT: Record<string, string> = {
  spirituality:     'text-signal-strong bg-signal-bg/40',
  movement:         'text-signal-strong bg-success-bg/40',
  'holistic-health': 'text-danger bg-danger-bg',
  'human-relating': 'text-signal-strong bg-signal-bg',
  activism:         'text-warning dark:text-primary bg-warning-bg',
  creative:         'text-warning bg-warning-bg/40',
  'business-support': 'text-muted dark:text-subtle bg-surface',
}

const CATEGORY_LABEL: Record<string, string> = {
  spirituality:     'Spirituality',
  movement:         'Movement',
  'holistic-health': 'Holistic Health',
  'human-relating': 'Human Relating',
  activism:         'Activism',
  creative:         'Creative',
  'business-support': 'Business Support',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The compact Circle/Chapter card, byte-matched to the ChaptersNearMe card so
 *  the directory reads identically with or without the geo re-sort. */
function GroupCard({ group }: { group: GroupCardData }) {
  return (
    <Link
      href={`/circles/${group.slug}`}
      className="block rounded-2xl border border-border bg-surface px-3 py-2.5 hover:border-primary-bg dark:hover:border-primary transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text truncate">{group.name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium shrink-0 ${
          group.type === 'in-person'
            ? 'bg-success-bg text-success'
            : 'bg-signal-bg text-signal-strong'
        }`}>
          {group.type === 'in-person' ? 'In-person' : 'Online'}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
        {(group.city || group.neighborhood) && (
          <span className="flex items-center gap-0.5">
            <MapPin className="w-2.5 h-2.5" />
            {group.neighborhood || group.city}
          </span>
        )}
        <span>
          {group.members}/{group.cap} members
        </span>
      </div>
    </Link>
  )
}

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
      <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-3">
        <p className="text-xs text-muted leading-relaxed">
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
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="font-medium text-text">{p.author?.display_name ?? 'Someone'}</span>
            <span>{relativeTime(p.created_at)}</span>
          </div>
          {p.body && <p className="mt-1 text-sm text-text line-clamp-2">{p.body}</p>}
        </Link>
      ))}
      <Link
        href={feedHref}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary-strong hover:underline"
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
    .select('id, name, slug, category, description, cover_image, is_active, template_id, owner_space_id, pillar_id')
    .eq(matchField, id)
    .maybeSingle()

  if (!rawChannel || !rawChannel.is_active) notFound()
  const channel = rawChannel as TopicalChannel

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
  const [
    { count: memberCount },
    { data: channelRoom },
    circlesRes,
    chapters,
    pillarRow,
    channelCaps,
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
  const groupScopeIds = groupCards.map((g) => g.id)

  // Staff-only in-place Edit (ADR-515 Phase 5): channel.manage resolves to staff only.
  // When held, the header carries the standardized admin-bar trigger PLUS the link into
  // the /channels/[id]/manage console — mirroring the event header's Edit + Manage pair.
  const canManageChannel = channelCaps.has('channel.manage')

  const Icon = CATEGORY_ICON[channel.category] ?? Radio
  const accent = CATEGORY_ACCENT[channel.category] ?? 'text-muted bg-surface'
  const categoryLabel = CATEGORY_LABEL[channel.category] ?? channel.category

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
    <StartChapterButton channelId={channel.id} label="Start the first Chapter" />
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
    <p className="mt-4 text-xs text-muted leading-relaxed">
      A Chapter is a local Circle of up to 50 people running the {channel.name} model.
      Start one where you live. You get a private draft to shape before anyone sees it.
    </p>
  ) : (
    <p className="mt-4 text-xs text-muted leading-relaxed">
      Circles are local crews of up to 50 people who meet regularly, in-person or
      online. Each one declares a Channel as its practice. Start one from the header
      above and you are its first host.
    </p>
  )

  return (
    <div>
      {/* Header band — opens on the channel's cover image when set, else a tasteful
          gradient (channels aren't inline-editable, so this is display-only). */}
      <ChannelCover imageUrl={channel.cover_image} name={channel.name} />

      {/* Unified Detail header (REDESIGN-INAPP Phase 1, the treatment shared with
          /events/[slug] and /circles/[slug]): category icon in the title node,
          one-line value prop + fact row as subtitle, join CTA + tools as actions. */}
      <DetailTemplate
        back={{ href: '/channels', label: 'Channels' }}
        title={
          <span className="inline-flex items-center gap-3">
            <span className={`flex h-9 w-9 items-center justify-center rounded-2xl shrink-0 ${accent}`}>
              <Icon className="h-5 w-5" />
            </span>
            {channel.name}
          </span>
        }
        subtitle={
          <>
            <p className="max-w-2xl leading-relaxed">{description}</p>
            {/* Fact row: social proof up front (pattern 2). */}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <Users className="w-3 h-3" />
              <span>{(memberCount ?? 0).toLocaleString()} tuned in</span>
              <span className="text-subtle/60">·</span>
              <CircleIcon className="w-3 h-3" />
              <span>
                {groupCount} {groupCount === 1 ? groupNoun : groupNounPlural}
              </span>
              {pillarName && (
                <>
                  <span className="text-subtle/60">·</span>
                  <span className="rounded-full bg-surface-elevated px-2 py-0.5 font-medium text-muted">
                    {pillarName} Pillar
                  </span>
                </>
              )}
            </div>
          </>
        }
        actions={
          myProfileId ? (
            <>
              {canManageChannel && (
                <>
                  <OpenAdminBarButton
                    scope={{ kind: 'channel', id: channel.id }}
                    caps={Array.from(channelCaps)}
                    label="Edit"
                    icon={<Settings className="h-4 w-4" />}
                  />
                  <Link
                    href={`${base}/manage`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
                  >
                    <LayoutDashboard className="h-4 w-4 text-subtle" />
                    Manage
                  </Link>
                </>
              )}
              {channelRoomId && (
                <Link
                  href={`/messages/r/${channelRoomId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
                >
                  <Hash className="h-4 w-4" /> Open room
                </Link>
              )}
              {isProgramChannel ? (
                // A program channel's one create verb: Start a Chapter (the
                // Remix flow). Same gate as Remix, so no crew popup here.
                <StartChapterButton channelId={channel.id} />
              ) : (
                // Kept, but demoted to a secondary button: on a hub the one
                // primary action is Tune in (pattern 1).
                <NewCircleCompose
                  topicalChannelId={channel.id}
                  topicalChannelName={channel.name}
                  buttonLabel="Start a Circle"
                  buttonClass="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated whitespace-nowrap"
                  canCreate={canStartCircle}
                />
              )}
              {isTunedIn
                ? <TunedInButton channelId={channel.id} channelName={channel.name} size="md" />
                : <TuneInButton channelId={channel.id} slug={channel.slug} size="md" />
              }
            </>
          ) : (
            // Signed-out visitors still get the one primary join CTA.
            <Link
              href={`/sign-in?next=/channels/${channel.slug}`}
              className="shrink-0 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors"
            >
              Sign in to tune in
            </Link>
          )
        }
        tabs={tabs}
      >
        <div className="space-y-8">
          {/* ── HOME: orientation + a taste of everything, each section pointing
                 into its full tab (pattern 3). */}
          {tab === 'home' && (
            <>
              <ModuleCard title={`Welcome to ${channel.name}`}>
                <p className="text-sm text-muted leading-relaxed">
                  Tune in to follow the forum from your feed. Find a {groupNoun} near you
                  under {groupNounPlural}. The About tab covers how this Channel works.
                </p>
              </ModuleCard>

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

              <section>
                <SectionHeader
                  title={isProgramChannel ? 'Chapters' : `Circles practicing ${channel.name}`}
                  count={groupCount}
                  href={groupsHref}
                />
                {groupCards.length === 0 ? (
                  emptyDirectory
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {groupCards.slice(0, 4).map((g) => (
                      <GroupCard key={g.id} group={g} />
                    ))}
                  </div>
                )}
              </section>

              {/* Upcoming events across this Channel's Circles/Chapters (pattern 5).
                  Reuses the existing UpcomingEventsWidget query (events by scope_id);
                  it renders nothing when there is nothing coming up. */}
              {groupScopeIds.length > 0 && (
                <Suspense fallback={<div className="h-16 rounded-2xl bg-surface animate-pulse" />}>
                  <UpcomingEventsWidget scopeIds={groupScopeIds} />
                </Suspense>
              )}
            </>
          )}

          {/* ── FEED: the full forum, exactly the pre-redesign behavior (composer
                 for tuned-in members, tune-in note otherwise, then the list). */}
          {tab === 'feed' && (
            <section>
              <div className="mb-4">
                <h2 className="text-sm font-bold text-text">Forum</h2>
                <p className="text-xs text-muted leading-relaxed mt-0.5">
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
                  <div className="mb-4 rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-3">
                    <p className="text-xs text-muted leading-relaxed">
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
                <p className="text-sm text-muted leading-relaxed">{description}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-surface-elevated px-2 py-0.5 font-medium text-muted">
                    {categoryLabel}
                  </span>
                  {pillarName && (
                    <span className="rounded-full bg-surface-elevated px-2 py-0.5 font-medium text-muted">
                      {pillarName} Pillar
                    </span>
                  )}
                </div>
              </ModuleCard>

              <ModuleCard title="How this Channel works">
                <div className="space-y-3 text-sm text-muted leading-relaxed">
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
