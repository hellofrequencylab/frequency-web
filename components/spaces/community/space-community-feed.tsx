'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2, MessageCircle, Send } from 'lucide-react'
import { REACTIONS, reactionLabel } from '@/lib/feed/reactions'
import { createSpaceUpdate, reactToSpaceUpdate, commentOnSpaceUpdate } from '@/lib/spaces/content-actions'
import { FollowSpaceButton } from '@/components/spaces/follow-space-button'
import { isError } from '@/lib/action-result'
import type { SpaceCommunityPost, SpaceUpdateComment, SpaceUpdateReactions } from '@/lib/spaces/content-data'

// THE COMMUNITY FEED (business Community tab). Facebook/Yelp-style: the business posts Updates, members
// react + comment. PUBLIC read; only FOLLOWERS (or the operator) may interact, enforced server-side in
// reactToSpaceUpdate / commentOnSpaceUpdate. This client owns the optimistic interaction; the operator
// composer posts through createSpaceUpdate. Semantic DAWN tokens only, voice canon (no em dashes).

const inputCls =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-primary'

export function SpaceCommunityFeed({
  slug,
  spaceId,
  brandName,
  canPost,
  signedIn,
  following,
  posts,
}: {
  slug: string
  spaceId: string
  brandName: string
  /** The operator (owner / admin / editor): may post Updates + always interact. */
  canPost: boolean
  signedIn: boolean
  following: boolean
  posts: SpaceCommunityPost[]
}) {
  // A follower OR the operator may react + comment (the operator can always reply on its own wall).
  const canInteract = canPost || following

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {canPost && <Composer slug={slug} />}

      {!canInteract && (
        <JoinPrompt spaceId={spaceId} brandName={brandName} signedIn={signedIn} />
      )}

      {posts.length === 0 ? (
        <EmptyState canPost={canPost} brandName={brandName} />
      ) : (
        posts.map((post) => (
          <PostCard key={post.update.id} slug={slug} brandName={brandName} post={post} canInteract={canInteract} />
        ))
      )}
    </div>
  )
}

/** The operator's post composer: a title + body, posted immediately as a published Update. */
function Composer({ slug }: { slug: string }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const post = () => {
    setError(null)
    if (!title.trim() && !body.trim()) return
    start(async () => {
      const res = await createSpaceUpdate(slug, { title, body })
      if (isError(res)) setError(res.error)
      else {
        setTitle('')
        setBody('')
      }
    })
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a title (optional)"
        maxLength={200}
        className={inputCls}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share an update with your community"
        rows={3}
        maxLength={20000}
        className={inputCls}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={post}
          disabled={pending || (!title.trim() && !body.trim())}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          Post
        </button>
      </div>
    </div>
  )
}

/** The prompt a non-interacting viewer sees: follow to join in, or sign in first. */
function JoinPrompt({ spaceId, brandName, signedIn }: { spaceId: string; brandName: string; signedIn: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-elevated/50 p-4">
      <p className="text-sm text-muted">
        {signedIn
          ? `Follow ${brandName} to react and join the conversation.`
          : 'Sign in and follow this space to react and comment.'}
      </p>
      {signedIn ? (
        <FollowSpaceButton spaceId={spaceId} spaceName={brandName} initialFollowing={false} />
      ) : (
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Sign in
        </Link>
      )}
    </div>
  )
}

function EmptyState({ canPost, brandName }: { canPost: boolean; brandName: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center">
      <MessageCircle className="mx-auto h-8 w-8 text-subtle" aria-hidden />
      <p className="mt-3 text-sm font-semibold text-text">
        {canPost ? 'Post your first update' : `${brandName} has not posted yet`}
      </p>
      <p className="mt-1 text-xs text-muted">
        {canPost
          ? 'Share news, offers, or a behind-the-scenes look. Followers can react and comment.'
          : 'Follow this space to see updates the moment they land.'}
      </p>
    </div>
  )
}

/** One Update: its copy + image, a reaction bar, and its comment thread. Owns the OPTIMISTIC interaction
 *  state (reactions + comments), initialized from the server-rendered post. */
function PostCard({
  slug,
  brandName,
  post,
  canInteract,
}: {
  slug: string
  brandName: string
  post: SpaceCommunityPost
  canInteract: boolean
}) {
  const { update, anchorId } = post
  const [reactions, setReactions] = useState<SpaceUpdateReactions>(post.reactions)
  const [comments, setComments] = useState<SpaceUpdateComment[]>(post.comments)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const toggleReaction = (emoji: string) => {
    if (!canInteract || !anchorId) return
    const active = reactions.mine.includes(emoji)
    // Optimistic flip; roll back to the server-rendered state if the action fails.
    const prev = reactions
    const counts = { ...reactions.counts }
    counts[emoji] = (counts[emoji] ?? 0) + (active ? -1 : 1)
    if (counts[emoji] <= 0) delete counts[emoji]
    setReactions({
      counts,
      mine: active ? reactions.mine.filter((e) => e !== emoji) : [...reactions.mine, emoji],
    })
    start(async () => {
      const res = await reactToSpaceUpdate(anchorId, emoji, !active)
      if (isError(res)) setReactions(prev)
    })
  }

  const submitComment = () => {
    setError(null)
    const body = draft.trim()
    if (!body || !anchorId) return
    start(async () => {
      const res = await commentOnSpaceUpdate(slug, anchorId, body)
      if (isError(res)) setError(res.error)
      else {
        setComments((c) => [...c, { id: res.data.id, body, createdAt: '', author: { name: 'You', avatarUrl: null } }])
        setDraft('')
      }
    })
  }

  return (
    <article className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <header className="text-xs font-semibold uppercase tracking-wide text-subtle">{brandName}</header>
      {update.title && <h3 className="text-lg font-bold text-text">{update.title}</h3>}
      {update.body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{update.body}</p>}
      {update.imageUrl && (
        <Image
          src={update.imageUrl}
          alt=""
          width={800}
          height={450}
          unoptimized
          className="w-full rounded-xl object-cover"
        />
      )}

      {/* Reaction bar: every curated emoji with its live count. Followers/operators toggle; others see
          the counts read-only. */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {REACTIONS.map((r) => {
          const count = reactions.counts[r.key] ?? 0
          const mine = reactions.mine.includes(r.key)
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => toggleReaction(r.key)}
              disabled={!canInteract || !anchorId}
              aria-pressed={mine}
              aria-label={reactionLabel(r.key)}
              title={reactionLabel(r.key)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors disabled:cursor-default ${
                mine ? 'border-primary bg-primary-bg text-primary-strong' : 'border-border bg-surface text-muted'
              } ${canInteract && anchorId ? 'hover:border-border-strong' : ''}`}
            >
              <span aria-hidden>{r.key}</span>
              {count > 0 && <span className="text-xs font-semibold tabular-nums">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Comments */}
      {comments.length > 0 && (
        <ul className="space-y-2 border-t border-border pt-3">
          {comments.map((c) => (
            <li key={c.id} className="text-sm">
              <span className="font-semibold text-text">{c.author?.name ?? 'Member'}</span>{' '}
              <span className="whitespace-pre-wrap text-muted">{c.body}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Comment box (followers / operator only) */}
      {canInteract && anchorId && (
        <div className="flex items-start gap-2 pt-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a comment"
            rows={1}
            maxLength={5000}
            className={inputCls}
          />
          <button
            type="button"
            onClick={submitComment}
            disabled={pending || !draft.trim()}
            aria-label="Post comment"
            className="mt-0.5 inline-flex shrink-0 items-center rounded-lg bg-primary p-2 text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </article>
  )
}
