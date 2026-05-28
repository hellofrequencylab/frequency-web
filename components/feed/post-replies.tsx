'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { Loader2, Send } from 'lucide-react'
import { createReply, fetchReplies } from '@/app/(main)/feed/actions'
import { getInitials, relativeTime } from '@/lib/utils'
import { ProfileFlair } from '@/components/profile-flair'

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
}: {
  postId: string
  initialCount: number
}) {
  const [open, setOpen] = useState(false)
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

  function handleSubmit(e: React.FormEvent) {
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
      <button
        onClick={() => setOpen((o) => !o)}
        className={`ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
          open
            ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
            : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
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

      {open && (
        <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
          {/* Existing replies */}
          {!loaded && isPending ? (
            <div className="flex justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : replies.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-1">No replies yet. Be the first.</p>
          ) : (
            replies.map((r) => (
              <div key={r.id} className="flex items-start gap-2.5 pl-2">
                <Link href={r.author ? `/people/${r.author.handle}` : '#'} className="shrink-0">
                  {r.author?.avatar_url ? (
                    <img src={r.author.avatar_url} alt={r.author.display_name} className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 text-[10px] font-semibold flex items-center justify-center">
                      {getInitials(r.author?.display_name ?? '?')}
                    </div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <Link href={r.author ? `/people/${r.author.handle}` : '#'} className="text-xs font-semibold text-gray-900 dark:text-gray-50 hover:underline">
                      {r.author?.display_name ?? 'Unknown'}
                    </Link>
                    {r.author && (
                      <ProfileFlair
                        rank={r.author.current_season_rank}
                        streak={r.author.current_streak}
                        compact
                      />
                    )}
                    <span className="text-[11px] text-gray-400">{relativeTime(r.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap mt-0.5">{r.body}</p>
                </div>
              </div>
            ))
          )}

          {/* Reply composer */}
          <form onSubmit={handleSubmit} className="flex items-start gap-2 pl-2">
            <div className="flex-1">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write a reply…"
                rows={2}
                disabled={isPending}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e as any)
                }}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-gray-900 dark:text-gray-50 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-100 dark:focus:ring-indigo-900 resize-none disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={!body.trim() || isPending}
              className="mt-0.5 p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
