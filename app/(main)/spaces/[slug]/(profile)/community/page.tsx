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
import { CommunityWallFeed } from '@/components/spaces/community-wall-feed'
import { WallComposer } from '@/components/spaces/wall-composer'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'

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
              <TopicCircles spaceId={space.id} slug={space.slug} viewerProfileId={viewerProfileId} canManage={canManage} />
            </Suspense>
          </aside>
        </div>
      ) : (
        <ClosedWall standing={standing} brandName={brandName} slug={space.slug} />
      )}
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
  // The Space Circle is on its way out (ADR-1938); it is never listed as a topic circle.
  const topics = all.filter((c) => c.is_space_primary !== true)
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
