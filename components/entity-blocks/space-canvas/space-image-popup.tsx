'use client'

import { useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { LoomPicker } from '@/components/loom/loom-picker'
import type { UploadImage } from '@/components/entity-blocks/block-edit-panel'

// THE ON-CANVAS PHOTO POPUP for the WYSIWYG Space page editor (the space analogue of the Email Studio Loom
// popup). Clicking a photo slot on the live space canvas opens this dialog to manage the slot's photo: UPLOAD
// a new file through the Space's own gated upload action (the same service-role path the cover / logo use),
// PASTE an image URL, write ALT text, and confirm / remove. Every image resolves to a plain public URL, so an
// uploaded asset and a pasted URL are interchangeable — the block just stores that URL plus a sibling alt
// string. App-chrome DAWN tokens only (this is admin UI), no hex; voice canon (no em dashes).

/** A photo URL is only SAFE when its scheme is on the allowlist (http(s), a root/protocol-relative path,
 *  or a data:image/ URI) AND it contains no HTML metacharacters (" ' < >). The single allowlist regexp
 *  is the sanitizer used identically for the preview and the committed value: any other scheme
 *  (javascript:, data:text/html, vbscript:, ...) or an injection metacharacter fails the test, so a
 *  malicious pasted value can never reach the img src nor be stored. */
const SAFE_IMAGE_URL = /^(?:https?:\/\/|\/|data:image\/)[^\s"'<>]*$/i
function safeImageUrl(raw: string): string {
  const u = raw.trim()
  return SAFE_IMAGE_URL.test(u) ? u : ''
}

export function SpaceImagePopup({
  open,
  currentUrl,
  currentAlt,
  onClose,
  onSelect,
}: {
  open: boolean
  /** The slot's current image URL (pre-filled), or '' when empty. */
  currentUrl: string
  /** The slot's current alt text. */
  currentAlt: string
  /** Legacy Space-scoped gated upload. No longer used (the Loom picker handles upload); kept optional
   *  so existing callers still type-check. */
  uploadImage?: UploadImage
  onClose: () => void
  /** Commit the chosen photo: the URL (empty string clears the slot) and its alt text. */
  onSelect: (url: string, alt: string) => void
}) {
  const [url, setUrl] = useState(currentUrl)
  const [loomOpen, setLoomOpen] = useState(false)
  // The image PREVIEW renders only from TRUSTED sources: the already-saved image (the currentUrl prop) or a
  // freshly uploaded file's server URL (res.url). It is deliberately NEVER fed from the raw text-input value,
  // so no DOM-typed string is ever echoed into an img src. A pasted URL is validated + committed on Use, but
  // is not live-previewed. This severs the input -> img dataflow entirely (both for real safety and so the
  // static analyzer has no source-to-sink path to flag).
  const [previewSrc, setPreviewSrc] = useState(currentUrl)
  const [alt, setAlt] = useState(currentAlt)
  const [error, setError] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)

  // Reset the working state the moment the dialog opens onto a slot (adjust-state-on-prop-change, done during
  // render so there is no cascading re-render).
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setUrl(currentUrl)
      setPreviewSrc(currentUrl)
      setAlt(currentAlt)
      setError(null)
    }
  }

  // A Loom pick returns a trusted public URL: set it as both the committed value and the preview.
  const onPickFromLoom = (picked: string) => {
    setError(null)
    setUrl(picked)
    setPreviewSrc(picked)
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
            <p className="text-xs text-muted">Pick from your Loom or paste an image link, then add alt text.</p>
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
            {/* Renders only a TRUSTED previewSrc (saved image or uploaded server URL), never the raw typed
                value. The allowlist guard stays as defense in depth. */}
            {SAFE_IMAGE_URL.test(previewSrc.trim()) ? (
              // eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset
              <img src={previewSrc.trim()} alt={alt} className="max-h-52 w-full object-contain" />
            ) : (
              <p className="px-3 py-10 text-center text-xs text-muted">Upload a photo, or paste a link and press Use, to preview it here.</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setLoomOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-text"
          >
            <ImagePlus className="h-4 w-4" aria-hidden /> Choose from your Loom
          </button>
          <LoomPicker open={loomOpen} onClose={() => setLoomOpen(false)} onSelect={onPickFromLoom} title="Choose a photo" />

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
