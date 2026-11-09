import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Lock, MessagesSquare, UsersRound } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug, getSpaceVisibility } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import {
  readWallSettings,
  readWallStanding,
  standingCanPost,
  standingCanRead,
} from '@/lib/spaces/community-wall'
import { listPublicSpaceCircles } from '@/lib/circles/store'
import { loadSpaceUpcomingFeed } from '@/lib/calendar/public-month'
import { readTagline } from '@/lib/spaces/tagline'
import { countActiveMembersByTier } from '@/lib/spaces/memberships'
import { listSpaceFollowerIds } from '@/lib/spaces/follows'
import { dayInZone } from '@/lib/time/zone'
import { UpcomingEventRows } from '@/components/events/upcoming-event-rows'
import { SectionHeader } from '@/components/ui/section-header'
import { CommunityWallFeed } from '@/components/spaces/community-wall-feed'
import { WallComposer } from '@/components/spaces/wall-composer'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { JsonLd } from '@/components/json-ld'
import { SITE_URL } from '@/lib/site'

// A SPACE'S COMMUNITY WALL (ADR-1938, LIVE-2077). The Space's public communications hub, a wall in
// the Facebook sense: the team and its members post, everyone the owner lets in reads, replies sit
// under each post. It REPLACES the Space Circle: the old built-in Circle's feed led the Circles tab;
// now the wall is its own tab and Circles is the second tab, listing the topic circles the Space
// starts. The page sits inside the (profile) route group, so the cover, the identity row and the tab
// menu come from the group's layout and this file is only the body and must never declare an <h1>.
//
// WHO MAY DO WHAT is the database's call (posts policies over private.can_read/post/moderate_space_wall).
// This page reads the same facts only to word itself: which composer, which closed-wall sentence.
//
// GATES, in order: a missing or hidden Space is a 404 (getVisibleSpaceBySlug fails closed); the root
// tenant has no wall and redirects to its own page.

export const dynamic = 'force-dynamic'

/** Topic circles listed beside the wall. The full list is the Circles tab. */
const CIRCLES_SHOWN = 4

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug, {
    segment: 'community',
    label: 'Community',
    describe: (brandName) => `What is happening at ${brandName}, from the people who run it and the people in it.`,
  })
}

export default async function SpaceCommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  if (space.type === 'root') redirect(`/spaces/${slug}`)
  setActiveSpace(space)

  const brandName = space.brandName ?? space.name
  const [settings, standing, visibility, caps] = await Promise.all([
    readWallSettings(space.id),
    readWallStanding({ spaceId: space.id, ownerProfileId: space.ownerProfileId, viewerProfileId }),
    getSpaceVisibility(slug),
    viewerProfileId ? getSpaceCapabilities(space, viewerProfileId) : Promise.resolve(null),
  ])

  const canManage = caps?.canEditProfile === true
  const canRead = canManage || standingCanRead(standing, settings, visibility === 'private')
  const canPost = canManage || standingCanPost(standing, settings)

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-section text-lead font-bold text-text">Community</h2>
        <p className="text-body-sm text-muted">
          What is happening at {brandName}, from the people who run it and the people in it.
        </p>
        {canManage ? (
          <Link href={`/spaces/${space.slug}/manage/community`} className={buttonClasses('secondary', 'sm', 'mt-3')}>
            Wall settings
          </Link>
        ) : null}
      </header>

      {canRead ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section aria-label="The wall" className="min-w-0 space-y-4">
            {canPost ? (
              <WallComposer spaceId={space.id} slug={space.slug} spaceName={brandName} />
            ) : (
              <ClosedToPost standing={standing} brandName={brandName} slug={space.slug} />
            )}
            <Suspense fallback={null}>
              <CommunityWallFeed
                spaceId={space.id}
                myProfileId={viewerProfileId}
                viewerRole={canManage ? 'host' : 'member'}
                emptyTitle={canManage ? 'Start the conversation' : 'Nothing on the wall yet'}
                emptyBody={
                  canManage
                    ? 'A first post from you gives everyone else something to reply to.'
                    : `When ${brandName} posts, it shows up here.`
                }
              />
            </Suspense>
          </section>

          <aside aria-label="Beside the wall" className="min-w-0 space-y-4">
            <Suspense fallback={null}>
              <AboutTheSpace spaceId={space.id} slug={space.slug} brandName={brandName} standing={standing} />
            </Suspense>
            <Suspense fallback={null}>
              <WhatsHappening spaceId={space.id} slug={space.slug} timeZone={space.timeZone ?? null} canManage={canManage} />
            </Suspense>
            <Suspense fallback={null}>
              <TopicCircles spaceId={space.id} slug={space.slug} viewerProfileId={viewerProfileId} canManage={canManage} />
            </Suspense>
          </aside>
        </div>
      ) : (
        <ClosedWall standing={standing} brandName={brandName} slug={space.slug} />
      )}

      {/* The wall as a page a crawler can name (LIVE-2079): a CollectionPage about the Space. Only a
          wall anyone may read gets it; a members-only or private wall describes nothing to a visitor. */}
      {settings.readAccess === 'anyone' && visibility !== 'private' ? (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: `Community at ${brandName}`,
            url: `${SITE_URL}/spaces/${space.slug}/community`,
            about: { '@type': 'Organization', name: brandName, url: `${SITE_URL}/spaces/${space.slug}` },
          }}
        />
      ) : null}
    </div>
  )
}

