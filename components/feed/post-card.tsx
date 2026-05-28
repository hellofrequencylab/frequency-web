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
        <Link key={i} href={`/people/${handle}`} className="text-primary-strong hover:underline font-medium">
          {part}
        </Link>
      )
    }
    return part
  })
}

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

const ROLE_BADGE: Record<CommunityRole, { label: string; cls: string }> = {
  member:  { label: 'Member',  cls: 'bg-surface-elevated text-muted' },
  crew:    { label: 'Crew',    cls: 'bg-signal-bg text-signal-strong' },
  host:    { label: 'Host',    cls: 'bg-success-bg text-success' },
  guide:   { label: 'Guide',   cls: 'bg-signal-bg text-signal-strong' },
  mentor:  { label: 'Mentor',  cls: 'bg-warning-bg text-warning' },
  janitor: { label: 'Janitor', cls: 'bg-signal-bg text-signal-strong' },
}

const POST_TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  feed:         { label: 'Post',         cls: 'bg-surface-elevated text-muted dark:bg-surface-elevated dark:text-subtle' },
  announcement: { label: 'Announcement', cls: 'bg-warning-bg text-warning dark:bg-warning-bg dark:text-warning' },
  blog:         { label: 'Blog',         cls: 'bg-primary-bg text-primary-strong dark:bg-primary-bg dark:text-primary-strong' },
  recap:        { label: 'Recap',        cls: 'bg-success-bg text-success dark:bg-success-bg' },
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
      className={`bg-surface/80 rounded-2xl border shadow-sm hover:shadow-md transition-shadow ${
        isAnnouncement
          ? 'border-warning/70 bg-warning-bg/20 dark:bg-warning-bg/10'
          : post.is_pinned
          ? 'border-primary-bg/70 dark:border-primary/50'
          : 'border-border'
      }`}
    >
      <div className="flex">
        {/* ── Main content ──────────────────────────── */}
        <div className="flex-1 min-w-0 p-4">
          {isAnnouncement && (
            <div className="flex items-center gap-1.5 mb-2.5">
              <Megaphone className="w-3 h-3 text-primary" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-warning">
                Announcement
              </p>
            </div>
          )}
          {!isAnnouncement && post.is_pinned && (
            <p className="text-[11px] font-medium text-primary-strong mb-2.5">
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
                <div className="w-8 h-8 rounded-full bg-primary-bg text-primary-strong text-xs font-semibold flex items-center justify-center select-none">
                  {getInitials(author.display_name)}
                </div>
              )}
              {post.scopeContext?.type === 'wall' && (
                <Link href={post.scopeContext.href} className="absolute -bottom-1 -right-1.5 ring-2 ring-surface rounded-full">
                  {post.scopeContext.avatar_url ? (
                    <img src={post.scopeContext.avatar_url} alt={post.scopeContext.name} className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-border-strong text-muted text-[8px] font-bold flex items-center justify-center">
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
                  className="text-sm font-semibold text-text hover:underline"
                >
                  {author.display_name}
                </Link>
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}>
                  {badge.label}
                </span>
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
              role={(viewerRole ?? 'member') as any}
              context={{ type: 'post', id: post.id, isPinned: post.is_pinned, isOwn, postType: post.post_type }}
            />
          </div>

          {/* Body */}
          {post.body && (
            <p className="text-sm text-text dark:text-subtle/60 leading-relaxed whitespace-pre-wrap mb-3">
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
          <div className="flex items-center gap-1 pt-2.5 border-t border-border">
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
        </div>

        {/* ── Stats sidebar (desktop only) ─────────── */}
        <div className="hidden md:flex w-44 shrink-0 flex-col border-l border-border rounded-r-2xl p-3">
          {/* Date + scope type */}
          <div className="mb-2.5">
            <p className="text-[10px] text-muted font-medium">{formatPostDate(post.created_at)}</p>
            <p className="text-[10px] text-subtle">{formatPostTime(post.created_at)}</p>
            {post.scopeContext && (
              <div className="flex items-center gap-1 mt-1.5">
                {post.scopeContext.type === 'wall' && <Users className="w-2.5 h-2.5 text-primary-strong" />}
                {post.scopeContext.type === 'circle' && <Users className="w-2.5 h-2.5 text-success" />}
                {post.scopeContext.type === 'channel' && <Radio className="w-2.5 h-2.5 text-signal-strong" />}
                <span className="text-[10px] text-subtle capitalize">{post.scopeContext.type === 'wall' ? 'Wall post' : post.scopeContext.type}</span>
              </div>
            )}
            {post.is_pinned && (
              <p className="text-[10px] text-primary-strong font-medium mt-1">📌 Pinned</p>
            )}
          </div>

          {/* Engagement stats */}
          {(totalReactions > 0 || replyCount > 0) && (
            <div className="py-2.5 border-t border-border space-y-1.5">
              {totalReactions > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted flex items-center gap-1">
                    <Heart className="w-3 h-3 text-danger" />{totalReactions}
                  </span>
                  <span className="text-[10px] font-medium text-primary">{totalReactions} zap{totalReactions !== 1 ? 's' : ''}</span>
                </div>
              )}
              {replyCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted flex items-center gap-1">
                    <MessageCircle className="w-3 h-3 text-signal-strong" />{replyCount}
                  </span>
                  <span className="text-[10px] font-medium text-primary">{replyCount * 2} zaps</span>
                </div>
              )}
            </div>
          )}

          {/* Zap earn rates */}
          <div className="mt-auto pt-2.5 border-t border-border space-y-1">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-subtle mb-1">Earn</p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-subtle">React</span>
              <span className="text-[10px] font-medium text-primary/60">+1</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-subtle">Reply</span>
              <span className="text-[10px] font-medium text-primary/60">+2</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
