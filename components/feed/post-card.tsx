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
  const shape = scope.type === 'wall' ? 'rounded-pill' : 'rounded'
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
      <span className="flex h-4 w-4 shrink-0 select-none items-center justify-center rounded-pill bg-primary-bg text-3xs font-bold text-primary-strong">
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

  // ONE card chrome for every post: the warm post surface on the canvas, hairline
  // border, soft shadow. Announcement / pinned tint only the hairline, never the
  // whole card, so special posts stay in the same visual family — and they tint it
  // with the SAME amber, because they are one family of "special post" and amber is
  // the only chrome accent. Warning is a state colour and a pinned post is not a
  // caution; using it here made two sibling states read as two different meanings.
  // One family, two weights. Both special states tint the hairline amber — warning is a state
  // colour and a pinned post is not a caution — but /45 against /40 was a 5% alpha difference on
  // a 1px line, which is no difference at all: the two kinds became indistinguishable except by
  // reading the kicker. An announcement is the louder of the two, so it gets a hairline you can
  // actually see, and pinned stays quiet.
  const cardBorder = isAnnouncement
    ? 'border-primary/70'
    : post.is_pinned
    ? 'border-primary/35'
    : 'border-border'

  return (
    // `bg-surface-post` is still the RIGHT NAME here and no longer a different COLOUR: the
    // token now resolves to `var(--color-surface)` in every skin (owner, 2026-08-06: "make the
    // post and announcement boxes the same shade white as the post box site wide").
    //
    // This comment used to argue the opposite — "DAWN gives feed posts their own surface a step
    // warmer than the white composer above them, so a post reads as a card and the composer
    // reads as a bright input on top of it" — and that step is what has been retired. Kept as a
    // record rather than deleted, because the next person to see two names for one colour will
    // reasonably want to collapse them, and the answer is in globals.css: the name is the hook
    // for re-separating the two, and it costs nothing while they agree.
    //
    // Announcements and pinned posts are unaffected: they tint the HAIRLINE (see `cardBorder`
    // above), never the fill, so they follow the fill wherever it goes and stay in the same
    // visual family as an ordinary post.
    // `id="post-<id>"` is the post's only address: there is no standalone permalink route, so a
    // mention notification deep-links to /feed#post-<id> (lib/notifications/href) and the browser
    // scrolls here. `scroll-mt-24` keeps the card clear of the sticky header on that jump.
    <article
      id={`post-${post.id}`}
      className={`scroll-mt-24 rounded-card border bg-surface-post lift-1 ${cardBorder}`}
    >
      <div className="p-4">
        {/* Kicker — the ONE slot for a post's special state (announcement / pinned /
            note), a single quiet uppercase line instead of three banner treatments. */}
        {(isAnnouncement || post.is_pinned || isNote) && (
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {isAnnouncement && (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-eyebrow text-primary-strong">
                <Megaphone className="h-3 w-3" /> Announcement
              </span>
            )}
            {post.is_pinned && (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-eyebrow text-primary-strong">
                <Pin className="h-3 w-3" /> Pinned
              </span>
            )}
            {isNote && (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-muted">
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
                width={40}
                height={40}
                style={avatarFocusStyle(author.avatar_url)}
                className="h-10 w-10 rounded-pill object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 select-none items-center justify-center rounded-pill bg-primary-bg text-meta font-semibold text-primary-strong">
                {getInitials(author.display_name)}
              </div>
            )}
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-snug">
              {/* The author is the card's title, so it takes the card-title role (a type role
                  that existed unused) with the heading's negative tracking. It was sharing one
                  size with the body, the timestamp and the reaction row, which is how a post
                  came to have no hierarchy at all. */}
              <Link
                href={`/people/${author.handle}`}
                className="text-card-title font-bold tracking-tight text-text hover:underline"
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
                    className="flex min-w-0 items-center gap-1 text-body-sm text-muted transition-colors hover:text-text"
                  >
                    <ScopeThumb scope={scope} />
                    <span className="truncate font-medium">
                      {scope.type === 'wall' ? `${scope.name}’s wall` : scope.name}
                    </span>
                  </Link>
                </>
              )}
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-meta text-subtle">
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

        {/* Body — `text-body`, the reading role, not the compact `text-body-sm` UI role. "Type
            is the hero" is DAWN's first in-app principle, and small body copy is one of the three
            habits its own diagnosis blames for the app reading as a SaaS template. */}
        {post.body && (
          <PostBody body={post.body} className="mb-2.5 text-body leading-relaxed text-text" />
        )}

        {/* Post image — inset media, no second frame around it. `h-54` is 13.5rem = 229.5px,
            DAWN's 230px (feed.jsx:86). It was `h-96`, 384px: two thirds taller than the mock, so
            a single photo post filled the column and the stream stopped reading as a stream.
            `rounded-control`, not `rounded-card` — inset media sits one radius step INSIDE the
            card that contains it; matching the parent made the photo look like the card. */}
        {post.media_urls?.length > 0 && (
          <div className="relative mb-2.5 h-54 w-full overflow-hidden rounded-control">
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
