'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2, MessageCircle, Pin, Send } from 'lucide-react'
import { REACTIONS, reactionLabel } from '@/lib/feed/reactions'
import {
  createSpaceUpdate,
  updateSpaceUpdate,
  deleteSpaceUpdate,
  createMemberPost,
  reactToSpaceUpdate,
  commentOnSpaceUpdate,
  setCommunityMemberPosts,
  removeCommunityPost,
  uploadCommunityImage,
  pinCommunityPost,
} from '@/lib/spaces/content-actions'
import { FollowSpaceButton } from '@/components/spaces/follow-space-button'
import { Composer } from '@/components/feed/composer'
import { PostBody } from '@/components/feed/post-body'
import { ToggleRow } from '@/components/entity-blocks/controls/field-controls'
import { isError } from '@/lib/action-result'
import type { SpaceCommunityPost, SpaceUpdateComment, SpaceUpdateReactions } from '@/lib/spaces/content-data'
import { Input, Textarea } from '@/components/ui/field'
import { Button } from '@/components/ui/button'

// THE COMMUNITY FEED (business Community tab). Facebook/Yelp-style: the business posts Updates, FOLLOWERS
// may also post (when the business allows it), and members react + comment. PUBLIC read; only followers (or
// the operator) may interact, enforced server-side. Semantic DAWN tokens only, voice canon (no em dashes).

/** Push a chosen file through the Space's follower-gated community-image action and hand the shared
 *  Composer back the public URL (or null on failure, which the Composer surfaces). */
async function uploadSpaceImage(slug: string, file: File): Promise<string | null> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await uploadCommunityImage(slug, fd)
  return 'error' in res ? null : res.url
}

export function SpaceCommunityFeed({
  slug,
  spaceId,
  brandName,
  viewerId,
  canPost,
  canModerate,
  signedIn,
  following,
  allowMemberPosts,
  posts,
}: {
  slug: string
  spaceId: string
  brandName: string
  viewerId: string | null
  /** The operator (owner / admin / editor): posts brand Updates + always interacts. */
  canPost: boolean
  /** The operator may hide any member post. */
  canModerate: boolean
  signedIn: boolean
  following: boolean
  /** Whether the business currently accepts member posts. */
  allowMemberPosts: boolean
  posts: SpaceCommunityPost[]
}) {
  const canInteract = canPost || following
  // A follower who is not the operator may post when the business allows member posts.
  const canMemberPost = !canPost && following && allowMemberPosts

  return (
    <div className="space-y-5">
      {canPost && (
        <>
          <MemberPostsToggle slug={slug} initial={allowMemberPosts} />
          <BrandComposer slug={slug} spaceId={spaceId} />
        </>
      )}
      {canMemberPost && <MemberComposer slug={slug} spaceId={spaceId} />}

      {!canInteract && <JoinPrompt spaceId={spaceId} brandName={brandName} signedIn={signedIn} />}

      {posts.length === 0 ? (
        <EmptyState canPost={canPost} brandName={brandName} />
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.update.id}
            slug={slug}
            brandName={brandName}
            viewerId={viewerId}
            canModerate={canModerate}
            canPost={canPost}
            post={post}
            canInteract={canInteract}
          />
        ))
      )}
    </div>
  )
}

