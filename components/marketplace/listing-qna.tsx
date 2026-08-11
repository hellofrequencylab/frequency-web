'use client'

import { useState, useTransition, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ImagePlus, X, Trash2 } from 'lucide-react'
import { postListingComment, deleteListingComment } from '@/lib/marketplace/listing-qna-actions'
import type { ListingCommentTargetKind } from '@/lib/listings-shared/detail-view'
import type { ListingComment } from '@/lib/marketplace/listing-comments'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { prepareImageForUpload } from '@/lib/library/image-shrink'
import { safeUploadPreviewSrc } from '@/lib/safe-image-src'
import { Textarea } from '@/components/ui/field'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB (post-prep; HEIC is converted and big photos shrink first)

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

// The listing Q&A feed: a composer (question + optional photo) above a newest-first thread. Any
// signed-in member may ask; the seller (or staff) can answer in the same box and moderate. Forked
// from the events activity feed, pared to a v1 (no reactions, no dispatches).
export function ListingQna({
  targetKind,
  targetId,
  revalidatePath,
  comments,
  canPost,
  canModerate,
  myProfileId,
  isOwner,
}: {
  targetKind: ListingCommentTargetKind
  targetId: string
  /** The detail-page route to refresh after a write (differs per vertical). */
  revalidatePath: string
  comments: ListingComment[]
  /** Viewer is signed in and may add a comment. */
  canPost: boolean
  /** Viewer may delete any comment on this listing (owner or staff). */
  canModerate: boolean
  myProfileId: string | null
  /** Viewer owns this listing — changes the composer placeholder to an "answer" voice. */
  isOwner: boolean
}) {
  const [body, setBody] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0]
    if (!raw) return
    if (!raw.type.startsWith('image/')) {
      setError('Only image files work here.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    // Prep in the browser first (the shared seam): an iPhone HEIC is converted to JPEG (a raw HEIC
    // previews and stores broken in every browser but Safari), then big photos are downscaled. An
    // unconvertible HEIC gets an inline message; the size gate applies to the CONVERTED file.
    const prepared = await prepareImageForUpload(raw)
    if ('error' in prepared) {
      setError(prepared.error)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    const file = prepared.file
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
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Sign in to add a photo.')
      return null
    }
    // Owner-scoped path prefix (the event-media INSERT policy requires the caller's uid prefix).
    const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${user.id}/listing/${targetId}/${Date.now()}-${safeName}`
    const { error: upErr } = await supabase.storage
      .from('event-media')
      .upload(path, imageFile, { contentType: imageFile.type })
    if (upErr) {
      setError(`Upload failed: ${upErr.message}`)
      return null
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from('event-media').getPublicUrl(path)
    return publicUrl
  }

  function submit() {
    if (pending) return
    const trimmed = body.trim()
    if (!trimmed) return
    startTransition(async () => {
      let imageUrl: string | null = null
      if (imageFile) {
        imageUrl = await uploadImage()
        if (!imageUrl) return
      }
      const res = await postListingComment(targetKind, targetId, revalidatePath, trimmed, imageUrl)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setBody('')
      clearImage()
      setError('')
    })
  }

  const canSubmit = !pending && !!body.trim()

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-body-sm font-bold text-text">
        Questions
        {comments.length > 0 && <span className="ml-2 text-meta font-normal text-subtle">{comments.length}</span>}
      </h2>

      {canPost ? (
        <div className="mb-4 rounded-card border border-border bg-surface p-3">
          <Textarea
            variant="seamless"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
            }}
            placeholder={isOwner ? 'Answer a question or add more detail.' : 'Ask about condition, pickup, availability.'}
            rows={2}
            disabled={pending}
            className="w-full text-body-sm leading-relaxed text-text/90"
          />

          {safeUploadPreviewSrc(imagePreview) && (
            <div className="relative mt-2 inline-block">
              <Image
                src={safeUploadPreviewSrc(imagePreview)!}
                alt="Upload preview"
                width={160}
                height={160}
                unoptimized
                className="max-h-40 w-auto rounded-card border border-border object-cover"
              />
              <button
                type="button"
                onClick={clearImage}
                aria-label="Remove image"
                className="absolute right-1.5 top-1.5 rounded-pill bg-ink/60 p-1 text-on-ink transition-colors hover:bg-ink/80"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {error && <p className="mt-1.5 text-meta text-danger">{error}</p>}

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pickImage(e)} />

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
              aria-label="Attach image"
              className={`inline-flex items-center rounded-control p-1.5 transition-colors disabled:opacity-40 ${
                imageFile ? 'bg-primary-bg text-primary-strong' : 'text-subtle hover:bg-surface-elevated hover:text-muted'
              }`}
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="shrink-0 rounded-control bg-primary px-4 py-1.5 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      ) : (
        <p className="mb-4 text-body-sm text-subtle">Sign in to ask a question.</p>
      )}

      {comments.length === 0 ? (
        <p className="text-body-sm text-subtle">No questions yet. Be the first to ask.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const a = c.author
            const canDelete = canModerate || (myProfileId != null && a?.id === myProfileId)
            return (
              <li key={c.id} className="flex gap-3">
                {a?.avatarUrl ? (
                  <Image
                    src={avatarSrc(a.avatarUrl)}
                    alt={a.displayName}
                    width={32}
                    height={32}
                    unoptimized
                    className="h-8 w-8 shrink-0 rounded-pill object-cover"
                    style={avatarFocusStyle(a.avatarUrl)}
                  />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-primary-bg text-2xs font-bold text-primary-strong select-none">
                    {a ? getInitials(a.displayName) : '?'}
                  </div>
                )}
                <div className="min-w-0 flex-1 rounded-card border border-border bg-surface px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      {a ? (
                        <Link href={`/people/${a.handle}`} className="text-body-sm font-semibold text-text hover:underline">
                          {a.displayName}
                        </Link>
                      ) : (
                        <span className="text-body-sm font-semibold text-text">A member</span>
                      )}
                      <span className="text-2xs text-muted">{timeAgo(c.createdAt)}</span>
                    </div>
                    {canDelete && <DeleteCommentButton commentId={c.id} revalidatePath={revalidatePath} />}
                  </div>
                  {c.body && (
                    <p className="mt-0.5 whitespace-pre-wrap text-body-sm leading-relaxed text-text/90">{c.body}</p>
                  )}
                  {c.imageUrl && (
                    <Image
                      src={c.imageUrl}
                      alt="Shared photo"
                      width={480}
                      height={360}
                      unoptimized
                      className="mt-2 max-h-72 w-auto rounded-card border border-border object-cover"
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

function DeleteCommentButton({ commentId, revalidatePath }: { commentId: string; revalidatePath: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      onClick={() => startTransition(() => deleteListingComment(commentId, revalidatePath))}
      disabled={pending}
      aria-label="Delete comment"
      className="shrink-0 rounded-control p-1 text-subtle transition-colors hover:text-danger disabled:opacity-40"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
