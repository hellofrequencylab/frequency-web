import Link from 'next/link'
import { Heart, ThumbsUp, Megaphone, MessageCircle, Users, Radio, ArrowRight } from 'lucide-react'
import { toggleReaction } from '@/app/(main)/feed/actions'
import { PostReplies } from './post-replies'
import { ContextActions } from '@/components/context-actions'
import { getInitials, relativeTime } from '@/lib/utils'

function renderBodyWithMentions(body: string): React.ReactNode[] {
  const parts = body.split(/(@[a-zA-Z0-9_]+)/g)
  return parts.map((part, i) => {
    if (/^@[a-zA-Z0-9_]+$/.test(part)) {
      const handle = part.slice(1)
      return (
        <Link key={i} href={`/people/${handle}`} className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
          {part}
        </Link>
      )
    }
    return part
  })
}

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

const ROLE_BADGE: Record<CommunityRole, { label: string; cls: string }> = {
  member:  { label: 'Member',  cls: 'bg-gray-100 text-gray-600' },
  crew:    { label: 'Crew',    cls: 'bg-blue-100 text-blue-700' },
  host:    { label: 'Host',    cls: 'bg-green-100 text-green-700' },
  guide:   { label: 'Guide',   cls: 'bg-purple-100 text-purple-700' },
  mentor:  { label: 'Mentor',  cls: 'bg-amber-100 text-amber-700' },
  janitor: { label: 'Janitor', cls: 'bg-violet-100 text-violet-700' },
}

