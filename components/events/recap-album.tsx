'use client'

import { useState, useTransition, useRef } from 'react'
import Image from 'next/image'
import { ImagePlus, X, Trash2 } from 'lucide-react'
import { uploadEventMedia, deleteEventMedia } from '@/app/(main)/events/[slug]/social-actions'
import { createClient } from '@/lib/supabase/client'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

export type RecapPhoto = {
  id: string
  imageUrl: string
  caption: string | null
  profileId: string
}

export function RecapAlbum({
  eventId,
  slug,
  photos,
  canUpload,
  canModerate,
  myProfileId,
}: {
  eventId: string
  slug: string
  photos: RecapPhoto[]
  /** Viewer is a host/guest who may add photos. */
  canUpload: boolean
  /** Viewer is the event host — may remove any photo. */
  canModerate: boolean
  myProfileId: string | null
}) {
  const [caption, setCaption] = useState('')
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
    if (!imageFile || pending) return
    startTransition(async () => {
      const imageUrl = await uploadImage()
      if (!imageUrl) return
      await uploadEventMedia(eventId, slug, imageUrl, caption.trim() || null)
      setCaption('')
      clearImage()
      setError('')
    })
  }

  return (
    <section>
      <h2 className="text-sm font-bold text-text mb-3">
        Recap album
        {photos.length > 0 && (
          <span className="ml-2 text-xs font-normal text-subtle">{photos.length}</span>
        )}
      </h2>

      {canUpload && (
        <div className="mb-4 rounded-2xl border border-border bg-surface p-3">
          {imagePreview ? (
            <div className="relative inline-block">
              {/* Local blob preview of the file being uploaded; next/image with
                  `unoptimized` passes the object URL straight through. */}
              <Image
                src={imagePreview}
                alt="Upload preview"
                width={192}
                height={192}
                unoptimized
                className="max-h-48 w-auto rounded-xl border border-border object-cover"
              />
              <button
                type="button"
                onClick={clearImage}
                aria-label="Remove image"
                className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-sm font-medium text-muted transition-colors hover:border-primary-bg hover:text-primary-strong disabled:opacity-40"
            >
              <ImagePlus className="h-4 w-4" />
              Add a photo
            </button>
          )}

          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />

          {imageFile && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption (optional)"
                maxLength={280}
                disabled={pending}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-subtle outline-none focus:border-border-strong disabled:opacity-60"
              />
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="shrink-0 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? 'Adding…' : 'Add photo'}
              </button>
            </div>
          )}
        </div>
      )}

      {photos.length === 0 ? (
        <p className="text-sm text-subtle">No photos yet. Drop in the first one from the day.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((photo) => {
            const canDelete = canModerate || (myProfileId != null && photo.profileId === myProfileId)
            return (
              <li key={photo.id} className="group relative overflow-hidden rounded-xl border border-border bg-surface">
                <Image
                  src={photo.imageUrl}
                  alt={photo.caption ?? 'Recap photo'}
                  width={400}
                  height={400}
                  className="aspect-square w-full object-cover"
                />
                {photo.caption && (
                  <p className="px-2 py-1.5 text-2xs text-muted line-clamp-2">{photo.caption}</p>
                )}
                {canDelete && (
                  <DeleteMediaButton mediaId={photo.id} slug={slug} />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function DeleteMediaButton({ mediaId, slug }: { mediaId: string; slug: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      onClick={() => startTransition(() => deleteEventMedia(mediaId, slug))}
      disabled={pending}
      aria-label="Remove photo"
      className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/80 focus:opacity-100 group-hover:opacity-100 disabled:opacity-40"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
