'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { ImageIcon, Loader2, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LoomPicker } from '@/components/loom/loom-picker'

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

// Mirror the event-media bucket's MIME allowlist (migration 20261105000000) so a
// file the bucket would reject fails HERE with a clear message instead of a raw
// Storage 400. Covers what phones actually shoot (HEIC/HEIF) plus AVIF.
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/heic', 'image/heif', 'image/avif',
])
const ALLOWED_MIME_MESSAGE = 'That file type is not supported. Use a JPEG, PNG, GIF, WebP, HEIC, or AVIF image.'

export function ImageUpload({
  value,
  onChange,
  label = 'Header image',
  hint,
  folder = 'covers',
  bucket = 'event-media',
  mode = 'url',
  disabled = false,
  uploadFn,
  loom = true,
  scopeKey,
  noUrlPaste = false,
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
  /** Optional SERVER-side upload (a gated server action) that returns the public URL. When provided, the
   *  file is uploaded through it instead of the browser Storage client, so the upload never depends on a
   *  live browser session token reaching Storage. Always yields a URL, so it pairs with mode 'url'. */
  uploadFn?: (file: File) => Promise<{ url: string } | { error: string }>
  /** Open the universal Loom picker (browse your Loom + upload multi / drag-drop) instead of a bare file
   *  input. On by default for URL-mode controls (owner directive: every image upload opens the Loom).
   *  Path-mode controls (which store a storage path, not a URL) keep the direct file input. */
  loom?: boolean
  /** Lock the Loom picker to ONE scope ('mine' or a Space id) — the context being edited — so it shows
   *  only that library, not every Space the caller operates. Undefined = the full multi-scope picker. */
  scopeKey?: string
  /** Hide the "or paste an image URL" fallback (url mode). Used where an external URL would be dropped by
   *  a server-side allowlist (e.g. the profile avatar), so the affordance can't silently no-op. */
  noUrlPaste?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  // The Loom picker returns a public URL, so it only applies to URL-mode controls.
  const useLoom = loom && mode === 'url'
  const openSource = () => (useLoom ? setPickerOpen(true) : inputRef.current?.click())

  // What the <img> preview shows. In path mode the stored value is a path, so resolve it.
  const previewSrc =
    value && mode === 'path' ? createClient().storage.from(bucket).getPublicUrl(value).data.publicUrl : value

  async function pick(file: File) {
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.')
      return
    }
    // The direct browser path uploads into the event-media bucket, whose MIME
    // allowlist Storage enforces server-side — reject a type it would bounce
    // with a clear message here instead of a raw "Upload failed: 400". A custom
    // uploadFn targets its own bucket and does its own validation, so it keeps
    // the broad image/* gate above.
    if (!uploadFn && !ALLOWED_MIME.has(file.type)) {
      setError(ALLOWED_MIME_MESSAGE)
      return
    }
    if (file.size > MAX_BYTES) {
      setError(`Image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`)
      return
    }

    setBusy(true)

    // Server-upload path (injected): run the upload as a gated server action, which returns the public
    // URL. This bypasses the browser Storage client entirely, so it cannot fail on a stale/absent browser
    // session token (the Space customize rail uses this).
    if (uploadFn) {
      const res = await uploadFn(file)
      if ('error' in res) {
        setError(`Upload failed: ${res.error}`)
        setBusy(false)
        return
      }
      // Cache-bust so a replace shows immediately.
      onChange(`${res.url}?t=${Date.now()}`)
      setBusy(false)
      return
    }

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
              onClick={openSource}
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
          onClick={openSource}
          disabled={disabled || busy}
          className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {busy ? 'Uploading…' : useLoom ? 'Choose or upload a photo' : 'Upload a photo'}
        </button>
      )}

      {useLoom && (
        <LoomPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(url) => onChange(url)}
          title={`Choose ${label.toLowerCase()}`}
          scopeKey={scopeKey}
        />
      )}

      {mode === 'url' && !noUrlPaste && (
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
