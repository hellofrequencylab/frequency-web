'use client'

// THE SPACE LOOM STUDIO — the full-page image-library manager for one Space (SPACE_MODULES `space.loom`).
// The counterpart to the popup LoomPicker: instead of picking ONE image and closing, an operator browses,
// uploads, searches, filters by tag, EDITS one image's title, alt and tags, and DELETES the Space's own
// images in place. It reuses the exact space-scoped, re-authorized server actions the picker uses
// (`loomImages` / `uploadLoomImage`) plus the Studio-only `deleteSpaceLoomImage`, `updateSpaceLoomImageMeta`
// and `spaceLoomImageUsage` (LIVE-568). The page and those three decide on the Space's `loom` function
// (canManageSpaceLoom, LIVE-566): the switch and min-role bar the Space set in /manage, code default editor.
// The editor shows how many pages place the image beside Remove, and the delete refuses while that count
// is above zero (the admin Studio's guard), so removing a photo never blanks a live page.
// A regular member never reaches this surface; they only ever get the popup picker.
//
// Presentational shell; every read/write re-gates server-side. Large photos are shrunk in the browser first
// (shared with the picker) so they clear Vercel's serverless body limit. FAIL-SAFE throughout.

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Upload, Loader2, Search, Pencil, ImageIcon, X, Lock } from 'lucide-react'
import {
  loomImages,
  uploadLoomImage,
  deleteSpaceLoomImage,
  loomQuotaMeter,
  updateSpaceLoomImageMeta,
  spaceLoomImageUsage,
} from '@/lib/loom/picker-actions'
import { prepareImageForUpload, SERVER_MAX_BYTES } from '@/lib/library/image-shrink'
import { appendImageDescriptor, describeImage } from '@/lib/library/image-describe'
import { SpaceLoomShared } from './space-loom-shared'
import { looksLikeImage } from '@/lib/library/upload-kinds'
import { describeGeneratedAsset } from '@/lib/library/describe-generated'
import { useDescribeOnView } from '@/lib/library/describe-on-view'
import type { LoomPickAsset } from '@/lib/library/store'
import type { LoomMeter } from '@/lib/library/quota'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { ProgressTrack } from '@/components/ui/progress-track'

