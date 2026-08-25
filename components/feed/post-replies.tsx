'use client'

import { useState, useTransition, useEffect, useCallback, useRef, Suspense, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2, Send } from 'lucide-react'
import { createReply, fetchReplies } from '@/app/(main)/feed/actions'
import { isError } from '@/lib/action-result'
import { getInitials, relativeTime } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { ProfileFlair } from '@/components/profile-flair'
import { isEndorsed } from '@/lib/season-ranks'
import { ReactionBar, ReactionCounts, ReactionInlinePicker, usePostReactions, type ReactionRow } from './reaction-button'
import type { CommentNode, CommentLeaf, CommentThread } from '@/lib/feed/comment-thread'
import { Textarea } from '@/components/ui/field'

// ── The markdown body, loaded on demand ──────────────────────────────────────
// `PostBody` pulls react-markdown and the remark pipeline behind it (~35-45 KB gz). THIS file is
// a Client Component and post-card renders <PostReplies> under EVERY post, so a static import put
// that parser in the first-load JS of every feed-bearing route — downloaded on every phone, on
// every scroll, whether or not a single comment ever renders. post-card's own <PostBody> is
// untouched and stays eager: that file is a Server Component, so its copy renders on the server
// and ships no client JS at all.
//
// NO `loading` OPTION, on purpose. next/dynamic only wraps the lazy component in a Suspense
// boundary of its own when `loading` is set or `ssr` is false (`hasSuspenseBoundary` in
// node_modules/next/dist/shared/lib/lazy-dynamic/loadable.js). Leaving it off lets the suspend
// reach OUR boundary below — whose fallback can carry the comment's actual words, which a
// `loading` component (it receives only {error,isLoading,pastDelay}) cannot.
const MarkdownBody = dynamic(() => import('./post-body').then((m) => m.PostBody))

/**
 * One comment's body. The words show immediately as plain text, then swap to the rendered
 * markdown the moment the parser chunk lands — so a thread never flashes an empty row, which is
 * the one thing worse here than un-bolded copy.
 */
function CommentBody({ body, className }: { body: string; className?: string }) {
  return (
    <Suspense fallback={<div className={`whitespace-pre-wrap break-words ${className ?? ''}`}>{body}</div>}>
      <MarkdownBody body={body} className={className} />
    </Suspense>
  )
}

// Show the latest N top-level comments by default; the rest collapse behind a
// "View all" expander so a long thread doesn't stack 15 one-liners (the freshest
// replies stay visible, the older ones are one tap away).
const COLLAPSED_TOP_LEVEL = 3

type ReplyTarget = { id: string; name: string } | null

