'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the seed IMAGES panel (Importer v2). Lets an operator upload one or
// more images onto the intake during review. Unlike the member-facing MultiImageUpload (which writes
// through the browser Supabase client under the signer's RLS prefix), this routes every upload through
// the STAFF-GATED server action (uploadSeederImages), so it uses the same structure:write authority as
// the rest of the seeder and files into the shared `library-media` bucket under an intake prefix.
//
// The first image is the PRIMARY (labelled). On Apply the materializer files each staged image into the
// new Space's Loom (space-scoped), so what the operator stages here becomes the claimed Space's own
// assets. Controlled-optimistic: the server action returns the full next list, which is the source of
// truth the grid renders.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { ImageIcon, Loader2, Plus, Star, X } from 'lucide-react'
import { uploadSeederImages, removeSeederImage } from '../actions'

export function SeederImages({ intakeId, initialImages }: { intakeId: string; initialImages: string[] }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<string[]>(initialImages)
  const [error, setError] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()

  function addFiles(files: File[]) {
    setError(null)
    if (!files.length) return
    const form = new FormData()
    for (const f of files) form.append('files', f)
    startBusy(async () => {
      const res = await uploadSeederImages(intakeId, form)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setImages(res.images)
    })
  }

  function remove(url: string) {
    setError(null)
    startBusy(async () => {
      const res = await removeSeederImage(intakeId, url)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setImages(res.images)
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-text">
        <ImageIcon className="h-4 w-4 text-primary-strong" aria-hidden />
        Images
        {images.length > 0 && <span className="font-normal text-muted">· {images.length}</span>}
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Add photos for this Space. The first is the primary image. Every image is filed into the
        Space&rsquo;s Loom, so the owner has them the moment they claim it: on approval for a new seed, or
        right away once the Space is live.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {images.map((url, i) => (
          <div key={url} className="group relative aspect-square overflow-hidden rounded-xl border border-border">
            {/* Unoptimized: seed images come from Supabase Storage, not the configured next/image domains. */}
            <Image src={url} alt="" width={240} height={240} unoptimized className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-2xs font-semibold text-white">
                <Star className="h-3 w-3 fill-current" aria-hidden /> Primary
              </span>
            )}
            <button
              type="button"
              onClick={() => remove(url)}
              disabled={busy}
              aria-label="Remove image"
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 shadow-sm transition-opacity hover:bg-black/80 focus:opacity-100 group-hover:opacity-100 disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-2xs text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Plus className="h-5 w-5" aria-hidden />}
          {busy ? 'Uploading…' : 'Add'}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) addFiles(files)
          e.target.value = ''
        }}
      />

      {error && <p className="mt-2 text-2xs text-danger">{error}</p>}
    </div>
  )
}
