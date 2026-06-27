import Link from 'next/link'
import Image from 'next/image'
import { Megaphone, ArrowRight, Zap, NotebookPen, CalendarDays } from 'lucide-react'
import { PostReplies } from './post-replies'
import { ReactionBar } from './reaction-button'
import { ContextActions } from '@/components/context-actions'
import { DemoBadge } from '@/components/ui/demo-badge'
import { getInitials, relativeTime } from '@/lib/utils'
import { PostBody } from './post-body'
import { SystemLine } from './system-line'

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
    type: 'wall' | 'circle' | 'channel' | 'event'
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
    /** Entitlement tier (returned by the feed RPCs since 20260612060000) — any
     *  public flair/endorsement keys off THIS, not the role (PB.1i / ADR-141). */
    membership_tier?: string | null
    /** The system voice (Vera, ADR-231) — badge reads "Moderator", and her
     *  `system` posts render as a single feed line. */
    is_system?: boolean
  }
  reactions: Array<{
    id: string
    /** One of the curated emoji set (lib/feed/reactions.ts). Legacy 'heart' /
     *  'plus_one' rows are remapped to '❤️' / '🙌' by the broadening migration. */
    reaction_type: string
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
    /** Present on rows from the feed RPCs (20260612060000+); absent on older selects. */
    membership_tier?: string | null
    /** Present on rows from the feed RPCs (20260616110000+); absent on older selects. */
    is_system?: boolean
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
  // The system voice never shows an operational web role to members (ADR-231) —
  // 'moderator' is a chip-only key, so the override lives at the badge, not here.
  const chipRole = author.is_system ? 'moderator' : role

  // System lines (post_type 'system' — Vera's join announcements, ADR-231) render
  // as ONE quiet centered line, WhatsApp-style: no card, no avatar, no actions.
  if (post.post_type === 'system') {
    return <SystemLine body={post.body} />
  }

  const isOwn = author.id === myProfileId
  const isAnnouncement = post.post_type === 'announcement'
  const isNote = post.post_type === 'note'
  const totalReactions = reactions.length
  const replyCount = post.replyCount ?? 0
  // Zaps this post has earned: each reaction is worth 1, each reply 2. One clean
  // number replaces the old per-post stats ledger (date/scope/earn-rates column).
  const zapsEarned = totalReactions + replyCount * 2

  return (
    <article
      className={`rounded-2xl shadow-sm hover:shadow-md transition-shadow ${
        isAnnouncement
          ? 'bg-warning-bg/20 dark:bg-warning-bg/10 ring-1 ring-warning/40'
          : post.is_pinned
          ? 'bg-surface-elevated/70 ring-1 ring-primary-bg/60 dark:ring-primary/40'
          : 'bg-surface-elevated/60'
      }`}
    >
      {/* ── Main content ──────────────────────────── */}
      <div className="p-3.5">
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
          <div className="flex items-start gap-2.5 mb-2.5">
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
                    <div className="w-5 h-5 rounded-full bg-border-strong text-muted text-3xs font-bold flex items-center justify-center">
                      {getInitials(post.scopeContext.name)}
                    </div>
                  )}
                </Link>
              )}
              {/* An event-scoped post stacks a small calendar badge (the event has no
                  avatar), so its destination still reads at a glance like a wall post. */}
              {post.scopeContext?.type === 'event' && (
                <Link
                  href={post.scopeContext.href}
                  aria-label={post.scopeContext.name}
                  className="absolute -bottom-1 -right-1.5 ring-2 ring-surface rounded-full w-5 h-5 bg-success-bg text-success flex items-center justify-center"
                >
                  <CalendarDays className="w-3 h-3" />
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
                <RoleBadge role={chipRole} className="text-2xs leading-tight" />
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
              <p className="text-xs text-subtle mt-0.5 flex items-center gap-1.5">
                <span className="truncate">@{author.handle} · {relativeTime(post.created_at)}</span>
                {/* Zaps this post has earned, by the author's identity (not down in
                    the action row) — a small calm chip, shown only once it's earned. */}
                {zapsEarned > 0 && (
                  <span
                    title={`Earned ${zapsEarned} zap${zapsEarned !== 1 ? 's' : ''} from reactions and replies`}
                    className="inline-flex items-center gap-0.5 text-2xs font-semibold text-primary-strong shrink-0"
                  >
                    <Zap className="w-3 h-3 fill-current" />
                    {zapsEarned}
                  </span>
                )}
              </p>
            </div>

            <ContextActions
              role={(viewerRole ?? 'member') as CommunityRole}
              context={{ type: 'post', id: post.id, isPinned: post.is_pinned, isOwn, postType: post.post_type }}
            />
          </div>

          {/* Body */}
          {post.body && (
            <PostBody body={post.body} className="mb-2.5 text-sm leading-relaxed text-text dark:text-subtle/60" />
          )}

          {/* Post image */}
          {post.media_urls?.length > 0 && (
            <div className="relative h-96 w-full rounded-xl overflow-hidden mb-2.5">
              <Image
                src={post.media_urls[0]}
                alt="Post attachment"
                fill
                sizes="(min-width: 768px) 36rem, 100vw"
                className="object-cover"
              />
            </div>
          )}

          {/* The emoji reactions and the comment toggle sit on ONE line under the
              content (PostReplies owns the row so the toggle stays inline); the
              thread expands full-width below it. The zaps chip now lives up by the
              author, so this row is reactions + comments only. */}
          <PostReplies
            postId={post.id}
            initialCount={replyCount}
            myProfileId={myProfileId}
            reactions={
              <ReactionBar
                postId={post.id}
                reactions={reactions}
                myProfileId={myProfileId}
              />
            }
          />
      </div>
    </article>
  )
}

