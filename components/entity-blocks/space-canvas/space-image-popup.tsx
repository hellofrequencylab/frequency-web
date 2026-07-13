'use client'

import { useRef, useState } from 'react'
import { Loader2, Trash2, Upload } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import type { UploadImage } from '@/components/entity-blocks/block-edit-panel'

// THE ON-CANVAS PHOTO POPUP for the WYSIWYG Space page editor (the space analogue of the Email Studio Loom
// popup). Clicking a photo slot on the live space canvas opens this dialog to manage the slot's photo: UPLOAD
// a new file through the Space's own gated upload action (the same service-role path the cover / logo use),
// PASTE an image URL, write ALT text, and confirm / remove. Every image resolves to a plain public URL, so an
// uploaded asset and a pasted URL are interchangeable — the block just stores that URL plus a sibling alt
// string. App-chrome DAWN tokens only (this is admin UI), no hex; voice canon (no em dashes).

// A per-file ceiling kept safely UNDER the server-action body limit (next.config bodySizeLimit, 10mb), so a
// single upload request never overflows the framework boundary. Larger files are rejected up front.
const MAX_UPLOAD_BYTES = 9 * 1024 * 1024

/** A pasted or uploaded URL is only usable as a photo when it parses to a SAFE image source: an http(s)
 *  URL, a root-relative same-origin path, or a data:image/ URI. Parsing with the URL constructor and
 *  allowlisting the resolved protocol (not a string sniff) is the robust sanitizer: any other scheme
 *  (javascript:, data:text/html, vbscript:, ...) resolves to '' so a malicious pasted value can never
 *  reach the preview img src nor be committed to the block. */
function safeImageUrl(raw: string): string {
  const u = raw.trim()
  if (!u) return ''
  // Root-relative paths are same-origin by definition (no scheme to abuse).
  if (u.startsWith('/') && !u.startsWith('//')) return u
  try {
    const parsed = new URL(u, 'https://frequencylocal.com')
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href
    if (parsed.protocol === 'data:' && /^data:image\//i.test(u)) return u
  } catch {
    return ''
  }
  return ''
}

export function SpaceImagePopup({
  open,
  currentUrl,
  currentAlt,
  uploadImage,
  onClose,
  onSelect,
}: {
  open: boolean
  /** The slot's current image URL (pre-filled), or '' when empty. */
  currentUrl: string
  /** The slot's current alt text. */
  currentAlt: string
  /** The Space-scoped gated upload; absent on surfaces with no upload path (URL paste still works). */
  uploadImage?: UploadImage
  onClose: () => void
  /** Commit the chosen photo: the URL (empty string clears the slot) and its alt text. */
  onSelect: (url: string, alt: string) => void
}) {
  const [url, setUrl] = useState(currentUrl)
  const [alt, setAlt] = useState(currentAlt)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset the working state the moment the dialog opens onto a slot (adjust-state-on-prop-change, done during
  // render so there is no cascading re-render).
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setUrl(currentUrl)
      setAlt(currentAlt)
      setError(null)
    }
  }

  async function handleFile(file: File) {
    if (!uploadImage) return
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Use one under 9 MB.`)
      return
    }
    setUploading(true)
    setError(null)
    try {
      const res = await uploadImage(file)
      if ('error' in res) setError(res.error)
      else setUrl(res.url)
    } catch {
      setError('That upload did not go through. Try again.')
    } finally {
      setUploading(false)
    }
  }

  const commit = () => {
    const safe = safeImageUrl(url)
    if (url.trim() && !safe) {
      setError('Use a photo link that starts with https://')
      return
    }
    onSelect(safe, alt.trim())
    onClose()
  }
  const clear = () => {
    onSelect('', '')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} ariaLabel="Choose a photo" className="max-w-lg">
      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-text">Choose a photo</h2>
            <p className="text-xs text-muted">Upload a photo or paste an image link, then add alt text.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            Close
          </button>
        </header>

        <div className="space-y-4 p-5">
          {/* Preview */}
          <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated/30">
            {safeImageUrl(url) ? (
              // eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset
              <img src={safeImageUrl(url)} alt={alt} className="max-h-52 w-full object-contain" />
            ) : (
              <p className="px-3 py-10 text-center text-xs text-muted">Upload or paste a photo to preview it here.</p>
            )}
          </div>

          {uploadImage && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-text disabled:opacity-60"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                {uploading ? 'Uploading' : 'Upload a photo'}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleFile(file)
                  e.target.value = ''
                }}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Image link</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Alt text</label>
            <textarea
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              rows={2}
              placeholder="Describe the photo for screen readers and when images are off."
              className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs font-medium text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={commit}
              disabled={!url.trim()}
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
    </Dialog>
  )
}