const POST_TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  feed:         { label: 'Post',         cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  announcement: { label: 'Announcement', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  blog:         { label: 'Blog',         cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' },
  recap:        { label: 'Recap',        cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
}

function formatPostTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatPostDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export type FeedPost = {
  id: string
  body: string | null
  post_type: string
  is_pinned: boolean
  created_at: string
  media_urls: string[]
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
  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.member

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
  const typeInfo = POST_TYPE_LABEL[post.post_type] ?? POST_TYPE_LABEL.feed
  const totalReactions = heartCount + plusCount
  const replyCount = post.replyCount ?? 0

  return (
    <article
      className={`bg-white dark:bg-gray-900/80 rounded-2xl border shadow-sm hover:shadow-md transition-shadow ${
        isAnnouncement
          ? 'border-amber-200/70 dark:border-amber-800/50 bg-amber-50/20 dark:bg-amber-950/10'
          : post.is_pinned
          ? 'border-indigo-200/70 dark:border-indigo-800/50'
          : 'border-gray-200/60 dark:border-gray-800/60'
      }`}
    >
      <div className="flex">
        {/* ── Main content ──────────────────────────── */}
        <div className="flex-1 min-w-0 p-4">
          {isAnnouncement && (
            <div className="flex items-center gap-1.5 mb-2.5">
              <Megaphone className="w-3 h-3 text-amber-500" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Announcement
              </p>
            </div>
          )}
          {!isAnnouncement && post.is_pinned && (
            <p className="text-[11px] font-medium text-indigo-500 mb-2.5">
              📌 Pinned
            </p>
          )}

          {/* Author row */}
          <div className="flex items-start gap-3 mb-3">
            {/* Avatars — stacked for wall posts, single for everything else */}
            <Link href={`/people/${author.handle}`} className="shrink-0 relative">
              {author.avatar_url ? (
                <img src={author.avatar_url} alt={author.display_name} className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-xs font-semibold flex items-center justify-center select-none">
                  {getInitials(author.display_name)}
                </div>
              )}
              {post.scopeContext?.type === 'wall' && (
                <Link href={post.scopeContext.href} className="absolute -bottom-1 -right-1.5 ring-2 ring-white dark:ring-gray-900 rounded-full">
                  {post.scopeContext.avatar_url ? (
                    <img src={post.scopeContext.avatar_url} alt={post.scopeContext.name} className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 text-[8px] font-bold flex items-center justify-center">
                      {getInitials(post.scopeContext.name)}
                    </div>
                  )}
                </Link>
              )}
            </Link>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Link
                  href={`/people/${author.handle}`}
                  className="text-sm font-semibold text-gray-900 dark:text-gray-50 hover:underline"
                >
                  {author.display_name}
                </Link>
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}>
                  {badge.label}
                </span>
                {post.scopeContext && (
                  <>
                    <ArrowRight className="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0" />
                    <Link
                      href={post.scopeContext.href}
                      className="text-sm text-gray-500 dark:text-gray-400 hover:underline truncate"
                    >
                      {post.scopeContext.type === 'wall'
                        ? `${post.scopeContext.name}'s wall`
                        : post.scopeContext.name}
                    </Link>
                  </>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                @{author.handle} · {relativeTime(post.created_at)}
              </p>
            </div>

            <ContextActions
              role={(viewerRole ?? 'member') as any}
              context={{ type: 'post', id: post.id, isPinned: post.is_pinned, isOwn, postType: post.post_type }}
            />
          </div>

          {/* Body */}
          {post.body && (
            <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap mb-3">
              {renderBodyWithMentions(post.body)}
            </p>
          )}

          {/* Post image */}
          {post.media_urls?.length > 0 && (
            <div className="rounded-xl overflow-hidden mb-3">
              <img
                src={post.media_urls[0]}
                alt="Post attachment"
                loading="lazy"
                className="max-h-96 object-cover w-full"
              />
            </div>
          )}

          {/* Reactions */}
          <div className="flex items-center gap-1 pt-2.5 border-t border-gray-100 dark:border-gray-800">
            <form action={toggleReaction.bind(null, post.id, 'heart')}>
              <button
                type="submit"
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  myHeart
                    ? 'bg-red-50 dark:bg-red-950/30 text-red-500'
                    : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-600'
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
                    ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600'
                    : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-600'
                }`}
              >
                <ThumbsUp className={`w-3.5 h-3.5 ${myPlus ? 'fill-current' : ''}`} />
                {plusCount > 0 && <span>{plusCount}</span>}
              </button>
            </form>

            <PostReplies postId={post.id} initialCount={replyCount} />
          </div>
        </div>

        {/* ── Stats sidebar (desktop only) ─────────── */}
        <div className="hidden md:flex w-44 shrink-0 flex-col border-l border-gray-100/80 dark:border-gray-800/50 rounded-r-2xl p-3">
          {/* Date + scope type */}
          <div className="mb-2.5">
            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{formatPostDate(post.created_at)}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">{formatPostTime(post.created_at)}</p>
            {post.scopeContext && (
              <div className="flex items-center gap-1 mt-1.5">
                {post.scopeContext.type === 'wall' && <Users className="w-2.5 h-2.5 text-indigo-400" />}
                {post.scopeContext.type === 'circle' && <Users className="w-2.5 h-2.5 text-green-400" />}
                {post.scopeContext.type === 'channel' && <Radio className="w-2.5 h-2.5 text-blue-400" />}
                <span className="text-[10px] text-gray-400 capitalize">{post.scopeContext.type === 'wall' ? 'Wall post' : post.scopeContext.type}</span>
              </div>
            )}
            {post.is_pinned && (
              <p className="text-[10px] text-indigo-500 font-medium mt-1">📌 Pinned</p>
            )}
          </div>

          {/* Engagement stats */}
          {(totalReactions > 0 || replyCount > 0) && (
            <div className="py-2.5 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
              {totalReactions > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Heart className="w-3 h-3 text-red-300" />{totalReactions}
                  </span>
                  <span className="text-[10px] font-medium text-amber-500">{totalReactions} zap{totalReactions !== 1 ? 's' : ''}</span>
                </div>
              )}
              {replyCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <MessageCircle className="w-3 h-3 text-blue-300" />{replyCount}
                  </span>
                  <span className="text-[10px] font-medium text-amber-500">{replyCount * 2} zaps</span>
                </div>
              )}
            </div>
          )}

          {/* Zap earn rates */}
          <div className="mt-auto pt-2.5 border-t border-gray-100 dark:border-gray-800 space-y-1">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-300 dark:text-gray-600 mb-1">Earn</p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">React</span>
              <span className="text-[10px] font-medium text-amber-400/60">+1</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">Reply</span>
              <span className="text-[10px] font-medium text-amber-400/60">+2</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
