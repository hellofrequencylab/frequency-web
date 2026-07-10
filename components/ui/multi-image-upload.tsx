'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { ImageIcon, Loader2, Plus, X } from 'lucide-react'
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

export function MultiImageUpload({
  value,
  onChange,
  label = 'Gallery',
  hint,
  folder = 'gallery',
  bucket = 'event-media',
  max = 12,
  disabled = false,
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
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()
  const publicUrl = (path: string) => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
  const atMax = value.length >= max

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
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Sign in to upload photos.')
      setBusy(false)
      return
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
      const ext = (file.name.split('.').pop() ?? 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'
      // A random id per file keeps several picked at once collision-free (and keeps this
      // out of the react-hooks/purity rule, which forbids Date.now()/Math.random()).
      const path = `${user.id}/${folder}/${crypto.randomUUID()}.${ext}`
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
        {value.map((path, i) => (
          <div key={path} className="group relative aspect-square overflow-hidden rounded-xl border border-border">
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
            <button
              type="button"
              onClick={() => removeAt(i)}
              disabled={disabled || busy}
              aria-label="Remove image"
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 shadow-sm transition-opacity hover:bg-black/80 focus:opacity-100 group-hover:opacity-100 disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
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
