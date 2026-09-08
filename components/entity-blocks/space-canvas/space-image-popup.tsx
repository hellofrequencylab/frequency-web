'use client'

import { useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { LoomPicker } from '@/components/loom/loom-picker'
import { Textarea } from '@/components/ui/field'
import { assetRefUrl, assetValueFromPick, isAssetRef, type AssetValue } from '@/lib/library/asset-ref'

// THE ON-CANVAS PHOTO POPUP for the WYSIWYG Space page editor. Clicking a photo slot on the live space canvas
// opens this dialog to manage the slot's photo: CHOOSE it from the Loom (browse the library, or upload into
// it there) and write ALT text, then confirm or remove. The Loom is the ONLY way in (owner directive): there
// is no file dialog and no paste-a-URL box here.
//
// The block stores the REFERENCE the Loom hands back, not just its URL (ADR-1253): a pick with a library row
// commits `{ assetId, url }`, a pick without one (a house site icon) commits the bare URL, and a value that
// arrived as a ref commits UNCHANGED when the operator only edits the alt text, so writing alt never
// downgrades a reference to its cached url. The alt itself stays the block's own sibling field, as before.
// App-chrome DAWN tokens only (this is admin UI), no hex; voice canon (no em dashes).

/** A photo URL is only SAFE when its scheme is on the allowlist (http(s), a root/protocol-relative path,
 *  or a data:image/ URI) AND it contains no HTML metacharacters (" ' < >). Values now only ever arrive from
 *  the Loom (already server-resolved), but the allowlist stays as defense in depth on both the preview and
 *  the committed value: anything else (javascript:, data:text/html, an injection metacharacter) fails the
 *  test, so it can never reach the img src nor be stored. */
const SAFE_IMAGE_URL = /^(?:https?:\/\/|\/|data:image\/)[^\s"'<>]*$/i
function safeImageUrl(raw: string): string {
  const u = raw.trim()
  return SAFE_IMAGE_URL.test(u) ? u : ''
}

export function SpaceImagePopup({
  open,
  currentValue,
  currentAlt,
  loomScope,
  onClose,
  onSelect,
}: {
  open: boolean
  /** The slot's current image value (pre-filled): a URL string, an AssetRef, or '' when empty. */
  currentValue: AssetValue
  /** The slot's current alt text. */
  currentAlt: string
  /** The Loom library this popup opens into: the Space being edited (id or slug), or 'mine'. UX plumbing
   *  only — the Loom re-resolves and re-gates the scope server-side. */
  loomScope?: string
  onClose: () => void
  /** Commit the chosen photo: the stored value (a ref or a URL string; '' clears the slot) and its alt. */
  onSelect: (value: AssetValue, alt: string) => void
}) {
  // The whole VALUE, so a ref survives an alt-only edit. Its url is the only thing rendered or guarded.
  const [value, setValue] = useState<AssetValue>(currentValue)
  const [loomOpen, setLoomOpen] = useState(false)
  const [alt, setAlt] = useState(currentAlt)
  const [error, setError] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)

  // Reset the working state the moment the dialog opens onto a slot (adjust-state-on-prop-change, done during
  // render so there is no cascading re-render).
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setValue(currentValue)
      setAlt(currentAlt)
      setError(null)
    }
  }

  // A Loom pick returns a trusted public URL plus, for a real library row, its asset id: store the pair.
  const onPickFromLoom = (picked: AssetValue) => {
    setError(null)
    setValue(picked)
  }

  // The URL the popup renders and guards, whichever shape the value has. There is no text input feeding it,
  // so no DOM-typed string can ever be echoed into an img src; the allowlist stays as defence in depth.
  const url = assetRefUrl(value)

  const commit = () => {
    const safe = safeImageUrl(url)
    if (url.trim() && !safe) {
      setError('That photo could not be used. Choose another one from your Loom.')
      return
    }
    // A ref commits WHOLE once its cached url passes the allowlist (the sanitizer re-guards it on save);
    // a bare string commits normalised, exactly as before.
    onSelect(isAssetRef(value) ? value : safe, alt.trim())
    onClose()
  }
  const clear = () => {
    onSelect('', '')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} ariaLabel="Choose a photo" className="max-w-lg">
      <div className="overflow-hidden rounded-3xl border border-border bg-surface lift-3">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-body font-bold text-text">Choose a photo</h2>
            <p className="text-meta text-muted">Pick a photo from your Loom, then add alt text.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2.5 py-1.5 text-body-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            Close
          </button>
        </header>

        <div className="space-y-4 p-5">
          {/* Preview */}
          <div className="overflow-hidden rounded-card border border-border bg-surface-elevated/30">
            {/* Renders only a TRUSTED url: the saved image, or one the Loom just returned. The allowlist
                guard stays as defense in depth. */}
            {SAFE_IMAGE_URL.test(url.trim()) ? (
              // eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset
              <img src={url.trim()} alt={alt} className="max-h-52 w-full object-contain" />
            ) : (
              <p className="px-3 py-10 text-center text-meta text-muted">Choose a photo from your Loom to preview it here.</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setLoomOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-body-sm font-semibold text-muted transition-colors hover:border-primary hover:text-text"
          >
            <ImagePlus className="h-4 w-4" aria-hidden /> Choose from your Loom
          </button>
          <LoomPicker
            open={loomOpen}
            onClose={() => setLoomOpen(false)}
            onSelectAsset={(pick) => onPickFromLoom(assetValueFromPick(pick))}
            title="Choose a photo"
            scopeKey={loomScope}
            kinds={['image']}
          />

          <label className="block">
            <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-muted">Alt text</span>
            <Textarea
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              rows={2}
              placeholder="Describe the photo for screen readers and when images are off."
              className="resize-none"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-danger-bg px-3 py-2 text-meta font-medium text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={commit}
              disabled={!url.trim()}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-body-sm font-bold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Use this photo
            </button>
            {assetRefUrl(currentValue) && (
              <button
                type="button"
                onClick={clear}
                className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-body-sm font-medium text-danger transition-colors hover:bg-danger-bg"
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
