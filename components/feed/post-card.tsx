import Link from 'next/link'
import Image from 'next/image'
import { Heart, ThumbsUp, Megaphone, ArrowRight, Zap, NotebookPen } from 'lucide-react'
import { toggleReaction } from '@/app/(main)/feed/actions'
import { PostReplies } from './post-replies'
import { ContextActions } from '@/components/context-actions'
import { DemoBadge } from '@/components/ui/demo-badge'
import { getInitials, relativeTime } from '@/lib/utils'
import { PostBody } from './post-body'

import { type CommunityRole, RoleBadge } from '@/lib/community-roles'

export type FeedPost = {
  id: string
  body: string | null
  post_type: string
  is_pinned: boolean
  created_at: string
  media_urls: string[]
  is_demo?: boolean
  scope_id?: string | null
  visibility?: string | null
  replyCount?: number
  reaction_count?: number
  comment_count?: number
  engagement_score?: number
  scopeContext?: {
    type: 'wall' | 'circle' | 'channel'
    name: string
    href: string
    avatar_url?: string | null
    handle?: string
  }
  author: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
    community_role: CommunityRole
  }
  reactions: Array<{
    id: string
    reaction_type: 'heart' | 'plus_one'
    profile_id: string
  }>
}

// The raw post row as fetched (feed RPCs / direct selects) before it's mapped to
// FeedPost. Looser than FeedPost on purpose — author.community_role and
// reaction_type arrive as plain strings and are narrowed when cast to FeedPost.
// Shared by the main feed and the profile feed so the query shape lives once.
export interface RawPost {
  id: string
  body: string | null
  post_type: string
  is_pinned: boolean
  created_at: string
  media_urls: string[]
  is_demo: boolean
  reaction_count: number | null
  comment_count: number | null
  engagement_score: number | null
  scope_id: string | null
  visibility: string | null
  author: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
    community_role: string
  }
  reactions: Array<{
    id: string
    reaction_type: string
    profile_id: string
  }>
}

