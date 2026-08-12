'use client'

import { useState } from 'react'
import { X, ImageIcon } from 'lucide-react'
import { LoomPicker } from '@/components/loom/loom-picker'
import { useSpaceEditorSlug } from './space-editor-context'

// A Loom-BACKED custom Puck image field for a SPACE OPERATOR editing their own page. It is a thin wrapper
// over the ONE universal Loom picker (components/loom/loom-picker), which is the only image picker an
// operator ever sees (owner directive): browse the library, or upload into it there. This field owns no
// upload path and offers no file dialog of its own.
//
// The active-space `slug` comes from the SpaceEditor context both editor surfaces provide, and it locks the
// picker to THAT Space's library so a pick files into it and a teammate can reuse it. The slug is UNTRUSTED
// UX plumbing: the Loom's server actions re-resolve the space and re-gate per-space edit permission, so the
// context can never grant access it shouldn't. Outside a space editor (no slug) the picker opens unlocked on
// the caller's own uploads plus every Space they run, which is a real, authorized scope.
//
// It mirrors the SpotlightAssetField pattern (a 'use client' control wrapping 'use server' actions), so it
// renders in BOTH the desktop <Puck> field panel AND the mobile editor's FieldForm (both drive a `custom`
// field through its own `render`). Semantic tokens only, no hex; voice canon (no em dashes).

function LoomImageField({
  value,
  onChange,
  square,
}: {
  value?: string
  onChange: (value: string) => void
  /** Render the preview as a 1:1 square (logos / avatars); otherwise a landscape frame. */
  square?: boolean
}) {
  const slug = useSpaceEditorSlug()
  const [picking, setPicking] = useState(false)
  const aspect = square ? 'aspect-square' : 'aspect-[16/10]'

  return (
    <div className="space-y-2">
      {value ? (
        <div className={`relative ${aspect} w-full overflow-hidden rounded-card border border-border`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Loom-served asset preview in the editor, not a build-time asset */}
          <img src={value} alt="" className="h-full w-full object-cover" />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="min-h-8 rounded-control bg-canvas/90 px-2.5 py-1 text-meta font-medium text-text shadow-sm backdrop-blur transition-colors hover:bg-canvas"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label="Remove image"
              className="flex min-h-8 items-center rounded-control bg-canvas/90 p-1 text-subtle shadow-sm backdrop-blur transition-colors hover:text-danger"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className={`flex ${aspect} w-full flex-col items-center justify-center gap-1.5 rounded-control border border-dashed border-border bg-surface/60 px-3 text-center text-body-sm font-medium text-muted transition-colors hover:border-border-strong hover:bg-surface`}
        >
          <ImageIcon className="h-5 w-5" aria-hidden />
          Pick from the Loom
          <span className="text-2xs font-normal text-subtle">browse your library, or upload there</span>
        </button>
      )}

      <LoomPicker
        open={picking}
        onClose={() => setPicking(false)}
        onSelect={(url) => onChange(url)}
        title="Choose an image"
        scopeKey={slug ?? undefined}
        kinds={['image', 'icon']}
      />
    </div>
  )
}

type CustomFieldRenderArgs = { value?: string; onChange: (value: string) => void }

/** The Loom-backed image field (landscape preview) for block media / cover fields. */
export const loomImageField = {
  type: 'custom' as const,
  label: 'Image',
  render: ({ value, onChange }: CustomFieldRenderArgs) => (
    <LoomImageField value={value} onChange={onChange} />
  ),
}

/** The Loom-backed image field with a 1:1 preview, for logos / avatars. */
export const loomSquareImageField = {
  type: 'custom' as const,
  label: 'Image',
  render: ({ value, onChange }: CustomFieldRenderArgs) => (
    <LoomImageField value={value} onChange={onChange} square />
  ),
}
