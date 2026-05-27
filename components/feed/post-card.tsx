import Link from 'next/link'
import { Heart, ThumbsUp, Trash2, Megaphone, Clock, MessageCircle, TrendingUp } from 'lucide-react'
import { deletePost, toggleReaction } from '@/app/(main)/feed/actions'
import { PostReplies } from './post-replies'
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
  replyCount?: number
  reaction_count?: number
  comment_count?: number
  engagement_score?: number
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
}: {
  post: FeedPost
  myProfileId: string | null
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
            <Link href={`/people/${author.handle}`} className="shrink-0">
              {author.avatar_url ? (
                <img
                  src={author.avatar_url}
                  alt={author.display_name}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-xs font-semibold flex items-center justify-center select-none">
                  {getInitials(author.display_name)}
                </div>
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
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                @{author.handle} · {relativeTime(post.created_at)}
              </p>
            </div>

            {isOwn && (
              <form action={deletePost.bind(null, post.id)}>
                <button
                  type="submit"
                  aria-label="Delete post"
                  className="p-1.5 rounded-md text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>

          {/* Body */}
          {post.body && (
            <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap mb-3">
              {renderBodyWithMentions(post.body)}
            </p>
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
        <div className="hidden md:flex w-44 shrink-0 flex-col gap-3 border-l border-gray-100/80 dark:border-gray-800/50 bg-indigo-50/20 dark:bg-indigo-950/10 rounded-r-2xl p-3">
          {/* Post type */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Type</p>
            <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-medium ${typeInfo.cls}`}>
              {typeInfo.label}
            </span>
          </div>

          {/* Timestamp */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Posted</p>
            <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <Clock className="w-3 h-3 text-gray-400 dark:text-gray-600" />
              <div>
                <p className="leading-tight">{formatPostDate(post.created_at)}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">{formatPostTime(post.created_at)}</p>
              </div>
            </div>
          </div>

          {/* Engagement */}
          {(totalReactions > 0 || replyCount > 0) && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Engagement</p>
              <div className="space-y-1">
                {totalReactions > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <Heart className="w-3 h-3 text-gray-400 dark:text-gray-600" />
                    <span>{totalReactions} reaction{totalReactions !== 1 ? 's' : ''}</span>
                  </div>
                )}
                {replyCount > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <MessageCircle className="w-3 h-3 text-gray-400 dark:text-gray-600" />
                    <span>{replyCount} repl{replyCount !== 1 ? 'ies' : 'y'}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Engagement score */}
          {(post.engagement_score ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Score</p>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                <TrendingUp className="w-3 h-3" />
                <span>{post.engagement_score}</span>
              </div>
            </div>
          )}

          {/* Pinned indicator */}
          {post.is_pinned && (
            <div className="mt-auto pt-2 border-t border-gray-200 dark:border-gray-800">
              <span className="text-[11px] text-indigo-500 font-medium">📌 Pinned</span>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