export function PostCard({
  post,
  myProfileId,
  viewerRole = 'member',
}: {
  post: FeedPost
  myProfileId: string | null
  viewerRole?: string
}) {
  const { author, reactions } = post
  const role = (author.community_role ?? 'member') as CommunityRole

  const heartCount = reactions.filter((r) => r.reaction_type === 'heart').length
  const plusCount = reactions.filter((r) => r.reaction_type === 'plus_one').length
  const myHeart = myProfileId != null && reactions.some(
    (r) => r.reaction_type === 'heart' && r.profile_id === myProfileId
  )
  const myPlus = myProfileId != null && reactions.some(
    (r) => r.reaction_type === 'plus_one' && r.profile_id === myProfileId
  )
  const isOwn = author.id === myProfileId
  const isAnnouncement = post.post_type === 'announcement'
  const isNote = post.post_type === 'note'
  const totalReactions = heartCount + plusCount
  const replyCount = post.replyCount ?? 0
  // Zaps this post has earned: each reaction is worth 1, each reply 2. One clean
  // number replaces the old per-post stats ledger (date/scope/earn-rates column).
  const zapsEarned = totalReactions + replyCount * 2

  return (
    <article
      className={`bg-surface/80 rounded-2xl border shadow-sm hover:shadow-md transition-shadow ${
        isAnnouncement
          ? 'border-warning/70 bg-warning-bg/20 dark:bg-warning-bg/10'
          : post.is_pinned
          ? 'border-primary-bg/70 dark:border-primary/50'
          : 'border-border'
      }`}
    >
      {/* ── Main content ──────────────────────────── */}
      <div className="p-4">
          {isAnnouncement && (
            <div className="flex items-center gap-1.5 mb-2.5">
              <Megaphone className="w-3 h-3 text-primary" />
              <p className="text-2xs font-bold uppercase tracking-wider text-warning">
                Announcement
              </p>
            </div>
          )}
          {!isAnnouncement && post.is_pinned && (
            <p className="text-2xs font-medium text-primary-strong mb-2.5">
              📌 Pinned
            </p>
          )}
          {isNote && (
            <div className="flex items-center gap-1.5 mb-2.5">
              <NotebookPen className="w-3 h-3 text-subtle" />
              <p className="text-2xs font-semibold uppercase tracking-wider text-subtle">
                Note
              </p>
            </div>
          )}

          {/* Author row */}
          <div className="flex items-start gap-3 mb-3">
            {/* Avatars. Stacked for wall posts, single for everything else */}
            <div className="shrink-0 relative">
              <Link href={`/people/${author.handle}`} className="block">
                {author.avatar_url ? (
                  <Image src={author.avatar_url} alt={author.display_name} width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary-bg text-primary-strong text-xs font-semibold flex items-center justify-center select-none">
                    {getInitials(author.display_name)}
                  </div>
                )}
              </Link>
              {post.scopeContext?.type === 'wall' && (
                <Link href={post.scopeContext.href} className="absolute -bottom-1 -right-1.5 ring-2 ring-surface rounded-full">
                  {post.scopeContext.avatar_url ? (
                    <Image src={post.scopeContext.avatar_url} alt={post.scopeContext.name} width={20} height={20} className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-border-strong text-muted text-[8px] font-bold flex items-center justify-center">
                      {getInitials(post.scopeContext.name)}
                    </div>
                  )}
                </Link>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Link
                  href={`/people/${author.handle}`}
                  className="text-sm font-semibold text-text hover:underline"
                >
                  {author.display_name}
                </Link>
                <RoleBadge role={role} className="text-2xs leading-tight" />
                {post.is_demo && <DemoBadge />}
                {post.scopeContext && (
                  <>
                    <ArrowRight className="w-3 h-3 text-subtle shrink-0" />
                    <Link
                      href={post.scopeContext.href}
                      className="text-sm text-muted hover:underline truncate"
                    >
                      {post.scopeContext.type === 'wall'
                        ? `${post.scopeContext.name}'s wall`
                        : post.scopeContext.name}
                    </Link>
                  </>
                )}
              </div>
              <p className="text-xs text-subtle mt-0.5">
                @{author.handle} · {relativeTime(post.created_at)}
              </p>
            </div>

            <ContextActions
              role={(viewerRole ?? 'member') as CommunityRole}
              context={{ type: 'post', id: post.id, isPinned: post.is_pinned, isOwn, postType: post.post_type }}
            />
          </div>

          {/* Body */}
          {post.body && (
            <PostBody body={post.body} className="mb-3 text-sm leading-relaxed text-text dark:text-subtle/60" />
          )}

          {/* Post image */}
          {post.media_urls?.length > 0 && (
            <div className="relative h-96 w-full rounded-xl overflow-hidden mb-3">
              <Image
                src={post.media_urls[0]}
                alt="Post attachment"
                fill
                sizes="(min-width: 768px) 36rem, 100vw"
                className="object-cover"
              />
            </div>
          )}

          {/* Reactions + the zaps this post has earned (the clean gamification cue) */}
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
            <div className="flex items-center gap-1">
              <form action={toggleReaction.bind(null, post.id, 'heart')}>
                <button
                  type="submit"
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    myHeart
                      ? 'bg-danger-bg/30 text-danger'
                      : 'text-subtle hover:bg-surface-elevated hover:text-muted'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${myHeart ? 'fill-current' : ''}`} />
                  {heartCount > 0 && <span>{heartCount}</span>}
                </button>
              </form>

              <form action={toggleReaction.bind(null, post.id, 'plus_one')}>
                <button
                  type="submit"
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    myPlus
                      ? 'bg-primary-bg text-primary-strong'
                      : 'text-subtle hover:bg-surface-elevated hover:text-muted'
                  }`}
                >
                  <ThumbsUp className={`w-3.5 h-3.5 ${myPlus ? 'fill-current' : ''}`} />
                  {plusCount > 0 && <span>{plusCount}</span>}
                </button>
              </form>

              <PostReplies postId={post.id} initialCount={replyCount} />
            </div>

            {zapsEarned > 0 && (
              <span
                title={`Earned ${zapsEarned} zap${zapsEarned !== 1 ? 's' : ''} from reactions and replies`}
                className="flex items-center gap-1 rounded-full bg-primary-bg px-2.5 py-1 text-xs font-semibold text-primary-strong shrink-0"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                {zapsEarned}
              </span>
            )}
          </div>
      </div>
    </article>
  )
}
