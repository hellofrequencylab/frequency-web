'use client'

import { useState, useTransition, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2, Trash2, MessageCircle } from 'lucide-react'
import { Textarea } from '@/components/ui/field'
import { addDispatchComment, deleteDispatchComment } from '../actions'
import { getInitials, relativeTime } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'

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
        const created = await addDispatchComment(dispatchId, snapshot)
        // Render the new comment right away — the list is a frozen snapshot that
        // never refreshed, so without this it stayed invisible and a re-submit duped it.
        setComments(c => [...c, created])
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
        <h2 className="text-body-sm font-semibold text-text">
          {comments.length > 0 ? `${comments.length} comment${comments.length !== 1 ? 's' : ''}` : 'Comments'}
        </h2>
      </div>

      {/* Comment list */}
      {comments.length > 0 ? (
        <div className="space-y-4 mb-6">
          {comments.map(c => (
            <div key={c.id} className="flex gap-3 group">
              {c.author.avatar_url ? (
                <Image src={avatarSrc(c.author.avatar_url)} alt={c.author.display_name} width={28} height={28} className="w-7 h-7 rounded-pill object-cover shrink-0 mt-0.5" style={avatarFocusStyle(c.author.avatar_url)} />
              ) : (
                <div className="w-7 h-7 rounded-pill bg-border-strong flex items-center justify-center text-3xs font-bold text-muted shrink-0 mt-0.5 select-none">
                  {getInitials(c.author.display_name)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <Link
                    href={`/people/${c.author.handle}`}
                    className="text-meta font-semibold text-text hover:underline"
                  >
                    {c.author.display_name}
                  </Link>
                  <span className="text-2xs text-muted">{relativeTime(c.created_at)}</span>
                </div>
                <p className="text-body-sm text-text leading-relaxed mt-0.5 whitespace-pre-wrap break-words">
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
        <p className="text-body-sm text-subtle mb-5">No comments yet. Be the first.</p>
      )}

      {/* Compose */}
      {myProfileId ? (
        <form onSubmit={handleSubmit} className="flex gap-3">
          <Textarea
            ref={textareaRef}
            aria-label="Add a comment"
            value={body}
            onChange={e => setBody(e.target.value.slice(0, 2000))}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e) }}
            placeholder="Add a comment… (⌘↵ to post)"
            rows={2}
            disabled={isPending}
            className="flex-1 resize-none"
          />
          <button
            type="submit"
            disabled={!body.trim() || isPending}
            className="self-end inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-meta font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-40 transition-colors shrink-0"
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Post'}
          </button>
        </form>
      ) : (
        <p className="text-body-sm text-subtle">
          <Link href="/sign-in" className="text-primary-strong hover:underline">Sign in</Link> to comment.
        </p>
      )}
      {error && <p className="mt-2 text-meta text-danger">{error}</p>}
    </div>
  )
}
