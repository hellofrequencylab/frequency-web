'use client'

import { useState, useTransition, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2, Trash2, MessageCircle } from 'lucide-react'
import { addDispatchComment, deleteDispatchComment } from '../actions'
import { getInitials } from '@/lib/utils'

type Comment = {
  id: string
  body: string
  created_at: string
  author: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  }
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function CommentSection({
  dispatchId,
  comments: initial,
  myProfileId,
}: {
  dispatchId: string
  comments: Comment[]
  myProfileId: string | null
}) {
  const [comments, setComments] = useState(initial)
  const [body,     setBody]     = useState('')
  const [error,    setError]    = useState('')
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setError('')
    const snapshot = body
    setBody('')
    startTransition(async () => {
      try {
        await addDispatchComment(dispatchId, snapshot)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to post comment.')
        setBody(snapshot)
      }
    })
  }

  function handleDelete(commentId: string) {
    startTransition(async () => {
      try {
        await deleteDispatchComment(commentId, dispatchId)
        setComments(c => c.filter(x => x.id !== commentId))
      } catch { /* silently ignore */ }
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <MessageCircle className="w-4 h-4 text-subtle" />
        <h2 className="text-sm font-semibold text-text">
          {comments.length > 0 ? `${comments.length} comment${comments.length !== 1 ? 's' : ''}` : 'Comments'}
        </h2>
      </div>

      {/* Comment list */}
      {comments.length > 0 ? (
        <div className="space-y-4 mb-6">
          {comments.map(c => (
            <div key={c.id} className="flex gap-3 group">
              {c.author.avatar_url ? (
                <Image src={c.author.avatar_url} alt={c.author.display_name} width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-border-strong flex items-center justify-center text-[10px] font-bold text-muted shrink-0 mt-0.5 select-none">
                  {getInitials(c.author.display_name)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <Link
                    href={`/people/${c.author.handle}`}
                    className="text-xs font-semibold text-text hover:underline"
                  >
                    {c.author.display_name}
                  </Link>
                  <span className="text-[11px] text-subtle">{relTime(c.created_at)}</span>
                </div>
                <p className="text-sm text-text leading-relaxed mt-0.5 whitespace-pre-wrap break-words">
                  {c.body}
                </p>
              </div>
              {myProfileId === c.author.id && (
                <button
                  onClick={() => handleDelete(c.id)}
                  disabled={isPending}
                  className="shrink-0 p-1 rounded text-subtle/60 hover:text-danger opacity-0 group-hover:opacity-100 transition-all disabled:opacity-30"
                  title="Delete comment"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-subtle mb-5">No comments yet. Be the first.</p>
      )}

      {/* Compose */}
      {myProfileId ? (
        <form onSubmit={handleSubmit} className="flex gap-3">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={e => setBody(e.target.value.slice(0, 2000))}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e) }}
            placeholder="Add a comment… (⌘↵ to post)"
            rows={2}
            disabled={isPending}
            className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 dark:focus:ring-primary/30 resize-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!body.trim() || isPending}
            className="self-end inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-40 transition-colors shrink-0"
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Post'}
          </button>
        </form>
      ) : (
        <p className="text-sm text-subtle">
          <Link href="/sign-in" className="text-primary-strong hover:underline">Sign in</Link> to comment.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  )
}
