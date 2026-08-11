import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { isFollowing } from '@/lib/spaces/follows'
import {
  getSpaceCommunityFeed,
  getSpaceUpcomingEvents,
  getSpacePractices,
  getSpaceCommunity,
  getSpaceBookingInfo,
} from '@/lib/spaces/content-data'
import { readProfileData } from '@/lib/spaces/profile-data'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { SpaceCommunityFeed } from '@/components/spaces/community/space-community-feed'
import { SpaceCommunityRail } from '@/components/spaces/community/space-community-rail'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'

// THE COMMUNITY TAB (business Community feed). Best-practice business-page layout: the FEED on the left, a
// right rail with core business info + DYNAMIC feature cards (events, practices/journeys, circles, booking)
// that appear only when the business has that feature on. PUBLIC read; only followers (or the operator) may
// react + comment + post. The identity Hero + tab chrome come from the (profile) layout; this is the body.

// Its OWN canonical + title. Without this the tab inherits the Space ROOT's metadata and declares
// itself a duplicate of a page it is not (FINALIZE-PLAN §9.5).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug, {
    segment: 'community',
    label: 'Community',
    describe: (brandName) => `Posts and updates from ${brandName}, with replies from members.`,
  })
}

export default async function SpaceCommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  setActiveSpace(space)

  const [manage, following, feed, events, practices, circles, booking] = await Promise.all([
    resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole ?? null),
    viewerProfileId ? isFollowing(space.id, viewerProfileId) : Promise.resolve(false),
    getSpaceCommunityFeed(space.id, viewerProfileId),
    getSpaceUpcomingEvents(space.id),
    getSpacePractices(space.id),
    getSpaceCommunity(space.id),
    getSpaceBookingInfo(space.id, slug),
  ])

  const profile = readProfileData(space.preferences)
  const prefs = space.preferences
  const allowMemberPosts =
    !prefs || typeof prefs !== 'object' || Array.isArray(prefs)
      ? true
      : (prefs as Record<string, unknown>).communityMemberPosts !== false
  const brandName = space.brandName ?? space.name

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        <SpaceCommunityFeed
          slug={slug}
          spaceId={space.id}
          brandName={brandName}
          viewerId={viewerProfileId}
          canPost={manage.canManage}
          canModerate={manage.canManage}
          signedIn={!!viewerProfileId}
          following={following}
          allowMemberPosts={allowMemberPosts}
          posts={feed.posts}
        />
      </div>
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <SpaceCommunityRail
          slug={slug}
          brandName={brandName}
          tagline={space.tagline ?? null}
          profile={profile}
          booking={booking}
          events={events}
          practices={practices}
          circles={circles}
        />
      </aside>
    </div>
  )
}