// One comment row (avatar + name + flair + time + body + actions). Shared by the
// top-level comment and its nested replies — `nested` only changes the avatar size
// so a reply reads as a child without re-authoring the row. Each row carries the
// emoji `ReactionBar` (comments are posts, so they take the same reactions) and a
// Reply affordance that opens the inline composer aimed here.
function CommentRow({
  comment,
  myProfileId,
  nested = false,
  onReply,
  children,
}: {
  comment: CommentLeaf
  /** The viewer's profile id — lets the bar highlight the viewer's own reactions. */
  myProfileId: string | null
  nested?: boolean
  /** Open the inline composer aimed at this comment. */
  onReply: (target: { id: string; name: string }) => void
  /** Nested replies + the inline composer, rendered under this row. */
  children?: ReactNode
}) {
  const { author } = comment
  const avatar = nested ? 20 : 24
  const avatarBox = nested ? 'w-5 h-5' : 'w-6 h-6'

  return (
    <div>
      {/* Warmer, tighter, less-boxy row: a soft inset tint (a step off the white
          card, no border), so the thread reads as a quiet conversation. */}
      <div className="flex items-start gap-2.5 rounded-card bg-surface-elevated/60 px-2.5 py-2 dark:bg-canvas/40">
        <Link href={author ? `/people/${author.handle}` : '#'} className="shrink-0">
          {author?.avatar_url ? (
            <Image
              src={avatarSrc(author.avatar_url)}
              alt={author.display_name}
              width={avatar}
              height={avatar}
              style={avatarFocusStyle(author.avatar_url)}
              className={`${avatarBox} rounded-pill object-cover`}
            />
          ) : (
            <div
              className={`${avatarBox} rounded-pill bg-primary-bg text-primary-strong text-3xs font-semibold flex items-center justify-center`}
            >
              {getInitials(author?.display_name ?? '?')}
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <Link
              href={author ? `/people/${author.handle}` : '#'}
              className="text-meta font-semibold text-text hover:underline"
            >
              {author?.display_name ?? 'Unknown'}
            </Link>
            {author && (
              <ProfileFlair
                rank={author.current_season_rank}
                streak={author.current_streak}
                endorsed={isEndorsed(author.membership_tier)}
                compact
              />
            )}
            <span className="text-2xs text-muted">{relativeTime(comment.created_at)}</span>
          </div>
          <CommentBody body={comment.body ?? ''} className="mt-0.5 text-meta leading-relaxed text-text" />
          {/* Per-comment actions: the emoji ReactionBar (comments are posts, so the
              same curated set, with grouped counts) and a Reply affordance that
              opens the composer aimed here. Replying to your OWN comment earns
              nothing (the server's self-reply guard keys off this comment's author). */}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <ReactionBar
              postId={comment.id}
              reactions={comment.reactions}
              myProfileId={myProfileId}
              compact
            />
            {author && (
              <button
                type="button"
                onClick={() => onReply({ id: comment.id, name: author.display_name })}
                className="rounded-control px-2 py-0.5 text-2xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-muted"
              >
                Reply
              </button>
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

/** How tall the comment box is allowed to grow before it starts scrolling itself. Roughly
 *  six lines at `text-meta` — enough for a real paragraph, short of a box that swallows the
 *  post it belongs to. */
const COMPOSER_MAX_H = 140

// A small inline composer reused for both the post-level and per-comment replies.
//
// 🔴 THE FIELD OWNS THE WHOLE ROW (owner, 2026-08-06: "make sure comment field goes full width
// and expands as lines are added"). This row used to open with a `reactSlot` holding five
// always-visible quick-reaction emojis, and that slot is `shrink-0` while the field is `flex-1`
// — so on a narrow card the emojis kept every pixel and the textarea gave up all of them. The
// reactions moved to the action line above (where the counts and the comment count already
// live); nothing shares this row now but the field and Send.
function ReplyComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  label,
  placeholder,
  autoFocus = false,
  divided = false,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (e: React.FormEvent | React.KeyboardEvent) => void
  disabled: boolean
  /** The box's permanent name. The placeholder is a prompt, and it is gone the moment
   *  there is a draft in the box, so it cannot be the only thing naming the field. */
  label: string
  placeholder: string
  autoFocus?: boolean
  /** Rule the row off from the counts line above it. Post-level only: a nested
   *  reply composer sits inside a thread and needs no second divider. */
  divided?: boolean
}) {
  const boxRef = useRef<HTMLTextAreaElement>(null)

  // AUTO-GROW, driven by the VALUE rather than by the keystroke. The old version resized
  // inside `onChange`, which grows fine but can never shrink on its own: sending a comment
  // clears the text through `setBody('')` without an onChange ever firing, so a box that had
  // grown to six lines stayed six lines tall over an empty field until the next keypress.
  // Watching `value` covers typing, sending, a restored draft after a failed write, and the
  // reply composer being re-aimed at a different comment — every way the text can change.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    el.style.height = 'auto' // measure the natural height before reading scrollHeight
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_H)}px`
  }, [value])

  return (
    <form
      onSubmit={onSubmit}
      // `items-end`, so Send stays on the last line as the box grows downward rather than
      // drifting to the middle of a paragraph.
      className={`mt-2.5 flex items-end gap-2 ${divided ? 'border-t border-border pt-2.5' : ''}`}
    >
      <Textarea
        ref={boxRef}
        aria-label={label}
        // `surface="post"`, not the default white (owner, 2026-08-06: "make all comment and
        // dispatch box backgrounds the same as the post box in every feed"). A `bg-surface`
        // field inside a `bg-surface-post` card was the brightest thing in the post — the
        // loudest surface on the row you use least. Level with the card, read by its border.
        surface="post"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={1}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) onSubmit(e)
        }}
        // `rounded-card`, not `rounded-pill`. DAWN's comment box is a single-line <input>, so a
        // pill is exactly right there; ours is a textarea that grows to 140px, and a pill radius
        // on a tall box turns the ends into large ovals. At one line the box is ~36px tall and
        // rounded-card's 17px is within a pixel of a true pill, so this matches the reference at
        // rest AND degrades properly once someone writes a paragraph.
        //
        // `min-w-0` matters more than it looks: a flex item's default `min-width:auto` refuses to
        // shrink below its content, which is how a `flex-1` field ends up overflowing its card
        // instead of wrapping. With the emoji strip gone this row has room, but the guard costs
        // nothing and keeps a long unbroken paste inside the card.
        className="min-w-0 flex-1 resize-none overflow-y-auto rounded-card px-3.5 text-meta leading-relaxed"
      />
      <button
        type="submit"
        disabled={!value.trim() || disabled}
        aria-label="Send comment"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-pill bg-primary-bg text-primary-strong transition-colors hover:bg-primary/20 disabled:opacity-40"
      >
        {disabled ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
      </button>
    </form>
  )
}

export function PostReplies({
  postId,
  initialCount,
  postReactions,
  myProfileId = null,
}: {
  postId: string
  initialCount: number
  /** The post's own reactions (one row per reactor + emoji). Drives the COUNTS shown
   *  top-right beside the comment count AND the inline emoji picker on the composer
   *  row — one shared state, so the two never drift. */
  postReactions: ReactionRow[]
  /** The viewer's profile id — lets each comment's reaction bar highlight the
   *  viewer's own reactions. Null when signed out. */
  myProfileId?: string | null
}) {
  // One reaction state for the post, shared by the top-right counts + the composer
  // picker so a tap in either place updates both instantly.
  const reactionState = usePostReactions(postId, postReactions, myProfileId)
  // Comments show in the feed: a post with replies opens its thread by default
  // (fetched on mount) instead of hiding them behind a click.
  const [open, setOpen] = useState(initialCount > 0)
  const [thread, setThread] = useState<CommentThread>({ comments: [], total: 0 })
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [body, setBody] = useState('')
  // The inline composer aimed at a specific comment (null = none open).
  const [replyTo, setReplyTo] = useState<ReplyTarget>(null)
  const [replyBody, setReplyBody] = useState('')
  const [replyError, setReplyError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const refresh = useCallback(async () => {
    const data = await fetchReplies(postId)
    setThread(data)
    setLoaded(true)
  }, [postId])

  useEffect(() => {
    if (!open || loaded) return
    startTransition(refresh)
  }, [open, loaded, refresh])

  function handleSubmit(e: React.FormEvent | React.KeyboardEvent) {
    e.preventDefault()
    if (!body.trim()) return
    const text = body
    setBody('')
    setReplyError(null)
    // The composer is always visible, so a comment can be sent while the thread is
    // collapsed — open it on submit (and mark loaded) so the new reply is seen.
    setOpen(true)
    setLoaded(true)
    startTransition(async () => {
      const res = await createReply(postId, text)
      if (isError(res)) {
        setBody(text) // restore the text so nothing is lost on a failed write
        setReplyError(res.error)
        return
      }
      await refresh()
    })
  }

  function handleReplySubmit(e: React.FormEvent | React.KeyboardEvent) {
    e.preventDefault()
    if (!replyBody.trim() || !replyTo) return
    const text = replyBody
    const target = replyTo
    const parentId = replyTo.id
    setReplyBody('')
    setReplyTo(null)
    setReplyError(null)
    setExpanded(true) // a fresh nested reply may sit under an older comment
    startTransition(async () => {
      // parent_id = the comment's id, so the server's self-reply guard keys off
      // that comment's author (reply-to-a-comment is free of self-farming).
      const res = await createReply(parentId, text)
      if (isError(res)) {
        setReplyBody(text) // restore the draft and reopen the composer aimed here
        setReplyTo(target)
        setReplyError(res.error)
        return
      }
      await refresh()
    })
  }

  const count = loaded ? thread.total : initialCount

  // Truncate long threads: show only the latest COLLAPSED_TOP_LEVEL top-level
  // comments by default (freshest at the bottom), with an expander for the rest.
  const allComments = thread.comments
  const hiddenCount = Math.max(0, allComments.length - COLLAPSED_TOP_LEVEL)
  const showExpander = !expanded && hiddenCount > 0
  const visibleComments = showExpander ? allComments.slice(-COLLAPSED_TOP_LEVEL) : allComments

  const renderComment = (comment: CommentNode) => (
    <CommentRow key={comment.id} comment={comment} myProfileId={myProfileId} onReply={setReplyTo}>
      {/* One level of nesting: replies indent under their parent (smaller avatar,
          ml-8). Replies-to-replies flatten to this same level server-side. */}
      {(comment.replies.length > 0 || replyTo?.id === comment.id) && (
        <div className="ml-8 mt-2.5 space-y-2.5">
          {comment.replies.map((reply) => (
            <CommentRow key={reply.id} comment={reply} myProfileId={myProfileId} nested onReply={setReplyTo} />
          ))}
          {replyTo?.id === comment.id && (
            <ReplyComposer
              value={replyBody}
              onChange={setReplyBody}
              onSubmit={handleReplySubmit}
              disabled={isPending}
              label={`Reply to ${replyTo.name}`}
              placeholder={`Reply to ${replyTo.name}…`}
              autoFocus
            />
          )}
        </div>
      )}
    </CommentRow>
  )

  return (
    <div>
      {/* ONE ACTION LINE, and it now holds all three (owner, 2026-08-06: "put emoji picker
          on same line as reacts and comments icons"). Left: the "View all / show fewer"
          control. Right, as one cluster: the reaction COUNTS, the react TRIGGER, the comment
          count. These are the three chrome affordances on a post and they belong together —
          the trigger was the odd one out, parked down on the composer row where it and its
          five quick emojis were crushing the comment field. */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          {showExpander ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-meta font-medium text-primary-strong hover:underline"
            >
              View all {count} comments
            </button>
          ) : expanded && hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-meta font-medium text-subtle hover:text-muted hover:underline"
            >
              Show fewer comments
            </button>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* NOT `compact`: these tallies are numeric CONTENT (how many people
              reacted), so they sit at the --text-meta content floor. The 11px
              `compact` pill stays for the per-comment bar, which is chrome-tight. */}
          {/* ── SELECTOR FIRST, THEN WHAT YOU PICKED (owner, 2026-08-06: "emoji selector is
              aligned left … when one is selected, it shows on the right by the react menu") ──
              The order was counts-then-selector, which meant the one FIXED control on this line
              moved every time somebody reacted: react to a post with no reactions and the
              trigger you just pressed slides right to make room for the pill it created. Anchor
              the control and let the variable-width part grow away from it, and the trigger
              stays where your finger last found it.
              `align="start"`: the popover hangs from the trigger's LEFT edge, opening rightward
              over the counts rather than out past the card. That only fits because the menu is
              compact — at ~148px it clears a 390px phone from where this cluster sits; the old
              ~180px row did not, which is why it used to hang from the right. */}
          <ReactionInlinePicker {...reactionState} align="start" />
          <ReactionCounts {...reactionState} />
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Hide comments' : 'Show comments'}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-2.5 py-1.5 text-meta font-medium transition-colors sm:min-h-0 ${
              open ? 'text-primary-strong' : 'text-subtle hover:bg-surface-elevated hover:text-muted'
            }`}
          >
            {isPending && !open ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 8.5c0 3.04-2.686 5.5-6 5.5a6.6 6.6 0 01-2.4-.45L2 15l.95-3.05A5.23 5.23 0 012 8.5C2 5.46 4.686 3 8 3s6 2.46 6 5.5z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {count > 0 && count}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-2.5 space-y-2.5">
          {/* Existing replies */}
          {!loaded && isPending ? (
            <div className="flex justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-subtle" />
            </div>
          ) : allComments.length === 0 ? (
            <p className="text-meta text-subtle text-center py-1">No replies yet. Be the first.</p>
          ) : (
            <div className="space-y-2.5">
              {/* The "View all / show fewer" control lives on the action line above. */}
              {visibleComments.map(renderComment)}
            </div>
          )}
        </div>
      )}

      {/* Reply composer — ALWAYS under every post. The field spans the row and grows with
          the text; only Send shares it. Enter sends, Shift+Enter breaks the line, and
          submitting opens the thread so the new comment is seen. */}
      <ReplyComposer
        value={body}
        onChange={setBody}
        onSubmit={handleSubmit}
        disabled={isPending}
        label="Your comment"
        placeholder="Add a comment…"
        divided
      />
      {replyError && <p className="mt-1 px-1 text-2xs text-danger">{replyError}</p>}
    </div>
  )
}
