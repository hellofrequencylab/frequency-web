'use client'

import { useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { LoomPicker } from '@/components/loom/loom-picker'

// THE ONE IMAGE CONTROL for a block's photo field (owner directive: the Loom is the only image picker an
// operator ever sees). It replaces the old "paste a URL, or open a file dialog" pair on every image-bearing
// block field (Zigzag photo, Callout image, Photo hero background, a Features / Cards item photo): the
// operator clicks and the Loom opens, where they browse their library or upload into it.
//
// Compact by design — the block inspector rail is ~300px wide, so this is a small preview tile plus text
// controls, not a full dropzone. Controlled: the parent owns the URL and the save.
//
// `scopeKey` locks the Loom to the library being edited (a Space, by id or slug — so a pick FILES INTO that
// Space's own library and a teammate can reuse it). It is UX plumbing only: loomScope / loomImages /
// uploadLoomImage each re-resolve the scope and re-gate it server-side (canEditProfile), so a client that
// names a Space it cannot manage gets an empty, unwritable picker.
//
// Semantic DAWN tokens only, no hex. Voice canon on every visible word (plain, no em dashes).
export function LoomImageField({
  label,
  value,
  scopeKey,
  onChange,
}: {
  label: string
  /** The current image URL, or '' when the field is empty. */
  value: string
  /** The Loom library to open in: a Space id or slug. Omit for a surface with no Space (the full picker). */
  scopeKey?: string
  /** The chosen image URL, or undefined when cleared (the panel deletes an empty key). */
  onChange: (value: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const lower = label.toLowerCase()

  return (
    <div className="space-y-1">
      <span className="block text-2xs font-semibold uppercase tracking-wide text-muted">{label}</span>

      {value ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Change ${lower}`}
            className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border transition-colors hover:border-primary"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset */}
            <img src={value} alt="" className="h-full w-full object-cover" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-w-0 flex-1 text-left text-2xs font-semibold text-primary-strong hover:underline"
          >
            Change photo
          </button>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={`Remove ${lower}`}
            className="shrink-0 rounded p-1 text-subtle transition-colors hover:bg-danger-bg hover:text-danger"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-2.5 text-2xs font-semibold text-muted transition-colors hover:border-primary hover:text-text"
        >
          <ImagePlus className="h-3.5 w-3.5" aria-hidden /> Choose a photo
        </button>
      )}

      <LoomPicker
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(url) => onChange(url)}
        title={`Choose ${lower}`}
        scopeKey={scopeKey}
        kinds={['image']}
      />
    </div>
  )
}
