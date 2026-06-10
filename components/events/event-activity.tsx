'use client'

import { useState, useTransition, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ImagePlus, X, Trash2 } from 'lucide-react'
import { createEventPost, deleteEventPost } from '@/app/(main)/events/[slug]/social-actions'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import { blobPreviewSrc } from '@/lib/events/blob-preview'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

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
}) {
  const [body, setBody] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    const trimmed = body.trim()
    if ((!trimmed && !imageFile) || pending) return
    startTransition(async () => {
      let imageUrl: string | null = null
      if (imageFile) {
        imageUrl = await uploadImage()
        if (!imageUrl) return
      }
      await createEventPost(eventId, slug, trimmed, imageUrl)
      setBody('')
      clearImage()
      setError('')
    })
  }

  const canSubmit = (!!body.trim() || !!imageFile) && !pending

  return (
    <section>
      <h2 className="text-sm font-bold text-text mb-3">
        Activity
        {posts.length > 0 && (
          <span className="ml-2 text-xs font-normal text-subtle">{posts.length}</span>
        )}
      </h2>

      {canPost ? (
        <div className="mb-4 rounded-2xl border border-border bg-surface p-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
            }}
            placeholder={isPast ? 'Say thanks, share a moment, tag a friend.' : 'Say hi before the day.'}
            rows={2}
            disabled={pending}
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-text/90 placeholder:text-subtle outline-none disabled:opacity-60"
          />

          {imagePreview && (
            <div className="relative mt-2 inline-block">
              {/* Local blob preview of the file being uploaded — a transient
                  object URL the Next image optimizer can't touch, so a plain
                  <img> is correct here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={blobPreviewSrc(imagePreview)} alt="Upload preview" className="max-h-40 rounded-xl border border-border object-cover" />
              <button
                type="button"
                onClick={clearImage}
                aria-label="Remove image"
                className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
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
              onClick={submit}
              disabled={!canSubmit}
              className="shrink-0 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-subtle">RSVP to join the conversation.</p>
      )}

      {posts.length === 0 ? (
        <p className="text-sm text-subtle">
          {isPast ? 'No notes yet. Leave the first one.' : 'Quiet so far. Be the first to say hi.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => {
            const a = post.author
            const canDelete = canModerate || (myProfileId != null && a?.id === myProfileId)
            return (
              <li key={post.id} className="flex gap-3">
                {a?.avatarUrl ? (
                  <Image src={a.avatarUrl} alt={a.displayName} width={32} height={32} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-bg text-2xs font-bold text-primary-strong select-none">
                    {a ? getInitials(a.displayName) : '?'}
                  </div>
                )}
                <div className="min-w-0 flex-1 rounded-2xl border border-border bg-surface px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      {a ? (
                        <Link href={`/people/${a.handle}`} className="text-sm font-semibold text-text hover:underline">
                          {a.displayName}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-text">A member</span>
                      )}
                      <span className="ml-2 text-2xs text-subtle">{timeAgo(post.createdAt)}</span>
                    </div>
                    {canDelete && (
                      <DeletePostButton postId={post.id} slug={slug} />
                    )}
                  </div>
                  {post.body && (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-text/90">{post.body}</p>
                  )}
                  {post.imageUrl && (
                    <Image
                      src={post.imageUrl}
                      alt="Shared photo"
                      width={480}
                      height={360}
                      className="mt-2 max-h-72 w-auto rounded-xl border border-border object-cover"
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
