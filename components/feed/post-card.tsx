import Link from 'next/link'
import Image from 'next/image'
import {
  Megaphone,
  ChevronRight,
  Zap,
  NotebookPen,
  Pin,
  CalendarDays,
  Users,
  Hash,
  Building2,
} from 'lucide-react'
import { PostReplies } from './post-replies'
import { ContextActions } from '@/components/context-actions'
import { DemoBadge } from '@/components/ui/demo-badge'
import { getInitials, relativeTime } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { PostBody } from './post-body'
import { SystemLine } from './system-line'

import { type CommunityRole, RoleBadge } from '@/lib/community-roles'

/** WHERE a post lives — the wall / Circle / Channel / event / Space it was posted
 *  to. Rendered as the linked context half of the header's one attribution line
 *  ("author › context"), with the scope's own image when it has one (member
 *  avatar, circle image, event cover, space logo) and a small icon fallback.
 *  Resolved by `buildScopeContextResolver` (lib/feed/post-origin.ts) on every
 *  surface, so the feed and the profile timeline read identically. A post on the
 *  author's own profile carries NO context (the author link IS the where). */
export type PostScopeContext = {
  type: 'wall' | 'circle' | 'channel' | 'event' | 'space'
  name: string
  href: string
  /** The scope's own image (may carry an avatar-focus fragment, ADR-829). */
  image_url?: string | null
  handle?: string
}

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
  scopeContext?: PostScopeContext
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

/** The context half's thumbnail: the scope's own image when it has one, else a
 *  small typed icon (people get initials) so the destination reads at a glance. */
function ScopeThumb({ scope }: { scope: PostScopeContext }) {
  const shape = scope.type === 'wall' ? 'rounded-full' : 'rounded'
  if (scope.image_url) {
    return (
      <Image
        src={avatarSrc(scope.image_url)}
        alt=""
        width={16}
        height={16}
        style={avatarFocusStyle(scope.image_url)}
        className={`h-4 w-4 shrink-0 object-cover ${shape}`}
      />
    )
  }
  if (scope.type === 'wall') {
    return (
      <span className="flex h-4 w-4 shrink-0 select-none items-center justify-center rounded-full bg-primary-bg text-3xs font-bold text-primary-strong">
        {getInitials(scope.name)}
      </span>
    )
  }
  const Icon =
    scope.type === 'event' ? CalendarDays : scope.type === 'space' ? Building2 : scope.type === 'channel' ? Hash : Users
  return (
    <span className={`flex h-4 w-4 shrink-0 items-center justify-center bg-surface-elevated text-subtle dark:bg-canvas/60 ${shape}`}>
      <Icon className="h-3 w-3" />
    </span>
  )
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
  // Role chips only where they carry signal: leadership roles and the system
  // voice. A plain Member chip on every post was repeated noise, not information.
  const showRoleChip = author.is_system || (role !== 'member' && role !== 'crew')
  const scope = post.scopeContext

  // ONE card chrome for every post: white surface on the warm canvas, hairline
  // border, soft shadow. Announcement / pinned tint only the hairline, never the
  // whole card, so special posts stay in the same visual family.
  const cardBorder = isAnnouncement
    ? 'border-warning/40'
    : post.is_pinned
    ? 'border-primary/40'
    : 'border-border/70 dark:border-border/60'

  return (
    <article
      className={`rounded-2xl border bg-surface shadow-sm transition-shadow hover:shadow-md dark:bg-surface-elevated/80 ${cardBorder}`}
    >
      <div className="p-4">
        {/* Kicker — the ONE slot for a post's special state (announcement / pinned /
            note), a single quiet uppercase line instead of three banner treatments. */}
        {(isAnnouncement || post.is_pinned || isNote) && (
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {isAnnouncement && (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-warning">
                <Megaphone className="h-3 w-3" /> Announcement
              </span>
            )}
            {post.is_pinned && (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-primary-strong">
                <Pin className="h-3 w-3" /> Pinned
              </span>
            )}
            {isNote && (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-subtle">
                <NotebookPen className="h-3 w-3" /> Note
              </span>
            )}
          </div>
        )}

        {/* Attribution header — WHO posted, then WHERE it lives, on one line:
            author avatar + name (→ their profile) › context image + name (→ the
            wall / Circle / Channel / event / Space). Time + earned Zaps below. */}
        <div className="mb-2.5 flex items-start gap-2.5">
          <Link href={`/people/${author.handle}`} className="block shrink-0">
            {author.avatar_url ? (
              <Image
                src={avatarSrc(author.avatar_url)}
                alt={author.display_name}
                width={36}
                height={36}
                style={avatarFocusStyle(author.avatar_url)}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 select-none items-center justify-center rounded-full bg-primary-bg text-xs font-semibold text-primary-strong">
                {getInitials(author.display_name)}
              </div>
            )}
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-snug">
              <Link
                href={`/people/${author.handle}`}
                className="text-sm font-semibold text-text hover:underline"
              >
                {author.display_name}
              </Link>
              {showRoleChip && <RoleBadge role={chipRole} className="text-2xs leading-tight" />}
              {post.is_demo && <DemoBadge />}
              {scope && (
                <>
                  <ChevronRight className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
                  <Link
                    href={scope.href}
                    className="flex min-w-0 items-center gap-1 text-sm text-muted transition-colors hover:text-text"
                  >
                    <ScopeThumb scope={scope} />
                    <span className="truncate font-medium">
                      {scope.type === 'wall' ? `${scope.name}’s wall` : scope.name}
                    </span>
                  </Link>
                </>
              )}
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-subtle">
              <span className="truncate">{relativeTime(post.created_at)}</span>
              {/* Zaps this post has earned, by the author's identity (not down in
                  the action row) — a small calm chip, shown only once it's earned. */}
              {zapsEarned > 0 && (
                <span
                  title={`Earned ${zapsEarned} zap${zapsEarned !== 1 ? 's' : ''} from reactions and replies`}
                  className="inline-flex shrink-0 items-center gap-0.5 text-2xs font-semibold text-primary-strong"
                >
                  <Zap className="h-3 w-3 fill-current" />
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
          <PostBody body={post.body} className="mb-2.5 text-sm leading-relaxed text-text" />
        )}

        {/* Post image — inset media, no second frame around it. */}
        {post.media_urls?.length > 0 && (
          <div className="relative mb-2.5 h-96 w-full overflow-hidden rounded-xl">
            <Image
              src={post.media_urls[0]}
              alt="Post attachment"
              fill
              sizes="(min-width: 768px) 36rem, 100vw"
              className="object-cover"
            />
          </div>
        )}

        {/* PostReplies owns the whole reaction + comment surface: the reaction
            COUNTS sit beside the comment count on the action line, and the inline
            emoji PICKER shares the comment composer row below. */}
        <PostReplies
          postId={post.id}
          initialCount={replyCount}
          myProfileId={myProfileId}
          postReactions={reactions}
        />
      </div>
    </article>
  )
}
