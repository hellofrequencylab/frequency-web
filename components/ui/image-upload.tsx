'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { ImageIcon, Loader2, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// One reusable header/cover photo control for every Studio popup editor (Journey, Practice,
// Circle, Event). Uploads the chosen file to a public Supabase Storage bucket under the signer's
// own path prefix (the bucket's RLS gates writes to split_part(name,'/',1) = auth.uid()).
//
// Two value shapes, by `mode`:
//   'url'  (default) — onChange hands back the PUBLIC URL. For columns that store a full URL
//                      (journey cover_image, practice header_image, circle image_url). A
//                      paste-a-URL fallback stays so existing URL covers keep working.
//   'path'          — onChange hands back the STORAGE PATH. For columns that store a path and
//                      resolve it via getPublicUrl at render (event cover_image_path). The
//                      preview resolves the path to a public URL itself; no URL paste.
// Controlled: the parent owns the value + the save.

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB, matching the event-media bucket limit.

export function ImageUpload({
  value,
  onChange,
  label = 'Header image',
  hint,
  folder = 'covers',
  bucket = 'event-media',
  mode = 'url',
  disabled = false,
}: {
  /** A public URL (mode 'url') or a storage path (mode 'path'). */
  value: string | null
  /** Called with the new public URL (mode 'url') or storage path (mode 'path'), or null when cleared. */
  onChange: (value: string | null) => void
  label?: string
  hint?: string
  /** Path segment that groups these uploads, e.g. 'journey-covers'. */
  folder?: string
  /** Public storage bucket to upload into. */
  bucket?: string
  mode?: 'url' | 'path'
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // What the <img> preview shows. In path mode the stored value is a path, so resolve it.
  const previewSrc =
    value && mode === 'path' ? createClient().storage.from(bucket).getPublicUrl(value).data.publicUrl : value

  async function pick(file: File) {
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError(`Image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`)
      return
    }

    setBusy(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Sign in to upload a photo.')
      setBusy(false)
      return
    }

    const ext = (file.name.split('.').pop() ?? 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'
    const path = `${user.id}/${folder}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType: file.type, upsert: true })
    if (upErr) {
      setError(`Upload failed: ${upErr.message}`)
      setBusy(false)
      return
    }

    if (mode === 'path') {
      onChange(path)
    } else {
      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(path)
      // Cache-bust so a replace shows immediately.
      onChange(`${publicUrl}?t=${Date.now()}`)
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
        <ImageIcon className="h-3.5 w-3.5" /> {label}
      </span>

      {previewSrc ? (
        <div className="relative overflow-hidden rounded-xl border border-border">
          {/* Unoptimized: covers come from user-controlled hosts + Supabase Storage, not the
              configured next/image domains. */}
          <Image
            src={previewSrc}
            alt=""
            width={768}
            height={160}
            unoptimized
            className="h-32 w-full object-cover"
          />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || busy}
              className="rounded-lg bg-canvas/90 px-2.5 py-1 text-xs font-medium text-text shadow-sm backdrop-blur transition-colors hover:bg-canvas disabled:opacity-60"
            >
              {busy ? 'Uploading…' : 'Replace'}
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled || busy}
              aria-label="Remove image"
              className="rounded-lg bg-canvas/90 p-1 text-subtle shadow-sm backdrop-blur transition-colors hover:text-danger disabled:opacity-60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {busy ? 'Uploading…' : 'Upload a photo'}
        </button>
      )}

      {mode === 'url' && (
        <input
          type="url"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value.trim() || null)}
          disabled={disabled || busy}
          placeholder="or paste an image URL"
          className="w-full rounded-lg border border-border bg-canvas px-3 py-1.5 text-xs text-text outline-none focus:border-primary placeholder:text-subtle disabled:opacity-60"
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void pick(f)
          e.target.value = ''
        }}
      />

      {hint && <p className="text-2xs text-muted">{hint}</p>}
      {error && <p className="text-2xs text-danger">{error}</p>}
    </div>
  )
}
