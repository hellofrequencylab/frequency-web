import { createClient } from '@/lib/supabase/server'
import { readFeedRpc } from '@/lib/feed/load-feed'
import { PostCard, type FeedPost, type RawPost } from '@/components/feed/post-card'
import { EmptyState } from '@/components/ui/empty-state'

// THE COMMUNITY WALL'S POSTS (ADR-1938, LIVE-2077).
//
// One read, public.space_wall_feed, gated in the database by the same rule the posts policy uses
// (private.can_read_space_wall), so this component never decides who may read. A wall the viewer may
// not read comes back as zero rows, and the page, not this list, says why (the join prompt on a
// members-only wall). The viewer may be signed out: the RPC is callable by anon, which is the whole
// point of a public communications hub. Cards are the same <PostCard> the Circle feed uses, so a post
// reads identically here and in a Circle.

export type WallFeedProps = {
  spaceId: string
  myProfileId: string | null
  /** 'host' for the Space team (they can pin and remove), 'member' otherwise. */
  viewerRole: 'host' | 'member'
  emptyTitle: string
  emptyBody: string
}

export async function CommunityWallFeed({
  spaceId,
  myProfileId,
  viewerRole,
  emptyTitle,
  emptyBody,
}: WallFeedProps) {
  const supabase = await createClient()
  const loaded = readFeedRpc<RawPost>(
    'space_wall_feed',
    await supabase.rpc('space_wall_feed', { _space_id: spaceId, _limit: 30 }),
  )

  if (loaded.kind === 'error') {
    return (
      <EmptyState
        title="The wall did not load"
        description="Something went wrong on our side. Refresh the page and it should be back."
      />
    )
  }

  const posts: FeedPost[] = loaded.items.map((p) => ({
    ...p,
    replyCount: p.comment_count ?? 0,
  })) as FeedPost[]

  if (posts.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyBody} />
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} myProfileId={myProfileId} viewerRole={viewerRole} />
      ))}
    </div>
  )
}
