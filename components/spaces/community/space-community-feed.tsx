'use client'

import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ImagePlus, Loader2, MessageCircle, Pin, Send, X } from 'lucide-react'
import { REACTIONS, reactionLabel } from '@/lib/feed/reactions'
import {
  createSpaceUpdate,
  createMemberPost,
  reactToSpaceUpdate,
  commentOnSpaceUpdate,
  setCommunityMemberPosts,
  removeCommunityPost,
  uploadCommunityImage,
  pinCommunityPost,
} from '@/lib/spaces/content-actions'
import { FollowSpaceButton } from '@/components/spaces/follow-space-button'
import { ToggleRow } from '@/components/entity-blocks/controls/field-controls'
import { isError } from '@/lib/action-result'
import type { SpaceCommunityPost, SpaceUpdateComment, SpaceUpdateReactions } from '@/lib/spaces/content-data'

// THE COMMUNITY FEED (business Community tab). Facebook/Yelp-style: the business posts Updates, FOLLOWERS
// may also post (when the business allows it), and members react + comment. PUBLIC read; only followers (or
// the operator) may interact, enforced server-side. Semantic DAWN tokens only, voice canon (no em dashes).

const inputCls =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-primary'

/** A photo attach control for a composer: uploads through the gated community-image action and returns the
 *  public URL, with a preview + remove. */
function PhotoField({ slug, value, onChange }: { slug: string; value: string | null; onChange: (url: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File) => {
    setBusy(true)
    setError(null)
    if (file.size > 9 * 1024 * 1024) {
      setError('Image must be under 9MB.')
      setBusy(false)
      return
    }
    const fd = new FormData()
    fd.append('file', file)
    const res = await uploadCommunityImage(slug, fd)
    if ('error' in res) setError(res.error)
    else onChange(res.url)
    setBusy(false)
  }

  return (
    <div className="space-y-1">
      {value ? (
        <div className="relative w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element -- freshly uploaded URL, previewed inline */}
          <img src={value} alt="" className="max-h-40 rounded-lg object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remove image"
            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-2xs font-semibold text-primary-strong hover:underline disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden />}
          {busy ? 'Uploading' : 'Add photo'}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void upload(f)
          e.target.value = ''
        }}
      />
      {error && <p className="text-2xs text-danger">{error}</p>}
    </div>
  )
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
          <BrandComposer slug={slug} />
        </>
      )}
      {canMemberPost && <MemberComposer slug={slug} />}

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
    <div className="rounded-2xl border border-border bg-surface-elevated/50 px-4 py-2">
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

/** The operator's brand-post composer: a title + body, posted immediately as a published Update. */
function BrandComposer({ slug }: { slug: string }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const empty = !title.trim() && !body.trim() && !image

  const post = () => {
    setError(null)
    if (empty) return
    start(async () => {
      const res = await createSpaceUpdate(slug, { title, body, imageUrl: image })
      if (isError(res)) setError(res.error)
      else {
        setTitle('')
        setBody('')
        setImage(null)
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
      <PhotoField slug={slug} value={image} onChange={setImage} />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={post}
          disabled={pending || empty}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          Post
        </button>
      </div>
    </div>
  )
}

/** A follower's post composer: a single body, posted to the Community feed as a member post. */
function MemberComposer({ slug }: { slug: string }) {
  const [body, setBody] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const empty = !body.trim() && !image

  const post = () => {
    setError(null)
    if (empty) return
    start(async () => {
      const res = await createMemberPost(slug, body, image)
      if (isError(res)) setError(res.error)
      else {
        setBody('')
        setImage(null)
      }
    })
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share something with this community"
        rows={2}
        maxLength={20000}
        className={inputCls}
      />
      <PhotoField slug={slug} value={image} onChange={setImage} />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={post}
          disabled={pending || empty}
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
          ? `Follow ${brandName} to react, comment, and post.`
          : 'Sign in and follow this space to react, comment, and post.'}
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
  post,
  canInteract,
}: {
  slug: string
  brandName: string
  viewerId: string | null
  canModerate: boolean
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

  // A member post can be removed by an operator (moderation) or by its own author.
  const canRemove = post.kind === 'member' && (canModerate || (!!post.authorId && post.authorId === viewerId))
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

  if (removed) return null

  return (
    <article
      className={`space-y-3 rounded-2xl border bg-surface p-4 shadow-sm ${pinned ? 'border-primary/50' : 'border-border'}`}
    >
      <header className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          {pinned && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary-bg px-1.5 py-0.5 text-2xs font-bold text-primary-strong">
              <Pin className="h-3 w-3" aria-hidden /> Pinned
            </span>
          )}
          <span className="text-xs font-semibold uppercase tracking-wide text-subtle">{authorLabel}</span>
        </span>
        <span className="flex items-center gap-2">
          {canModerate && anchorId && (
            <button
              type="button"
              onClick={togglePin}
              disabled={pending}
              className="text-2xs font-semibold text-subtle hover:text-primary-strong disabled:opacity-60"
            >
              {pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="text-2xs font-semibold text-subtle hover:text-danger disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </span>
      </header>
      {update.title && <h3 className="text-lg font-bold text-text">{update.title}</h3>}
      {update.body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{update.body}</p>}
      {update.imageUrl && (
        <Image src={update.imageUrl} alt="" width={800} height={450} unoptimized className="w-full rounded-xl object-cover" />
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