/** The operator switch that turns member posting on or off for the Space. */
function MemberPostsToggle({ slug, initial }: { slug: string; initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [, start] = useTransition()
  return (
    <div className="rounded-card border border-border bg-surface-elevated/50 px-4 py-2">
      <ToggleRow
        label="Allow members to post"
        checked={on}
        onChange={(next) => {
          setOn(next) // optimistic
          start(async () => {
            const res = await setCommunityMemberPosts(slug, next)
            if (isError(res)) setOn(!next)
          })
        }}
      />
    </div>
  )
}

/** The operator's brand-post composer. Reuses the SHARED feed Composer (same box, tools, photo flow) so
 *  the Community feed matches the home feed exactly; the optional title rides the Composer's `topSlot` and
 *  posts through the Space's own published-Update action. */
function BrandComposer({ slug, spaceId }: { slug: string; spaceId: string }) {
  const [title, setTitle] = useState('')
  return (
    <Composer
      scopeId={spaceId}
      placeholder="Share an update with your community"
      submitLabel="Post"
      onUploadImage={(file) => uploadSpaceImage(slug, file)}
      topSlot={
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Title"
          placeholder="Add a title (optional)"
          maxLength={200}
        />
      }
      onSubmit={async ({ body, imageUrl }) => {
        const res = await createSpaceUpdate(slug, { title, body, imageUrl })
        if (isError(res)) return { error: res.error }
        setTitle('')
      }}
    />
  )
}

/** A follower's post composer. The SAME shared feed Composer, posting through the Space's gated member-post
 *  action so followers write with the identical box they know from the home feed. */
function MemberComposer({ slug, spaceId }: { slug: string; spaceId: string }) {
  return (
    <Composer
      scopeId={spaceId}
      placeholder="Share something with this community"
      submitLabel="Post"
      onUploadImage={(file) => uploadSpaceImage(slug, file)}
      onSubmit={async ({ body, imageUrl }) => {
        const res = await createMemberPost(slug, body, imageUrl)
        if (isError(res)) return { error: res.error }
      }}
    />
  )
}

/** The prompt a non-interacting viewer sees: follow to join in, or sign in first. */
function JoinPrompt({ spaceId, brandName, signedIn }: { spaceId: string; brandName: string; signedIn: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface-elevated/50 p-4">
      <p className="text-body-sm text-muted">
        {signedIn
          ? `Follow ${brandName} to react, comment, and post.`
          : 'Sign in and follow this space to react, comment, and post.'}
      </p>
      {signedIn ? (
        <FollowSpaceButton spaceId={spaceId} spaceName={brandName} initialFollowing={false} />
      ) : (
        <Link
          href="/sign-in"
          className="inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Sign in
        </Link>
      )}
    </div>
  )
}

function EmptyState({ canPost, brandName }: { canPost: boolean; brandName: string }) {
  return (
    <div className="rounded-card border border-dashed border-border p-10 text-center">
      <MessageCircle className="mx-auto h-8 w-8 text-subtle" aria-hidden />
      <p className="mt-3 text-body-sm font-semibold text-text">
        {canPost ? 'Post your first update' : `${brandName} has not posted yet`}
      </p>
      <p className="mt-1 text-meta text-muted">
        {canPost
          ? 'Share news, offers, or a behind-the-scenes look. Followers can react, comment, and post too.'
          : 'Follow this space to see updates the moment they land.'}
      </p>
    </div>
  )
}

/** One post: brand Update or member post. Owns the OPTIMISTIC interaction state (reactions + comments). */
function PostCard({
  slug,
  brandName,
  viewerId,
  canModerate,
  canPost,
  post,
  canInteract,
}: {
  slug: string
  brandName: string
  viewerId: string | null
  canModerate: boolean
  /** The operator who posts brand Updates, and so the one who may edit or delete one. */
  canPost: boolean
  post: SpaceCommunityPost
  canInteract: boolean
}) {
  const { update, anchorId } = post
  const [reactions, setReactions] = useState<SpaceUpdateReactions>(post.reactions)
  const [comments, setComments] = useState<SpaceUpdateComment[]>(post.comments)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [removed, setRemoved] = useState(false)
  const [pinned, setPinned] = useState(post.pinned)
  const [pending, start] = useTransition()
  // Brand-Update editing, and the delete confirm. `editing` holds the draft so a cancelled edit
  // leaves the card exactly as it was.
  const [editing, setEditing] = useState<{ title: string; body: string } | null>(null)
  const [shown, setShown] = useState({ title: update.title ?? '', body: update.body ?? '' })
  const [confirmDelete, setConfirmDelete] = useState(false)

  // A member post can be removed by an operator (moderation) or by its own author.
  const canRemove = post.kind === 'member' && (canModerate || (!!post.authorId && post.authorId === viewerId))
  // A brand Update belongs to the Space, so the operator who can post one can edit or delete it.
  // The server re-checks with authorizeEditor either way; this only decides what is offered.
  const canManageUpdate = post.kind === 'brand' && canPost
  const authorLabel = post.kind === 'member' ? post.author?.name ?? 'Member' : brandName

  const toggleReaction = (emoji: string) => {
    if (!canInteract || !anchorId) return
    const active = reactions.mine.includes(emoji)
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

  const remove = () => {
    start(async () => {
      const res = await removeCommunityPost(slug, update.id)
      if (!isError(res)) setRemoved(true)
    })
  }

  const togglePin = () => {
    if (!anchorId) return
    const next = !pinned
    setPinned(next) // optimistic
    start(async () => {
      const res = await pinCommunityPost(slug, anchorId, next)
      if (isError(res)) setPinned(!next)
    })
  }

  const saveEdit = () => {
    if (!editing) return
    setError(null)
    const next = { title: editing.title.trim(), body: editing.body.trim() }
    if (!next.title && !next.body) {
      setError('Add a title or some words first.')
      return
    }
    start(async () => {
      const res = await updateSpaceUpdate(slug, update.id, next)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setShown(next) // optimistic: the card shows what was saved without a refetch
      setEditing(null)
    })
  }

  const deleteUpdate = () => {
    setError(null)
    start(async () => {
      const res = await deleteSpaceUpdate(slug, update.id)
      if (isError(res)) {
        setError(res.error)
        setConfirmDelete(false)
        return
      }
      setRemoved(true)
    })
  }

  if (removed) return null

  return (
    <article
      className={`space-y-3 rounded-card border bg-surface p-4 lift-1 ${pinned ? 'border-primary/50' : 'border-border'}`}
    >
      <header className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          {pinned && (
            <span className="inline-flex items-center gap-0.5 rounded-pill bg-primary-bg px-1.5 py-0.5 text-2xs font-bold text-primary-strong">
              <Pin className="h-3 w-3" aria-hidden /> Pinned
            </span>
          )}
          <span className="text-meta font-semibold uppercase tracking-wide text-subtle">{authorLabel}</span>
        </span>
        <span className="flex items-center gap-2">
          {canModerate && anchorId && (
            <button
              type="button"
              onClick={togglePin}
              disabled={pending}
              className="text-2xs font-semibold text-muted hover:text-primary-strong disabled:opacity-60"
            >
              {pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="text-2xs font-semibold text-muted hover:text-danger disabled:opacity-60"
            >
              Remove
            </button>
          )}
          {canManageUpdate && !editing && (
            <>
              <button
                type="button"
                onClick={() => setEditing({ title: shown.title, body: shown.body })}
                disabled={pending}
                className="text-2xs font-semibold text-muted hover:text-primary-strong disabled:opacity-60"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => (comments.length > 0 ? setConfirmDelete(true) : deleteUpdate())}
                disabled={pending}
                className="text-2xs font-semibold text-muted hover:text-danger disabled:opacity-60"
              >
                Delete
              </button>
            </>
          )}
        </span>
      </header>
      {/* Deleting an Update takes its interaction anchor, and posts.parent_id is ON DELETE
          CASCADE, so the comment thread goes with it. The operator is told that ONLY when a
          thread exists -- a confirm on every delete trains people to click through it, which is
          exactly when the one that mattered gets clicked through too. */}
      {confirmDelete && (
        <div className="space-y-2 rounded-card border border-danger/40 bg-danger-bg px-3 py-2.5" role="alert">
          <p className="text-body-sm font-medium text-danger">
            Deleting this update also removes {comments.length === 1 ? 'its 1 comment' : `its ${comments.length} comments`}. That cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="danger" size="sm" onClick={deleteUpdate} disabled={pending}>
              Delete anyway
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmDelete(false)} disabled={pending}>
              Keep it
            </Button>
          </div>
        </div>
      )}

      {editing ? (
        <div className="space-y-2">
          <Input
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            aria-label="Update title"
            placeholder="Title (optional)"
            maxLength={200}
          />
          <Textarea
            value={editing.body}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            aria-label="Update text"
            rows={4}
            maxLength={20000}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={saveEdit} disabled={pending} loading={pending}>
              Save
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => { setEditing(null); setError(null) }}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          {shown.title && <h3 className="text-body-lg font-bold text-text">{shown.title}</h3>}
          {shown.body && <PostBody body={shown.body} className="text-body-sm leading-relaxed text-muted" />}
        </>
      )}
      {update.imageUrl && (
        <Image src={update.imageUrl} alt="" width={800} height={450} unoptimized className="w-full rounded-card object-cover" />
      )}

      {/* Reaction bar */}
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
              className={`inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-body-sm transition-colors disabled:cursor-default ${
                mine ? 'border-primary bg-primary-bg text-primary-strong' : 'border-border bg-surface text-muted'
              } ${canInteract && anchorId ? 'hover:border-border-strong' : ''}`}
            >
              <span aria-hidden>{r.key}</span>
              {count > 0 && <span className="text-meta font-semibold tabular-nums">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Comments */}
      {comments.length > 0 && (
        <ul className="space-y-2 border-t border-border pt-3">
          {comments.map((c) => (
            <li key={c.id} className="text-body-sm">
              <span className="font-semibold text-text">{c.author?.name ?? 'Member'}</span>{' '}
              <PostBody body={c.body} className="inline text-muted" />
            </li>
          ))}
        </ul>
      )}

      {/* Comment box (followers / operator only) */}
      {canInteract && anchorId && (
        <div className="flex items-start gap-2 pt-1">
          <Textarea
            // Level with the post it sits in — the same rule as the main feed's comment box
            // (components/feed/post-replies.tsx). "In every feed" was the owner's phrasing.
            surface="post"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Write a comment"
            placeholder="Write a comment"
            rows={1}
            maxLength={5000}
          />
          <button
            type="button"
            onClick={submitComment}
            disabled={pending || !draft.trim()}
            aria-label="Post comment"
            className="mt-0.5 inline-flex shrink-0 items-center rounded-control bg-primary p-2 text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      )}
      {error && <p className="text-meta text-danger">{error}</p>}
    </article>
  )
}
