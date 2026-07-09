import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { isFollowing } from '@/lib/spaces/follows'
import { getSpaceCommunityFeed } from '@/lib/spaces/content-data'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { SpaceCommunityFeed } from '@/components/spaces/community/space-community-feed'

// THE COMMUNITY TAB (business Community feed). A Facebook/Yelp-style feed for a Space: the business
// posts Updates, and members react + comment. PUBLIC read (everyone sees the feed, all posts, comments,
// and reactions); only FOLLOWERS (or the operator) may react + comment, enforced server-side in the
// interaction actions. The identity Hero + tab chrome come from the (profile) layout; this is the body.
export default async function SpaceCommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  setActiveSpace(space)

  const [manage, following, feed] = await Promise.all([
    resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole ?? null),
    viewerProfileId ? isFollowing(space.id, viewerProfileId) : Promise.resolve(false),
    getSpaceCommunityFeed(space.id, viewerProfileId),
  ])

  // Whether the business currently accepts member posts (default on; preferences.communityMemberPosts).
  const prefs = space.preferences
  const allowMemberPosts =
    !prefs || typeof prefs !== 'object' || Array.isArray(prefs)
      ? true
      : (prefs as Record<string, unknown>).communityMemberPosts !== false

  return (
    <SpaceCommunityFeed
      slug={slug}
      spaceId={space.id}
      brandName={space.brandName ?? space.name}
      viewerId={viewerProfileId}
      canPost={manage.canManage}
      canModerate={manage.canManage}
      signedIn={!!viewerProfileId}
      following={following}
      allowMemberPosts={allowMemberPosts}
      posts={feed.posts}
    />
  )
}
