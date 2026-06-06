'use client'

import { useState, useTransition, useEffect, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2, Send } from 'lucide-react'
import { createReply, fetchReplies } from '@/app/(main)/feed/actions'
import { getInitials, relativeTime } from '@/lib/utils'
import { ProfileFlair } from '@/components/profile-flair'
import { isEndorsed } from '@/lib/season-ranks'
import { PostBody } from './post-body'

type ReplyAuthor = {
  id: string
  display_name: string
  handle: string
  avatar_url: string | null
  community_role: string
  current_season_rank?: string | null
  current_streak?: number
  achievement_count?: number
}

type Reply = {
  id: string
  body: string
  created_at: string
  author: ReplyAuthor | null
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
  const [replies, setReplies] = useState<Reply[]>([])
  const [loaded, setLoaded] = useState(false)
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open || loaded) return
    startTransition(async () => {
      const data = await fetchReplies(postId)
      setReplies(data as Reply[])
      setLoaded(true)
    })
  }, [open, loaded, postId])

  function handleSubmit(e: React.FormEvent | React.KeyboardEvent) {
    e.preventDefault()
    if (!body.trim()) return
    const text = body
    setBody('')
    startTransition(async () => {
      await createReply(postId, text)
      const data = await fetchReplies(postId)
      setReplies(data as Reply[])
    })
  }

  const count = loaded ? replies.length : initialCount

  return (
    <div>
      {/* One balanced action line under the post content: reactions, the comment
          toggle, and the reward chip — all on the right. */}
      <div className="mt-3 flex items-center justify-end gap-0.5 border-t border-border pt-2">
        {reactions}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Hide comments' : 'Show comments'}
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
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
          {count > 0 ? count : 'Reply'}
        </button>
        {reward}
      </div>

      {open && (
        <div className="mt-3 border-t border-border pt-3 space-y-3">
          {/* Existing replies */}
          {!loaded && isPending ? (
            <div className="flex justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-subtle" />
            </div>
          ) : replies.length === 0 ? (
            <p className="text-xs text-subtle text-center py-1">No replies yet. Be the first.</p>
          ) : (
            <div className="space-y-3">
            {replies.map((r) => (
              <div key={r.id} className="flex items-start gap-2.5">
                <Link href={r.author ? `/people/${r.author.handle}` : '#'} className="shrink-0">
                  {r.author?.avatar_url ? (
                    <Image src={r.author.avatar_url} alt={r.author.display_name} width={24} height={24} className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-primary-bg text-primary-strong text-3xs font-semibold flex items-center justify-center">
                      {getInitials(r.author?.display_name ?? '?')}
                    </div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <Link href={r.author ? `/people/${r.author.handle}` : '#'} className="text-xs font-semibold text-text hover:underline">
                      {r.author?.display_name ?? 'Unknown'}
                    </Link>
                    {r.author && (
                      <ProfileFlair
                        rank={r.author.current_season_rank}
                        streak={r.author.current_streak}
                        endorsed={isEndorsed(r.author.community_role)}
                        compact
                      />
                    )}
                    <span className="text-2xs text-subtle">{relativeTime(r.created_at)}</span>
                  </div>
                  <PostBody body={r.body} className="mt-0.5 text-xs leading-relaxed text-text" />
                </div>
              </div>
            ))}
            </div>
          )}

          {/* Reply composer — a single growing line; ⌘/Ctrl+Enter or the button sends. */}
          <form onSubmit={handleSubmit} className="flex items-end gap-2 pl-2">
            <textarea
              value={body}
              onChange={(e) => {
                setBody(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`
              }}
              placeholder="Add a comment…"
              rows={1}
              disabled={isPending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e)
              }}
              className="flex-1 resize-none rounded-xl border border-border bg-surface px-3.5 py-2 text-xs leading-relaxed text-text placeholder-subtle focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong/30 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!body.trim() || isPending}
              aria-label="Send comment"
              className="shrink-0 rounded-xl bg-primary p-2.5 text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