/** A wall the viewer can read but not post on: one sentence, one door. */
function ClosedToPost({ standing, brandName, slug }: { standing: string; brandName: string; slug: string }) {
  const signedOut = standing === 'signed-out'
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed border-border bg-surface/60 px-4 py-3">
      <p className="text-body-sm text-muted">
        {signedOut
          ? `Sign in to see how to join the conversation at ${brandName}.`
          : standing === 'follower'
            ? `${brandName} keeps posting to its members. Join to post.`
            : `Posting is for the people ${brandName} has let in. Join to be one of them.`}
      </p>
      <Link
        href={signedOut ? `/sign-in?next=/spaces/${slug}/community` : `/spaces/${slug}/memberships`}
        className={buttonClasses('secondary', 'sm')}
      >
        {signedOut ? 'Sign in' : 'See how to join'}
      </Link>
    </div>
  )
}

/** A wall the owner has closed to this viewer: say so, and sell the door. */
function ClosedWall({ standing, brandName, slug }: { standing: string; brandName: string; slug: string }) {
  const signedOut = standing === 'signed-out'
  return (
    <EmptyState
      icon={Lock}
      title="This wall is for members"
      description={`${brandName} keeps its conversation for the people inside. Join and you will see it all.`}
      action={
        <Link
          href={signedOut ? `/sign-in?next=/spaces/${slug}/community` : `/spaces/${slug}/memberships`}
          className={buttonClasses('primary', 'sm')}
        >
          {signedOut ? 'Sign in' : 'See how to join'}
        </Link>
      }
    />
  )
}

