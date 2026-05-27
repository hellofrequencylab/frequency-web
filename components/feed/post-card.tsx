import Link from 'next/link'
import { Heart, ThumbsUp, Trash2, Megaphone } from 'lucide-react'
import { deletePost, toggleReaction } from '@/app/(main)/feed/actions'
import { PostReplies } from './post-replies'

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

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  const hrs = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  if (hrs < 24) return `${hrs}h`
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
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

  return (
    <article
      className={`bg-white dark:bg-gray-900 rounded-xl border p-4 ${
        isAnnouncement
          ? 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10'
          : post.is_pinned
          ? 'border-indigo-200 dark:border-indigo-800'
          : 'border-gray-200 dark:border-gray-800'
      }`}
    >
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

      {/* ── Author row ──────────────────────────────── */}
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
              className="text-sm font-semibold text-gray-900 hover:underline"
            >
              {author.display_name}
            </Link>
            <span
              className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            @{author.handle} · {relativeTime(post.created_at)}
          </p>
        </div>

        {/* Delete — own posts only */}
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

      {/* ── Body ────────────────────────────────────── */}
      {post.body && (
        <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap mb-3">
          {renderBodyWithMentions(post.body)}
        </p>
      )}

      {/* ── Reactions + reply placeholder ───────────── */}
      <div className="flex items-center gap-1 pt-2.5 border-t border-gray-50">
        {/* Heart */}
        <form action={toggleReaction.bind(null, post.id, 'heart')}>
          <button
            type="submit"
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              myHeart
                ? 'bg-red-50 text-red-500'
                : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
            }`}
          >
            <Heart
              className={`w-3.5 h-3.5 ${myHeart ? 'fill-current' : ''}`}
            />
            {heartCount > 0 && <span>{heartCount}</span>}
          </button>
        </form>

        {/* +1 */}
        <form action={toggleReaction.bind(null, post.id, 'plus_one')}>
          <button
            type="submit"
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              myPlus
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
            }`}
          >
            <ThumbsUp
              className={`w-3.5 h-3.5 ${myPlus ? 'fill-current' : ''}`}
            />
            {plusCount > 0 && <span>{plusCount}</span>}
          </button>
        </form>

        <PostReplies postId={post.id} initialCount={post.replyCount ?? 0} />
      </div>
    </article>
  )
}
