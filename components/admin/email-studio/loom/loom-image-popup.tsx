'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Check, Crop, ImagePlus, Loader2, Search, Trash2, Upload } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { ImageCropper } from '@/components/ui/image-cropper'
import {
  listEmailLoomImages,
  uploadEmailLoomImage,
  type LoomImagePick,
} from '@/lib/email-studio/loom-actions'

// THE LOOM PHOTO POPUP (Email Studio canvas, Slice B). Clicking an image slot on the WYSIWYG email canvas
// opens this dialog to manage the slot's photo through Loom (the media library): PICK an existing image from
// the shared Loom, BULK UPLOAD new files into it, write ALT text, and CROP (a baked, full-resolution crop,
// since email clients cannot crop on their own). Every image resolves to a plain public URL, so a picked
// asset and an uploaded/cropped asset are interchangeable — the block just stores that URL plus a sibling
// alt string. Writes are gated + scoped server-side (lib/email-studio/loom-actions: writerGate + the root
// Loom). App-chrome tokens only (this is admin UI, not the email body), no hex; voice canon (no em dashes).

export function LoomImagePopup({
  open,
  currentUrl,
  currentAlt,
  onClose,
  onSelect,
}: {
  open: boolean
  /** The slot's current image URL (highlighted + pre-selected), or '' when empty. */
  currentUrl: string
  /** The slot's current alt text. */
  currentAlt: string
  onClose: () => void
  /** Commit the chosen photo: the URL (empty string clears the slot) and its alt text. */
  onSelect: (url: string, alt: string) => void
}) {
  const [images, setImages] = useState<LoomImagePick[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedUrl, setSelectedUrl] = useState(currentUrl)
  const [alt, setAlt] = useState(currentAlt)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)
  const [, startTransition] = useTransition()
  const reqRef = useRef(0)

  // Reset the working state the moment the dialog opens onto a slot. Done during render (the canonical
  // "adjust state on a prop change" pattern) rather than in an effect, so there is no cascading re-render.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setSelectedUrl(currentUrl)
      setAlt(currentAlt)
      setError(null)
      setCropSrc(null)
    }
  }

  // Load the library (debounced on the search query). A newer request always wins. The loading flag flips
  // inside the timer callback (not synchronously in the effect body) so the effect only schedules work.
  useEffect(() => {
    if (!open) return
    const req = ++reqRef.current
    const t = setTimeout(() => {
      setLoading(true)
      void listEmailLoomImages(query.trim() || undefined)
        .then((rows) => {
          if (req === reqRef.current) setImages(rows)
        })
        .catch(() => {
          if (req === reqRef.current) setImages([])
        })
        .finally(() => {
          if (req === reqRef.current) setLoading(false)
        })
    }, 250)
    return () => clearTimeout(t)
  }, [open, query])

  const refresh = useCallback(async () => {
    const rows = await listEmailLoomImages(query.trim() || undefined).catch(() => [])
    setImages(rows)
  }, [query])

  // Upload one file into Loom; on success select it and fold it into the grid. Shared by the bulk file
  // input and the cropper's output.
  const uploadFile = useCallback(
    async (file: File): Promise<boolean> => {
      const fd = new FormData()
      fd.append('file', file)
      const res = await uploadEmailLoomImage(fd)
      if ('error' in res) {
        setError(res.error)
        return false
      }
      setError(null)
      setSelectedUrl(res.url)
      setImages((prev) => [{ id: res.id, title: file.name, url: res.url, alt: null }, ...prev])
      return true
    },
    [],
  )

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      setUploading(true)
      setError(null)
      // Sequential so the grid grows in a stable order and errors surface one at a time.
      for (const file of Array.from(files)) {
        await uploadFile(file)
      }
      setUploading(false)
    },
    [uploadFile],
  )

  const onCropped = useCallback(
    (file: File) => {
      setCropSrc(null)
      setUploading(true)
      startTransition(async () => {
        await uploadFile(file)
        setUploading(false)
        void refresh()
      })
    },
    [uploadFile, refresh],
  )

  const commit = () => {
    onSelect(selectedUrl.trim(), alt.trim())
    onClose()
  }
  const clear = () => {
    onSelect('', '')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} ariaLabel="Choose a photo" className="max-w-3xl">
      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-text">Choose a photo</h2>
            <p className="text-xs text-muted">Pick from your Loom library, upload new photos, or crop one to fit.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            Close
          </button>
        </header>

        {cropSrc ? (
          // CROP mode — the cropper takes over the body; applying uploads the baked crop as a new Loom asset.
          <div className="p-5">
            <ImageCropper
              src={cropSrc}
              fileName="email-photo"
              onCancel={() => setCropSrc(null)}
              onCropped={onCropped}
            />
          </div>
        ) : (
          <div className="grid gap-0 sm:grid-cols-[minmax(0,1fr)_260px]">
            {/* LEFT — search + the library grid + bulk upload. */}
            <div className="min-w-0 space-y-3 p-5">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search your photos"
                    className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none"
                  />
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-text">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => {
                      void onFiles(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>

              {error && (
                <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs font-medium text-danger" role="alert">
                  {error}
                </p>
              )}

              <div className="min-h-[220px]">
                {loading ? (
                  <div className="flex min-h-[220px] items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-subtle" aria-hidden />
                  </div>
                ) : images.length === 0 ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center">
                    <ImagePlus className="h-6 w-6 text-subtle" aria-hidden />
                    <p className="text-sm text-muted">No photos yet. Upload one to get started.</p>
                  </div>
                ) : (
                  <ul className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                    {images.map((img) => {
                      const on = img.url === selectedUrl
                      return (
                        <li key={img.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUrl(img.url)
                              if (img.alt) setAlt(img.alt)
                            }}
                            aria-pressed={on}
                            className={`relative block aspect-square w-full overflow-hidden rounded-lg border-2 transition-colors ${
                              on ? 'border-primary' : 'border-transparent hover:border-border-strong'
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- operator Loom asset URL, not a build asset */}
                            <img src={img.url} alt={img.alt ?? ''} className="h-full w-full object-cover" />
                            {on && (
                              <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-on-primary">
                                <Check className="h-3 w-3" aria-hidden />
                              </span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* RIGHT — the selected photo: preview, alt text, crop, and the confirm/remove actions. */}
            <div className="space-y-3 border-t border-border bg-surface-elevated/30 p-5 sm:border-l sm:border-t-0">
              <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Selected</p>
              {selectedUrl ? (
                <>
                  <div className="overflow-hidden rounded-xl border border-border bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element -- operator Loom asset URL, not a build asset */}
                    <img src={selectedUrl} alt={alt} className="max-h-40 w-full object-contain" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setCropSrc(selectedUrl)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-text"
                  >
                    <Crop className="h-4 w-4" aria-hidden /> Crop
                  </button>
                  <div>
                    <label className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">
                      Alt text
                    </label>
                    <textarea
                      value={alt}
                      onChange={(e) => setAlt(e.target.value)}
                      rows={2}
                      placeholder="Describe the photo for screen readers and when images are off."
                      className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none"
                    />
                  </div>
                </>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs text-muted">
                  Pick or upload a photo to preview it here.
                </p>
              )}

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={commit}
                  disabled={!selectedUrl}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Use this photo
                </button>
                {currentUrl && (
                  <button
                    type="button"
                    onClick={clear}
                    className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-bg"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden /> Remove photo
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
