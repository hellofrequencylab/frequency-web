'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, ImageIcon, Loader2, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Multi-image sibling of ImageUpload (components/ui/image-upload). Manages an ORDERED
// array of storage PATHS in a public Supabase Storage bucket, under the signer's own
// path prefix (the bucket's RLS gates writes to split_part(name,'/',1) = auth.uid()).
// Used for the event gallery (events.gallery_image_paths). Controlled: the parent owns
// the array + the save; onChange hands back the full next array of paths.
//
// Paths (not URLs), mirroring ImageUpload's mode='path' — the grid resolves each path
// to a public URL via getPublicUrl for its preview.

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB, matching the event-media bucket limit.

// Mirror the event-media bucket's MIME allowlist (migration 20261105000000) so a
// file the bucket would reject fails HERE with a clear message instead of a raw
// Storage 400. Covers what phones actually shoot (HEIC/HEIF) plus AVIF.
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/heic', 'image/heif', 'image/avif',
])
const ALLOWED_MIME_MESSAGE = 'That file type is not supported. Use a JPEG, PNG, GIF, WebP, HEIC, or AVIF image.'

/** A read-only image pinned as the FIRST tile of the grid — the event's key/cover image (e.g. the
 *  original poster), folded into the gallery so the whole set reads as one ordered strip. It lives
 *  OUTSIDE `value` (it may sit in a different bucket, resolved to a URL by the caller), so it never
 *  reorders and never counts against `max`. */
export interface LeadingImage {
  /** An already-resolved public or signed URL. */
  url: string
  /** Badge shown on the tile, e.g. 'Key image'. */
  label: string
  alt?: string
  /** Optional remove handler; omit to render the tile without a remove control. */
  onRemove?: () => void
}

