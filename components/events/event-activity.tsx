'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ImagePlus, X, Trash2, Film, Radio, Smile, Check } from 'lucide-react'
import { createEventPost, deleteEventPost, postEventDispatch } from '@/app/(main)/events/[slug]/social-actions'
import { getEventPostReactions, toggleEventPostReaction } from '@/lib/events/reactions'
import type { BoopKind, PostReactions } from '@/lib/events/reactions'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

// Boops — the Partiful-style reaction set (EVENTS-DESIGN §2.2/§8). A small set of
// real faces a guest taps on a post. Now PERSISTED: the bar shows real aggregate
// counts (lib/events/reactions.ts + event_post_reactions) and the viewer's own
// booped faces — real numbers only, never a fabricated tally (Law 1: a number is
// real or it's absent). This array MUST stay in lockstep with the server-side
// BOOP_KINDS in lib/events/reactions.ts (a `'use server'` module can only export
// async functions, so the set can't be shared as a value — only these faces are
// accepted server-side).
const BOOPS: readonly BoopKind[] = ['👋', '🔥', '🎉', '❤️', '😂']

export type ActivityPost = {
  id: string
  body: string
  imageUrl: string | null
  createdAt: string
  author: {
    id: string
    displayName: string
    handle: string
    avatarUrl: string | null
  } | null
  /** Host-authored Event Dispatch (ADR-255) → renders with an event badge so it
   *  reads as "a Dispatch with an event badge," not a plain comment. */
  isDispatch?: boolean
  /** Optional title on a Dispatch update. */
  title?: string | null
  /** 'rsvp' = a system "<Name> RSVP'd" entry (body carries the member's optional
   *  note). Anything else / undefined = an ordinary guest comment. */
  kind?: 'comment' | 'rsvp'
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function EventActivity({
  eventId,
  slug,
  posts,
  canPost,
  canModerate,
  myProfileId,
  isPast,
  canDispatch = false,
}: {
  eventId: string
  slug: string
  posts: ActivityPost[]
  /** Viewer is a host/guest who may add a comment. */
  canPost: boolean
  /** Viewer is the event host — may delete any comment. */
  canModerate: boolean
  myProfileId: string | null
  /** The event has already happened (changes the placeholder copy). */
  isPast: boolean
  /** Viewer is the host/cohost: the ONE composer adds a "Send as a Dispatch" toggle that turns a
   *  plain thread comment into an event announcement (with an optional title). Off → a regular
   *  comment, the same box everyone uses. */
  canDispatch?: boolean
}) {
  const [body, setBody] = useState('')
  // Host-only: when on, this update posts as an event announcement (Dispatch) with an optional
  // title instead of a plain thread comment. Off (and for everyone else) it's a regular comment.
  const [asDispatch, setAsDispatch] = useState(false)
  const [title, setTitle] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [gifUrl, setGifUrl] = useState<string | null>(null)
  const [showGifInput, setShowGifInput] = useState(false)
  const [gifDraft, setGifDraft] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Real Boop counts per post (event_post_reactions). Only comment posts carry
  // reactions — Dispatch entries are event_dispatches rows (id `dispatch:…`), not
  // event_posts, so they have nothing to react to. Loaded once on mount + after a
  // post is added; the BoopBar updates its own post in place when you toggle, so we
  // never refetch the whole set on a single tap.
  const [reactions, setReactions] = useState<Record<string, PostReactions>>({})

  const commentPostIds = posts.filter((p) => !p.isDispatch).map((p) => p.id)
  // Stable key so the effect only refetches when the actual set of post ids changes.
  const commentPostIdsKey = commentPostIds.join(',')

  useEffect(() => {
    const ids = commentPostIdsKey ? commentPostIdsKey.split(',') : []
    if (ids.length === 0) return
    let active = true
    // Fetch happens off the render path; state is only set in the async resolve, so
    // this never triggers a synchronous cascading render. Stale entries for posts
    // that disappeared are harmless — the render only reads the visible posts' keys.
    getEventPostReactions(eventId, ids)
      .then((map) => {
        if (active) setReactions(map)
      })
      .catch(() => {
        // A reactions read miss just leaves the bars in their unbooped state.
      })
    return () => {
      active = false
    }
  }, [eventId, commentPostIdsKey])

  // Replace one post's reactions with the fresh, server-returned state after a toggle.
  function applyReactions(postId: string, next: PostReactions) {
    setReactions((prev) => ({ ...prev, [postId]: next }))
  }

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Only image files work here.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Keep it under 10 MB.`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setError('')
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // A GIF is just an image URL — it persists via the same image_url path. We accept
  // a direct GIF link (the lightweight picker) and clear any uploaded file so the
  // two image sources never collide.
  function applyGif() {
    const url = gifDraft.trim()
    if (!/^https:\/\/.+\.(gif|webp)(\?.*)?$/i.test(url)) {
      setError('Paste a direct GIF link (it should end in .gif).')
      return
    }
    clearImage()
    setGifUrl(url)
    setGifDraft('')
    setShowGifInput(false)
    setError('')
  }

  function clearGif() {
    setGifUrl(null)
  }

  async function uploadImage(): Promise<string | null> {
    if (!imageFile) return null
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Sign in to add a photo.')
      return null
    }
    const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${user.id}/${eventId}/${Date.now()}-${safeName}`
    const { error: upErr } = await supabase.storage
      .from('event-media')
      .upload(path, imageFile, { contentType: imageFile.type })
    if (upErr) {
      setError(`Upload failed: ${upErr.message}`)
      return null
    }
    const { data: { publicUrl } } = supabase.storage.from('event-media').getPublicUrl(path)
    return publicUrl
  }

  function submit() {
    if (pending) return
    const trimmed = body.trim()
    // A Dispatch is text + optional title (no image); a comment can be text and/or an image.
    if (asDispatch ? !trimmed : !trimmed && !imageFile && !gifUrl) return
    startTransition(async () => {
      // Host chose "Send as a Dispatch" → an event announcement (title optional), not a comment.
      if (canDispatch && asDispatch) {
        const res = await postEventDispatch(eventId, slug, {
          title: title.trim() || null,
          body: trimmed,
          toDispatch: true,
        })
        if ('error' in res) {
          setError(res.error)
          return
        }
        setBody('')
        setTitle('')
        setAsDispatch(false)
        clearImage()
        clearGif()
        setError('')
        return
      }
      // Default for everyone (host or guest): a regular thread comment.
      let imageUrl: string | null = gifUrl
      if (imageFile) {
        imageUrl = await uploadImage()
        if (!imageUrl) return
      }
      const res = await createEventPost(eventId, slug, trimmed, imageUrl)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setBody('')
      clearImage()
      clearGif()
      setError('')
    })
  }

  const canSubmit =
    !pending && (asDispatch ? !!body.trim() : !!body.trim() || !!imageFile || !!gifUrl)

  return (
    <section>
      <h2 className="text-sm font-bold text-text mb-3">
        Activity
        {posts.length > 0 && (
          <span className="ml-2 text-xs font-normal text-subtle">{posts.length}</span>
        )}
      </h2>

      {/* ONE composer above the stream, the same box for everyone. A host/cohost (canDispatch)
          gets a "Send as a Dispatch" toggle that turns the post into an event announcement with
          an optional title; off, and for every other guest, it's a plain thread comment. */}
      {canPost ? (
        <div className="mb-4 rounded-2xl border border-border bg-surface p-3">
          {/* Title — only for a Dispatch (an announcement may carry a headline). */}
          {canDispatch && asDispatch && (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              disabled={pending}
              className="mb-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-subtle focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 disabled:opacity-60"
            />
          )}

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
            }}
            placeholder={
              asDispatch
                ? 'What should guests know? Parking, a time change, what to bring.'
                : isPast
                  ? 'Say thanks, share a moment, tag a friend.'
                  : 'Say hi before the event.'
            }
            rows={2}
            disabled={pending}
            className="w-full resize-none bg-transparent text-sm leading-relaxed text-text/90 placeholder:text-subtle outline-none disabled:opacity-60"
          />

          {!asDispatch && (imagePreview || gifUrl) && (
            <div className="relative mt-2 inline-block">
              {/* Local blob preview of the file being uploaded, or the chosen GIF;
                  next/image with `unoptimized` passes object URLs / GIFs straight
                  through (no optimization of animated frames). */}
              <Image
                src={imagePreview ?? gifUrl!}
                alt={gifUrl ? 'GIF preview' : 'Upload preview'}
                width={160}
                height={160}
                unoptimized
                className="max-h-40 w-auto rounded-xl border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => (gifUrl ? clearGif() : clearImage())}
                aria-label={gifUrl ? 'Remove GIF' : 'Remove image'}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {!asDispatch && showGifInput && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="url"
                value={gifDraft}
                onChange={(e) => setGifDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyGif()
                }}
                placeholder="Paste a GIF link"
                disabled={pending}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-text outline-none placeholder:text-subtle focus:border-border-strong focus:ring-2 focus:ring-border-strong/30"
              />
              <button
                type="button"
                onClick={applyGif}
                disabled={pending}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-40"
              >
                Add
              </button>
            </div>
          )}

          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
            <div className="flex items-center gap-1">
              {/* Image + GIF — for a comment only; a Dispatch is a text announcement. */}
              {!asDispatch && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={pending}
                    aria-label="Attach image"
                    className={`inline-flex items-center rounded-lg p-1.5 transition-colors disabled:opacity-40 ${
                      imageFile ? 'bg-primary-bg text-primary-strong' : 'text-subtle hover:bg-surface-elevated hover:text-muted'
                    }`}
                  >
                    <ImagePlus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGifInput((v) => !v)}
                    disabled={pending}
                    aria-label="Add a GIF"
                    className={`inline-flex items-center rounded-lg p-1.5 transition-colors disabled:opacity-40 ${
                      gifUrl || showGifInput
                        ? 'bg-primary-bg text-primary-strong'
                        : 'text-subtle hover:bg-surface-elevated hover:text-muted'
                    }`}
                  >
                    <Film className="h-4 w-4" />
                  </button>
                </>
              )}
              {/* Host/cohost: turn this post into an event announcement (Dispatch). Turning it on
                  clears any attached image — an announcement is text + an optional title. */}
              {canDispatch && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !asDispatch
                    setAsDispatch(next)
                    if (next) {
                      clearImage()
                      clearGif()
                      setShowGifInput(false)
                    }
                  }}
                  disabled={pending}
                  aria-pressed={asDispatch}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-2xs font-medium transition-colors disabled:opacity-50 ${
                    asDispatch
                      ? 'bg-primary-bg text-primary-strong'
                      : 'text-subtle hover:bg-surface-elevated hover:text-muted'
                  }`}
                >
                  <Radio className="h-3.5 w-3.5" />
                  Send as a Dispatch
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="shrink-0 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? 'Posting…' : asDispatch ? 'Send Dispatch' : 'Post'}
            </button>
          </div>

          {asDispatch && (
            <p className="mt-2 text-2xs text-subtle">
              Sends as an event announcement. Guests who RSVP&rsquo;d get it in their Dispatches,
              unless they muted this event.
            </p>
          )}
        </div>
      ) : (
        // canContribute is false only for a signed-out visitor now (any signed-in
        // member may comment; the old RSVP requirement was dropped).
        <p className="mb-4 text-sm text-subtle">Sign in to join the conversation.</p>
      )}

      {posts.length === 0 ? (
        <p className="text-sm text-subtle">
          {isPast ? 'No notes yet. Leave the first one.' : 'Quiet so far. Be the first to say hi.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => {
            const a = post.author
            // A system "RSVP'd" entry reads as an activity line (name + a going badge),
            // not a comment — no image, no boops.
            const isRsvp = post.kind === 'rsvp'
            // Dispatch entries are event_dispatches rows, not event_posts, so the
            // event_posts delete action doesn't apply — no trash on them here.
            const canDelete =
              !post.isDispatch && (canModerate || (myProfileId != null && a?.id === myProfileId))
            return (
              <li key={post.id} className="flex gap-3">
                {a?.avatarUrl ? (
                  <Image src={a.avatarUrl} alt={a.displayName} width={32} height={32} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-bg text-2xs font-bold text-primary-strong select-none">
                    {a ? getInitials(a.displayName) : '?'}
                  </div>
                )}
                <div
                  className={`min-w-0 flex-1 rounded-2xl border px-3 py-2 ${
                    post.isDispatch ? 'border-primary-bg bg-primary-bg/20' : 'border-border bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      {a ? (
                        <Link href={`/people/${a.handle}`} className="text-sm font-semibold text-text hover:underline">
                          {a.displayName}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-text">A member</span>
                      )}
                      {post.isDispatch && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2 py-0.5 text-3xs font-semibold text-primary-strong">
                          <Radio className="h-3 w-3" />
                          Event Dispatch
                        </span>
                      )}
                      {isRsvp && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-3xs font-semibold text-success">
                          <Check className="h-3 w-3" />
                          RSVP&rsquo;d
                        </span>
                      )}
                      <span className="text-2xs text-subtle">{timeAgo(post.createdAt)}</span>
                    </div>
                    {canDelete && (
                      <DeletePostButton postId={post.id} slug={slug} />
                    )}
                  </div>
                  {post.isDispatch && post.title && (
                    <p className="mt-0.5 text-sm font-bold text-text">{post.title}</p>
                  )}
                  {post.body && (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-text/90">{post.body}</p>
                  )}
                  {post.imageUrl && !isRsvp && (
                    <Image
                      src={post.imageUrl}
                      alt="Shared photo"
                      width={480}
                      height={360}
                      unoptimized
                      className="mt-2 max-h-72 w-auto rounded-xl border border-border object-cover"
                    />
                  )}
                  {/* Boops — tap a face to react. Real persisted counts; only on
                      comment posts (Dispatch + RSVP entries have no reaction row).
                      Disabled (with a sign-in nudge on hover) for signed-out viewers. */}
                  {!post.isDispatch && !isRsvp && (
                    <BoopBar
                      postId={post.id}
                      reactions={reactions[post.id]}
                      onToggled={applyReactions}
                      disabled={!myProfileId}
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// A small reaction bar per post. Shows REAL persisted counts (event_post_reactions
// via lib/events/reactions.ts) plus which faces the viewer booped, and toggles them
// through the server. Real numbers only: a face with zero reactions is simply
// absent, never shown as "0" (Law 1: a number is real or it's absent).
function BoopBar({
  postId,
  reactions,
  onToggled,
  disabled,
}: {
  postId: string
  reactions: PostReactions | undefined
  onToggled: (postId: string, next: PostReactions) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const counts = reactions?.counts ?? {}
  const mine = reactions?.mine ?? []
  // The faces that actually have at least one boop, in the canonical set order.
  const reacted = BOOPS.filter((k) => (counts[k] ?? 0) > 0)
  const hasAny = reacted.length > 0

  function toggle(kind: BoopKind) {
    if (disabled || pending) return
    setOpen(false)
    startTransition(async () => {
      const res = await toggleEventPostReaction(postId, kind)
      if (res.ok) onToggled(postId, res.reactions)
    })
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {/* Existing reactions — one chip per face that has real boops. The chip the
          viewer booped is highlighted; tapping it un-boops. */}
      {reacted.map((kind) => {
        const isMine = mine.includes(kind)
        return (
          <button
            key={kind}
            type="button"
            onClick={() => toggle(kind)}
            disabled={disabled || pending}
            aria-pressed={isMine}
            aria-label={isMine ? `Remove your ${kind} boop` : `Boop with ${kind}`}
            title={disabled ? 'Sign in to boop' : undefined}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              isMine
                ? 'border-primary bg-primary-bg text-primary-strong hover:bg-primary-bg/70'
                : 'border-border text-muted hover:border-border-strong hover:text-text'
            }`}
          >
            <span className="text-sm leading-none">{kind}</span>
            {counts[kind]}
          </button>
        )
      })}

      {/* Add-a-boop: the face picker, or the trigger when closed. */}
      {open ? (
        <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface px-1 py-0.5">
          {BOOPS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => toggle(kind)}
              disabled={disabled || pending}
              aria-label={`Boop with ${kind}`}
              className="rounded-full px-1.5 py-0.5 text-base leading-none transition-transform hover:scale-125 disabled:opacity-50"
            >
              {kind}
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled || pending}
          title={disabled ? 'Sign in to boop' : undefined}
          aria-label="Add a boop"
          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-2xs font-medium text-subtle transition-colors hover:border-border-strong hover:text-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Smile className="h-3.5 w-3.5" />
          {hasAny ? '' : 'Boop'}
        </button>
      )}
    </div>
  )
}

function DeletePostButton({ postId, slug }: { postId: string; slug: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      onClick={() => startTransition(() => deleteEventPost(postId, slug))}
      disabled={pending}
      aria-label="Delete comment"
      className="shrink-0 rounded-lg p-1 text-subtle transition-colors hover:text-danger disabled:opacity-40"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
