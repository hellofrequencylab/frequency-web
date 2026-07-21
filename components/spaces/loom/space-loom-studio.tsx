'use client'

// THE SPACE LOOM STUDIO — the full-page image-library manager for one Space (SPACE_MODULES `space.loom`).
// The counterpart to the popup LoomPicker: instead of picking ONE image and closing, an operator browses,
// uploads, searches, filters by tag, and DELETES the Space's own images in place. It reuses the exact
// space-scoped, re-authorized server actions the picker uses (`loomImages` / `uploadLoomImage`) plus the
// Studio-only `deleteSpaceLoomImage`, so read/write audience stays owner/admin/editor — a regular member
// never reaches this surface (the /manage console gates it), they only ever get the popup picker.
//
// Presentational shell; every read/write re-gates server-side. Large photos are shrunk in the browser first
// (shared with the picker) so they clear Vercel's serverless body limit. FAIL-SAFE throughout.

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Upload, Loader2, Search, Trash2, ImageIcon, X } from 'lucide-react'
import { loomImages, uploadLoomImage, deleteSpaceLoomImage } from '@/lib/loom/picker-actions'
import { shrinkImageForUpload, SERVER_MAX_BYTES } from '@/lib/library/image-shrink'
import { looksLikeImage } from '@/lib/library/upload-kinds'
import type { LoomPickAsset } from '@/lib/library/store'

export function SpaceLoomStudio({
  spaceId,
  initialAssets,
  initialTags,
}: {
  spaceId: string
  initialAssets: LoomPickAsset[]
  initialTags: string[]
}) {
  const [assets, setAssets] = useState<LoomPickAsset[]>(initialAssets)
  const [tags, setTags] = useState<string[]>(initialTags)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [loading, startLoad] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(
    (opts: { q: string; tag: string | null }) => {
      startLoad(async () => {
        setError(null)
        const res = await loomImages(spaceId, { q: opts.q || undefined, tag: opts.tag || undefined, kinds: ['image'] })
        setAssets(res.assets)
        setTags(res.tags)
      })
    },
    [spaceId],
  )

  // Reload when the tag filter changes (search has its own debounce below).
  useEffect(() => {
    refresh({ q: query, tag })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag])

  useEffect(() => {
    const t = setTimeout(() => refresh({ q: query, tag }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const doUpload = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => looksLikeImage(f.type, f.name))
      if (images.length === 0) {
        if (files.length > 0) setError('Choose an image file (JPEG, PNG, GIF, WebP, HEIC, AVIF, or SVG).')
        return
      }
      setError(null)
      setUploading(true)
      let threw = false
      let skipped = 0
      try {
        for (const raw of images) {
          const file = await shrinkImageForUpload(raw)
          if (file.size > SERVER_MAX_BYTES) { skipped++; continue }
          const fd = new FormData()
          fd.append('file', file)
          let res: Awaited<ReturnType<typeof uploadLoomImage>>
          try {
            res = await uploadLoomImage(spaceId, fd)
          } catch {
            threw = true
            continue
          }
          if ('error' in res) { setError(res.error); continue }
          setAssets((prev) => [
            { id: res.id, title: file.name, url: res.url, alt: null, kind: 'image', generated: false, tags: [] },
            ...prev.filter((a) => a.id !== res.id),
          ])
        }
      } finally {
        setUploading(false)
      }
      if (skipped > 0) {
        setError(`${skipped} image${skipped === 1 ? ' is' : 's are'} too large to upload (over 4 MB and could not be resized here). Save a smaller version and try again.`)
      } else if (threw) {
        setError('That upload did not go through. Try again in a moment.')
      }
    },
    [spaceId],
  )

  const remove = useCallback(
    async (id: string) => {
      setError(null)
      setPendingDelete(id)
      const res = await deleteSpaceLoomImage(spaceId, id)
      setPendingDelete(null)
      if ('error' in res) { setError(res.error); return }
      setAssets((prev) => prev.filter((a) => a.id !== id))
    },
    [spaceId],
  )

  return (
    <div className="space-y-4">
      {/* Upload box (click-multi + drag & drop) */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void doUpload(Array.from(e.dataTransfer.files)) }}
        className={`flex items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-6 text-sm transition-colors ${dragging ? 'border-primary bg-primary-bg/40 text-primary-strong' : 'border-border text-muted'}`}
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        <span>
          {uploading ? 'Uploading…' : 'Drag images here, or '}
          {!uploading && (
            <button type="button" onClick={() => fileRef.current?.click()} className="font-semibold text-primary-strong underline-offset-2 hover:underline">
              upload images
            </button>
          )}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { void doUpload(Array.from(e.target.files ?? [])); e.target.value = '' }}
        />
      </div>

      {/* Search + tag facets */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this library"
            className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle"
          />
        </div>
        {tag && (
          <button type="button" onClick={() => setTag(null)} className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2.5 py-1 text-xs font-medium text-primary-strong">
            {tag} <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {tags.length > 0 && !tag && (
        <div className="flex flex-wrap gap-1.5">
          {tags.slice(0, 24).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t)}
              className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-primary/50 hover:text-text"
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-2xs text-danger">{error}</p>}

      {/* Grid */}
      {loading ? (
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <ImageIcon className="h-8 w-8 text-subtle" />
          <p className="text-sm text-subtle">{query || tag ? 'No images match.' : 'No images yet. Upload one to get started.'}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {assets.map((a) => (
            <li key={a.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-canvas">
              {/* eslint-disable-next-line @next/next/no-img-element -- Loom asset URL, not a configured next/image domain */}
              <img src={a.url} alt={a.alt ?? a.title} loading="lazy" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(a.id)}
                disabled={pendingDelete === a.id}
                aria-label={`Remove ${a.title}`}
                className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-canvas/90 text-danger opacity-0 shadow-sm transition-opacity hover:bg-canvas focus:opacity-100 group-hover:opacity-100 disabled:opacity-60"
              >
                {pendingDelete === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
