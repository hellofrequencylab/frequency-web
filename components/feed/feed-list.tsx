import { MessageSquare } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { PostCard, FeedPost } from './post-card'

export async function FeedList({
  scopeIds,
  myProfileId,
  emptyMessage = 'Nothing posted yet. Be the first to share something.',
}: {
  scopeIds: string[]
  myProfileId: string | null
  emptyMessage?: string
}) {
  if (scopeIds.length === 0) {
    return (
      <EmptyState message="Join a group to see posts here." />
    )
  }

  const admin = createAdminClient()
  const { data: raw } = await admin
    .from('posts')
    .select(
      `id, body, post_type, is_pinned, created_at, media_urls,
       author:profiles!author_id ( id, display_name, handle, avatar_url, community_role ),
       reactions:post_reactions ( id, reaction_type, profile_id )`
    )
    .in('scope_id', scopeIds)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20)

  const posts = (raw ?? []) as unknown as FeedPost[]

  if (posts.length === 0) {
    return <EmptyState message={emptyMessage} />
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} myProfileId={myProfileId} />
      ))}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center">
      <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  )
}
