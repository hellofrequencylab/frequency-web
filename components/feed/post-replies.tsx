'use client'

import { useState, useTransition, useEffect, useCallback, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2, Send } from 'lucide-react'
import { createReply, fetchReplies } from '@/app/(main)/feed/actions'
import { getInitials, relativeTime } from '@/lib/utils'
import { ProfileFlair } from '@/components/profile-flair'
import { isEndorsed } from '@/lib/season-ranks'
import { PostBody } from './post-body'
import { ReactionButton } from './reaction-button'
import type { CommentNode, CommentLeaf, CommentThread } from '@/lib/feed/comment-thread'

// Show the latest N top-level comments by default; the rest collapse behind a
// "View all" expander so a long thread doesn't stack 15 one-liners (the freshest
// replies stay visible, the older ones are one tap away).
const COLLAPSED_TOP_LEVEL = 3

type ReplyTarget = { id: string; name: string } | null

// One comment row (avatar + name + flair + time + body + actions). Shared by the
// top-level comment and its nested replies — `nested` only changes the avatar size
// so a reply reads as a child without re-authoring the row.
function CommentRow({
  comment,
  nested = false,
  onReply,
  children,
}: {
  comment: CommentLeaf
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
      <div className="flex items-start gap-2.5">
        <Link href={author ? `/people/${author.handle}` : '#'} className="shrink-0">
          {author?.avatar_url ? (
            <Image
              src={author.avatar_url}
              alt={author.display_name}
              width={avatar}
              height={avatar}
              className={`${avatarBox} rounded-full object-cover`}
            />
          ) : (
            <div
              className={`${avatarBox} rounded-full bg-primary-bg text-primary-strong text-3xs font-semibold flex items-center justify-center`}
            >
              {getInitials(author?.display_name ?? '?')}
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <Link
              href={author ? `/people/${author.handle}` : '#'}
              className="text-xs font-semibold text-text hover:underline"
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
            <span className="text-2xs text-subtle">{relativeTime(comment.created_at)}</span>
          </div>
          <PostBody body={comment.body ?? ''} className="mt-0.5 text-xs leading-relaxed text-text" />
          {/* Per-comment actions: a heart (reuses ReactionButton on this comment's
              id — comments are posts) and a Reply affordance that opens the composer
              aimed here. Replying to your OWN comment earns nothing (the server's
              self-reply guard keys off this comment's author). */}
          <div className="-ml-1.5 mt-0.5 flex items-center gap-0.5">
            <ReactionButton
              postId={comment.id}
              reactionType="heart"
              initialActive={comment.viewer_reacted}
              initialCount={comment.reaction_count}
            />
            {author && (
              <button
                type="button"
                onClick={() => onReply({ id: comment.id, name: author.display_name })}
                className="rounded-lg px-2 py-1 text-2xs font-medium text-subtle transition-colors hover:bg-surface-elevated hover:text-muted"
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

// A small inline composer reused for both the post-level and per-comment replies.
function ReplyComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  autoFocus = false,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (e: React.FormEvent | React.KeyboardEvent) => void
  disabled: boolean
  placeholder: string
  autoFocus?: boolean
}) {
  return (
    <form onSubmit={onSubmit} className="mt-3 flex items-end gap-2 pl-2">
      <textarea
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`
        }}
        placeholder={placeholder}
        rows={1}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) onSubmit(e)
        }}
        className="flex-1 resize-none rounded-xl border border-border bg-surface px-3.5 py-2 text-xs leading-relaxed text-text placeholder-subtle focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong/30 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!value.trim() || disabled}
        aria-label="Send comment"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40 sm:h-auto sm:w-auto sm:p-2.5"
      >
        {disabled ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
      </button>
    </form>
  )
}

export function PostReplies({
  postId,
  initialCount,
  reactions,
  reward,
}: {
  postId: string
  initialCount: number
  /** Reaction controls (heart/plus) rendered inline, left of the comment toggle. */
  reactions?: ReactNode
  /** Reward chip (zaps) rendered inline, right of the comment toggle. */
  reward?: ReactNode
}) {
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
    // The composer is always visible, so a comment can be sent while the thread is
    // collapsed — open it on submit (and mark loaded) so the new reply is seen.
    setOpen(true)
    setLoaded(true)
    startTransition(async () => {
      await createReply(postId, text)
      await refresh()
    })
  }

  function handleReplySubmit(e: React.FormEvent | React.KeyboardEvent) {
    e.preventDefault()
    if (!replyBody.trim() || !replyTo) return
    const text = replyBody
    const parentId = replyTo.id
    setReplyBody('')
    setReplyTo(null)
    setExpanded(true) // a fresh nested reply may sit under an older comment
    startTransition(async () => {
      // parent_id = the comment's id, so the server's self-reply guard keys off
      // that comment's author (reply-to-a-comment is free of self-farming).
      await createReply(parentId, text)
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
    <CommentRow key={comment.id} comment={comment} onReply={setReplyTo}>
      {/* One level of nesting: replies indent under their parent (smaller avatar,
          ml-8). Replies-to-replies flatten to this same level server-side. */}
      {(comment.replies.length > 0 || replyTo?.id === comment.id) && (
        <div className="ml-8 mt-3 space-y-3">
          {comment.replies.map((reply) => (
            <CommentRow key={reply.id} comment={reply} nested onReply={setReplyTo} />
          ))}
          {replyTo?.id === comment.id && (
            <ReplyComposer
              value={replyBody}
              onChange={setReplyBody}
              onSubmit={handleReplySubmit}
              disabled={isPending}
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
      {/* One balanced action line under the post content: reactions, the comment
          toggle, and the reward chip — all on the right. No divider rule; spacing
          alone separates it from the content (density over lines). */}
      <div className="mt-3 flex items-center justify-end gap-0.5">
        {reactions}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Hide comments' : 'Show comments'}
          className={`flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:min-h-0 ${
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
        {reward}
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Existing replies */}
          {!loaded && isPending ? (
            <div className="flex justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-subtle" />
            </div>
          ) : allComments.length === 0 ? (
            <p className="text-xs text-subtle text-center py-1">No replies yet. Be the first.</p>
          ) : (
            <div className="space-y-3">
              {/* Truncation expander: reveal the earlier top-level comments. */}
              {showExpander && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="text-xs font-medium text-primary-strong hover:underline"
                >
                  View all {count} comments
                </button>
              )}
              {expanded && hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="text-xs font-medium text-subtle hover:text-muted hover:underline"
                >
                  Show fewer comments
                </button>
              )}
              {visibleComments.map(renderComment)}
            </div>
          )}
        </div>
      )}

      {/* Reply composer — ALWAYS under every post, not gated behind the toggle, so
          "Add a comment" is a one-step action (A.2). A single growing line;
          ⌘/Ctrl+Enter or the button sends. Submitting opens the thread. */}
      <ReplyComposer
        value={body}
        onChange={setBody}
        onSubmit={handleSubmit}
        disabled={isPending}
        placeholder="Add a comment…"
      />
    </div>
  )
}