/** The topic circles this Space has started, beside the wall. The whole list is the Circles tab. */
async function TopicCircles({
  spaceId,
  slug,
  viewerProfileId,
  canManage,
}: {
  spaceId: string
  slug: string
  viewerProfileId: string | null
  canManage: boolean
}) {
  const all = await listPublicSpaceCircles(spaceId, { viewerProfileId, limit: 20, includeHidden: canManage })
  const topics = all
  const shown = topics.slice(0, CIRCLES_SHOWN)

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h3 className="flex items-center gap-2 text-body-sm font-bold text-text">
        <UsersRound className="h-4 w-4 text-primary-strong" aria-hidden />
        Circles
      </h3>
      {shown.length === 0 ? (
        <p className="mt-2 text-meta leading-relaxed text-muted">
          {canManage
            ? 'Start a circle for a topic and it is listed here.'
            : 'No topic circles yet.'}
        </p>
      ) : (
        <ul className="mt-2 list-none space-y-1 p-0">
          {shown.map((c) => (
            <li key={c.id}>
              <Link
                href={`/circles/${c.slug}`}
                className="flex items-center justify-between gap-3 rounded-control px-1 py-2 text-body-sm text-text transition-colors hover:bg-surface-elevated"
              >
                <span className="min-w-0 truncate font-semibold">{c.name}</span>
                <span className="shrink-0 text-meta text-subtle">{c.member_count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={`/spaces/${slug}/circles`}
        className="mt-3 inline-flex items-center gap-1.5 text-meta font-semibold text-primary-strong hover:underline"
      >
        <MessagesSquare className="h-3.5 w-3.5" aria-hidden />
        {topics.length > CIRCLES_SHOWN ? `All ${topics.length} circles` : 'Open Circles'}
      </Link>
    </section>
  )
}

/** EVENTS SHOWN beside the wall. The full calendar is its own tab. */
const EVENTS_SHOWN = 3

/**
 * The Space calendar on the Community page (owner ruling 7, 2026-11-03): what is next, soonest first,
 * composed from the same rows the Calendar tab's Up next band renders, under the calendar's one name
 * (BLD-000 ruling 2: "What's Happening"). Honest-empty: a visitor sees nothing when nothing is
 * scheduled; the team sees one line and a door to add something.
 */
async function WhatsHappening({
  spaceId,
  slug,
  timeZone,
  canManage,
}: {
  spaceId: string
  slug: string
  timeZone: string | null
  canManage: boolean
}) {
  const rows = await loadSpaceUpcomingFeed(spaceId, dayInZone(new Date(), timeZone), EVENTS_SHOWN).catch(() => [])
  if (rows.length === 0 && !canManage) return null
  return (
    <section aria-labelledby="community-whats-happening" className="rounded-card border border-border bg-surface p-4">
      <SectionHeader id="community-whats-happening" title="What's Happening" count={rows.length || undefined} />
      {rows.length > 0 ? (
        <UpcomingEventRows events={rows} />
      ) : (
        <p className="text-body-sm text-muted">Nothing on the calendar yet. Add a gathering and it shows up here.</p>
      )}
      <Link href={`/spaces/${slug}/calendar`} className={buttonClasses('ghost', 'sm', 'mt-2')}>
        Open the calendar
      </Link>
    </section>
  )
}

/**
 * ABOUT AND WHO'S HERE beside the wall (the Circles handoff's side column): the Space's own line,
 * then how many people are in it, as counts only. Names and faces stay off a public page; the
 * People tab is where a member meets the others. Counts are fail-safe to zero.
 */
async function AboutTheSpace({
  spaceId,
  slug,
  brandName,
  standing,
}: {
  spaceId: string
  slug: string
  brandName: string
  standing: string
}) {
  const [tagline, byTier, followers] = await Promise.all([
    readTagline(spaceId).catch(() => null),
    countActiveMembersByTier(spaceId).catch(() => new Map<string, number>()),
    listSpaceFollowerIds(spaceId).catch(() => [] as string[]),
  ])
  const members = [...byTier.values()].reduce((n, c) => n + c, 0)
  const outside = standing === 'visitor' || standing === 'signed-out' || standing === 'follower'
  return (
    <section aria-labelledby="community-about" className="rounded-card border border-border bg-surface p-4">
      <SectionHeader id="community-about" title={`About ${brandName}`} />
      {tagline ? <p className="text-body-sm text-text">{tagline}</p> : null}
      <h3 className="mt-3 eyebrow text-muted">Who&apos;s here</h3>
      <p className="text-body-sm text-text">
        {members} {members === 1 ? 'member' : 'members'} · {followers.length}{' '}
        {followers.length === 1 ? 'follower' : 'followers'}
      </p>
      {outside ? (
        <Link href={`/spaces/${slug}/memberships`} className={buttonClasses('secondary', 'sm', 'mt-3')}>
          See how to join
        </Link>
      ) : null}
    </section>
  )
}