export function MultiImageUpload({
  value,
  onChange,
  label = 'Gallery',
  hint,
  folder = 'gallery',
  bucket = 'event-media',
  max = 12,
  disabled = false,
  upload,
  reorderable = false,
  leading = null,
}: {
  /** Ordered storage paths in `bucket`. */
  value: string[]
  /** Called with the full next array of paths (added, removed, or unchanged). */
  onChange: (value: string[]) => void
  label?: string
  hint?: string
  /** Path segment that groups these uploads, e.g. 'event-gallery'. */
  folder?: string
  /** Public storage bucket to upload into. */
  bucket?: string
  /** Cap on how many images the gallery holds. */
  max?: number
  disabled?: boolean
  /**
   * Optional SERVER upload action. When supplied, each file is uploaded through it (a server
   * action using the admin client) instead of the browser Storage client, and the returned PATH
   * is used. This is how the event gallery avoids the event-media INSERT RLS (writes gated to
   * `split_part(name,'/',1) = auth.uid()`), matching the cover upload. Absent = browser upload
   * under the signer's own uid prefix (the pre-creation new-event form, which owns its uid path).
   */
  upload?: (formData: FormData) => Promise<{ path: string } | { error: string }>
  /** Opt in to drag-and-drop + keyboard reordering of the tiles (persisted via onChange). */
  reorderable?: boolean
  /** A pinned first tile (the key/cover image) folded in ahead of the reorderable gallery. */
  leading?: LeadingImage | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const supabase = createClient()
  const publicUrl = (path: string) => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
  const atMax = value.length >= max

  /** Move the tile at `from` to `to`, clamped, and persist the new order. */
  function move(from: number, to: number) {
    if (to < 0 || to >= value.length || from === to) return
    const next = value.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }

  async function addFiles(files: File[]) {
    setError(null)
    if (!files.length) return

    const room = max - value.length
    if (room <= 0) {
      setError(`You can add up to ${max} images.`)
      return
    }
    const batch = files.slice(0, room)
    if (files.length > room) {
      setError(`Only ${room} more image${room === 1 ? '' : 's'} fit (max ${max}).`)
    }

    setBusy(true)
    // The browser path needs the signer's uid for its owner-scoped storage prefix; the SERVER
    // path (upload action) doesn't — the action derives + gates the path itself.
    let userId: string | null = null
    if (!upload) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('Sign in to upload photos.')
        setBusy(false)
        return
      }
      userId = user.id
    }

    const added: string[] = []
    for (const file of batch) {
      if (!file.type.startsWith('image/')) {
        setError('Choose image files only.')
        continue
      }
      // Reject a type the bucket allowlist would bounce, with a clear message
      // instead of a raw "Upload failed: 400" (this component always uploads
      // straight into the event-media bucket).
      if (!ALLOWED_MIME.has(file.type)) {
        setError(ALLOWED_MIME_MESSAGE)
        continue
      }
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`)
        continue
      }

      // SERVER upload (admin client, bypasses the bucket INSERT RLS) — the event gallery path.
      if (upload) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await upload(fd)
        if ('error' in res) {
          setError(`Upload failed: ${res.error}`)
          continue
        }
        added.push(res.path)
        continue
      }

      // BROWSER upload under the signer's own uid prefix (owner-scoped RLS).
      const ext = (file.name.split('.').pop() ?? 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'
      // A random id per file keeps several picked at once collision-free (and keeps this
      // out of the react-hooks/purity rule, which forbids Date.now()/Math.random()).
      const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: file.type, upsert: true })
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`)
        continue
      }
      added.push(path)
    }

    if (added.length) onChange([...value, ...added])
    setBusy(false)
  }

  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
        <ImageIcon className="h-3.5 w-3.5" /> {label}
        {value.length > 0 && <span className="font-normal text-muted">· {value.length}</span>}
      </span>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {/* The pinned key/cover image (e.g. the original poster), folded in as the first tile. It
            sits outside `value`, so it never drags and never counts toward `max`. */}
        {leading && (
          <div className="group relative aspect-square overflow-hidden rounded-xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={leading.url} alt={leading.alt ?? ''} className="h-full w-full object-cover" />
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-white">
              {leading.label}
            </span>
            {leading.onRemove && (
              <button
                type="button"
                onClick={leading.onRemove}
                disabled={disabled || busy}
                aria-label={`Remove ${leading.label}`}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 shadow-sm transition-opacity hover:bg-black/80 focus:opacity-100 group-hover:opacity-100 disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {value.map((path, i) => (
          <div
            key={path}
            draggable={reorderable && !disabled && !busy}
            onDragStart={reorderable ? () => setDragIndex(i) : undefined}
            onDragEnd={reorderable ? () => setDragIndex(null) : undefined}
            onDragOver={reorderable ? (e) => e.preventDefault() : undefined}
            onDrop={
              reorderable
                ? (e) => {
                    e.preventDefault()
                    if (dragIndex !== null) move(dragIndex, i)
                    setDragIndex(null)
                  }
                : undefined
            }
            className={`group relative aspect-square overflow-hidden rounded-xl border border-border ${
              reorderable && !disabled && !busy ? 'cursor-grab active:cursor-grabbing' : ''
            } ${dragIndex === i ? 'opacity-50' : ''}`}
          >
            {/* Unoptimized: gallery images come from Supabase Storage, not the configured
                next/image domains (same as ImageUpload's preview). */}
            <Image
              src={publicUrl(path)}
              alt=""
              width={240}
              height={240}
              unoptimized
              className="h-full w-full object-cover"
            />
            {/* The first gallery photo IS the header/cover, so mark it plainly. */}
            {reorderable && !leading && i === 0 && (
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-white">
                Header
              </span>
            )}
            <button
              type="button"
              onClick={() => removeAt(i)}
              disabled={disabled || busy}
              aria-label="Remove image"
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 shadow-sm transition-opacity hover:bg-black/80 focus:opacity-100 group-hover:opacity-100 disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {/* Keyboard + click fallback for reordering (drag needs a pointer). */}
            {reorderable && value.length > 1 && (
              <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => move(i, i - 1)}
                  disabled={disabled || busy || i === 0}
                  aria-label="Move earlier"
                  className="rounded-full bg-black/60 p-1 text-white shadow-sm transition-colors hover:bg-black/80 disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={disabled || busy || i === value.length - 1}
                  aria-label="Move later"
                  className="rounded-full bg-black/60 p-1 text-white shadow-sm transition-colors hover:bg-black/80 disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}

        {!atMax && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-2xs text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            {busy ? 'Uploading…' : 'Add'}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) void addFiles(files)
          e.target.value = ''
        }}
      />

      {hint && <p className="text-2xs text-muted">{hint}</p>}
      {error && <p className="text-2xs text-danger">{error}</p>}
    </div>
  )
}