export function SpaceLoomStudio({
  spaceId,
  initialAssets,
  initialTags,
  initialMeter,
}: {
  spaceId: string
  initialAssets: LoomPickAsset[]
  initialTags: string[]
  /** The storage meter (LIVE-567), read on the server; refreshed after an upload or a remove. */
  initialMeter: LoomMeter
}) {
  const [meter, setMeter] = useState<LoomMeter>(initialMeter)
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
  // The one-image editor (LIVE-568): which card is open, and how many pages place it (null = could not
  // check). `usage` for another id, or none, reads as still checking.
  const [editing, setEditing] = useState<string | null>(null)
  const [usage, setUsage] = useState<{ id: string; pages: number | null } | null>(null)
  const [saving, startSave] = useTransition()

  // Describe on view (LIVE-588, ADR-1590): the importer seeds land in a Space's Loom with no browser
  // in the flow, so no blurhash and no palette. The operator looking at them here is that browser:
  // the first few such rows are decoded from the image already on screen and posted through the one
  // generated-asset path, whose write only ever fills a hole. `blurhash` absent = not read, skipped.
  useDescribeOnView(assets, describeGeneratedAsset)

  // Re-read the meter after the library changes. Best-effort: a failed or refused read keeps the
  // last reading on screen rather than blanking it.
  const refreshMeter = useCallback(async () => {
    try {
      const next = await loomQuotaMeter(spaceId)
      if (next) setMeter(next)
    } catch {
      /* keep the last reading */
    }
  }, [spaceId])

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

  const openEditor = useCallback(
    (id: string) => {
      setError(null)
      setEditing(id)
      spaceLoomImageUsage(spaceId, id)
        .then((res) => setUsage({ id, pages: res.ok ? res.pages : null }))
        .catch(() => setUsage({ id, pages: null }))
    },
    [spaceId],
  )

  const saveMeta = useCallback(
    (id: string, form: FormData) => {
      setError(null)
      startSave(async () => {
        const res = await updateSpaceLoomImageMeta(spaceId, id, {
          title: String(form.get('title') ?? ''),
          alt: String(form.get('alt') ?? ''),
          tags: String(form.get('tags') ?? ''),
        }).catch(() => ({ error: 'That did not save. Try again.' }))
        if ('error' in res) { setError(res.error); return }
        setAssets((prev) =>
          prev.map((a) => (a.id === id ? { ...a, id: res.id, title: res.title ?? a.title, alt: res.alt, tags: res.tags ?? a.tags } : a)),
        )
        setEditing(null)
      })
    },
    [spaceId],
  )

  // The open card, and its page count: undefined while checking, null when the check failed. A failed
  // check never reads as zero (ADR-979); the delete refuses on it too.
  const editingAsset = editing ? assets.find((a) => a.id === editing) ?? null : null
  const placedOn = editingAsset && usage?.id === editingAsset.id ? usage.pages : undefined
  const usageWords =
    placedOn === undefined
      ? 'Checking where it is used…'
      : placedOn === null
        ? 'Could not check where this is used.'
        : placedOn === 0
          ? 'Not on any page yet.'
          : `On ${placedOn} page${placedOn === 1 ? '' : 's'}. Take it off first to remove it.`

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
          // Convert an iPhone HEIC to JPEG + downscale big photos in the browser first (see
          // prepareImageForUpload); an unconvertible HEIC gets an inline message, never a broken upload.
          const prepared = await prepareImageForUpload(raw)
          if ('error' in prepared) { setError(prepared.error); continue }
          const file = prepared.file
          if (file.size > SERVER_MAX_BYTES) { skipped++; continue }
          const fd = new FormData()
          fd.append('file', file)
          // The browser half of ingest — blurhash, palette, true dimensions (PROG-D1). Best-effort.
          appendImageDescriptor(fd, await describeImage(raw))
          let res: Awaited<ReturnType<typeof uploadLoomImage>>
          try {
            res = await uploadLoomImage(spaceId, fd)
          } catch {
            threw = true
            continue
          }
          if ('error' in res) { setError(res.error); continue }
          setAssets((prev) => [
            { id: res.id, title: file.name, url: res.url, alt: null, kind: 'image', generated: false, tags: [], category: null, isProtected: false },
            ...prev.filter((a) => a.id !== res.id),
          ])
        }
      } finally {
        setUploading(false)
        void refreshMeter()
      }
      if (skipped > 0) {
        setError(`${skipped} image${skipped === 1 ? ' is' : 's are'} too large to upload (over 4 MB and could not be resized here). Save a smaller version and try again.`)
      } else if (threw) {
        setError('That upload did not go through. Try again in a moment.')
      }
    },
    [spaceId, refreshMeter],
  )

  const remove = useCallback(
    async (id: string) => {
      setError(null)
      setPendingDelete(id)
      const res = await deleteSpaceLoomImage(spaceId, id)
      setPendingDelete(null)
      if ('error' in res) { setError(res.error); return }
      setAssets((prev) => prev.filter((a) => a.id !== id))
      void refreshMeter()
    },
    [spaceId, refreshMeter],
  )

  return (
    <div className="space-y-4">
      <LoomQuotaMeter meter={meter} />

      {/* Upload box (click-multi + drag & drop) */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void doUpload(Array.from(e.dataTransfer.files)) }}
        className={`flex items-center justify-center gap-2 rounded-card border border-dashed px-4 py-6 text-body-sm transition-colors ${dragging ? 'border-primary bg-primary-bg/40 text-primary-strong' : 'border-border text-muted'}`}
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
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-control border border-border px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-subtle" />
          <Input
            variant="seamless"
            aria-label="Search this library"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this library"
            className="min-w-0 flex-1 text-body-sm text-text"
          />
        </div>
        {tag && (
          <button type="button" onClick={() => setTag(null)} className="inline-flex items-center gap-1 rounded-pill bg-primary-bg px-2.5 py-1 text-meta font-medium text-primary-strong">
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
              className="rounded-pill border border-border bg-surface px-2.5 py-1 text-meta font-medium text-muted transition-colors hover:border-primary/50 hover:text-text"
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* The Frequency shared library (LIVE-569), badged apart; Make it yours drops the copy into the grid below. */}
      <section data-loom-shared aria-label="Frequency library">
        <SpaceLoomShared
          spaceId={spaceId}
          query={query}
          onForked={(copy) => setAssets((prev) => [copy, ...prev.filter((a) => a.id !== copy.id)])}
        />
      </section>

      {error && <p className="text-2xs text-danger">{error}</p>}

      {/* Grid */}
      {loading ? (
        <p className="flex items-center justify-center gap-2 py-16 text-body-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <ImageIcon className="h-8 w-8 text-subtle" />
          <p className="text-body-sm text-subtle">{query || tag ? 'No images match.' : 'No images yet. Upload one to get started.'}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {assets.map((a) => (
            <li key={a.id} className="group relative aspect-square overflow-hidden rounded-card border border-border bg-canvas">
              {/* eslint-disable-next-line @next/next/no-img-element -- Loom asset URL, not a configured next/image domain */}
              <img src={a.url} alt={a.alt ?? a.title} loading="lazy" className="h-full w-full object-cover" />
              {/* A protected image arrives as its proof, a stored 480px copy (LIVE-580). */}
              {a.isProtected && (
                <span data-loom-proof className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-0.5 rounded-pill bg-canvas/90 px-1.5 py-0.5 text-2xs font-semibold text-muted lift-1">
                  <Lock className="h-2.5 w-2.5" aria-hidden /> Protected
                </span>
              )}
              <IconButton
                label={`Edit or remove ${a.title}`}
                variant="bordered"
                onClick={() => openEditor(a.id)}
                className="absolute right-1.5 top-1.5 bg-canvas/90 shadow-sm transition-opacity focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {/* The one-image editor (LIVE-568): title, alt and tags, and Remove with the page count beside it. */}
      {editingAsset && (
        <Dialog open onClose={() => setEditing(null)} ariaLabelledBy="space-loom-edit-title" className="max-w-md">
          <form
            key={editingAsset.id}
            onSubmit={(e) => { e.preventDefault(); saveMeta(editingAsset.id, new FormData(e.currentTarget)) }}
            className="w-full space-y-4 rounded-card border border-border bg-surface p-5 lift-3"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="space-loom-edit-title" className="text-body font-bold text-text">Edit image</h2>
              <IconButton label="Close" onClick={() => setEditing(null)}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- Loom asset URL, not a configured next/image domain */}
            <img src={editingAsset.url} alt="" className="max-h-48 w-full rounded-card bg-canvas object-contain" />
            <Field label="Title">
              <Input name="title" defaultValue={editingAsset.title} required maxLength={200} />
            </Field>
            <Field label="Alt text" hint="Say what the photo shows, for anyone who cannot see it. Your pages use these words.">
              <Textarea name="alt" rows={2} defaultValue={editingAsset.alt ?? ''} maxLength={500} />
            </Field>
            <Field label="Tags" hint="Separate tags with commas.">
              <Input name="tags" defaultValue={editingAsset.tags.join(', ')} />
            </Field>
            {error && <p className="text-2xs text-danger">{error}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Button
                  type="button"
                  variant="dangerOutline"
                  size="sm"
                  onClick={() => void remove(editingAsset.id)}
                  loading={pendingDelete === editingAsset.id}
                  disabled={placedOn !== undefined && placedOn !== null && placedOn > 0}
                >
                  Remove
                </Button>
                <span data-loom-usage className="text-2xs text-muted">{usageWords}</span>
              </div>
              <Button type="submit" size="sm" loading={saving}>Save</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}

/** The storage meter (LIVE-567): what this Loom holds against its cap. Words first, so a failed read
 *  still says something useful and never blocks the page. Same tone ladder as components/ui/meter. */
function LoomQuotaMeter({ meter }: { meter: LoomMeter }) {
  const reading = !meter.read
    ? `Could not read how much this library holds right now.${meter.cap ? ` The limit is ${meter.cap}.` : ''}`
    : meter.cap
      ? `${meter.used} of ${meter.cap} used`
      : `${meter.used} stored. This library has no storage limit.`
  const pct = meter.percent
  const tone = pct === null ? 'primary' : pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'success'
  return (
    <div data-loom-quota className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-meta font-medium text-muted">Library storage</span>
        <span className="text-2xs font-semibold tabular-nums text-text">{reading}</span>
      </div>
      {pct !== null && <ProgressTrack value={pct} max={100} minVisible={2} label={`Library storage: ${reading}`} tone={tone} />}
      {meter.read && meter.unknown > 0 && (
        <p className="text-2xs text-muted">
          {meter.unknown} older {meter.unknown === 1 ? 'image has' : 'images have'} no recorded size, so {meter.unknown === 1 ? 'it is' : 'they are'} not counted here.
        </p>
      )}
    </div>
  )
}
