import { MessageSquare } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { EmptyState } from '@/components/ui/empty-state'
import { PostCard, type FeedPost, type RawPost } from './post-card'
import { buildPostOriginResolver } from '@/lib/feed/post-origin'
import { PostOriginHeader } from './post-origin'

// The same column shape the profile feed selects, so the post-card has every
// field it needs. Kept local rather than exported from profile-feed to avoid a
// circular-feeling dependency between the two feed views.
const POST_SELECT = `
  id, body, post_type, is_pinned, created_at, media_urls, is_demo,
  reaction_count, comment_count, engagement_score, scope_id, visibility,
  author:profiles!author_id ( id, display_name, handle, avatar_url, community_role ),
  reactions:post_reactions ( id, reaction_type, profile_id )
`

// A member's complete authored post history, newest first. Unlike the merged
// activity stream this is ONLY their own top-level posts: no wall, mentions,
// events or dispatches, and no 30-post cap. Same admin-client read path and
// visibility filters as ProfileFeed (top-level only, nothing hidden).
export async function ProfilePosts({
  profileId,
  firstName,
  isOwner,
  myProfileId,
  viewerRole,
}: {
  profileId: string
  firstName: string
  isOwner: boolean
  myProfileId: string | null
  viewerRole?: string
}) {
  const admin = createAdminClient()

  const { data } = await admin
    .from('posts')
    .select(POST_SELECT)
    .eq('author_id', profileId)
    .is('parent_id', null)
    .is('hidden_at', null)
    .order('created_at', { ascending: false })

  const posts = (data ?? []) as unknown as RawPost[]

  if (posts.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title={isOwner ? 'You have not posted yet' : `${firstName} has not posted yet`}
        description={
          isOwner
            ? 'Your posts will collect here once you share your first one.'
            : 'When they share a post it will show up here.'
        }
      />
    )
  }

  const toFeedPost = (p: RawPost): FeedPost =>
    ({ ...p, replyCount: p.comment_count ?? 0 }) as FeedPost

  // Show where each post was posted (circle / wall / public feed), like the activity tab.
  const resolveOrigin = await buildPostOriginResolver(posts.map((p) => p.scope_id), profileId)

  return (
    <div className="space-y-4">
      {posts.map((p) => (
        <div key={p.id}>
          <PostOriginHeader origin={resolveOrigin(p.scope_id)} />
          <PostCard
            post={toFeedPost(p)}
            myProfileId={myProfileId}
            viewerRole={viewerRole}
          />
        </div>
      ))}
    </div>
  )
}
