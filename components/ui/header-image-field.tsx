'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { ImageUpload } from '@/components/ui/image-upload'
import { ImageFocalPicker } from '@/components/ui/image-focal-picker'
import { LoomPicker } from '@/components/loom/loom-picker'
import { DEFAULT_OBJECT_POSITION } from '@/lib/images/focal-point'

// THE ONE header/cover image control for every editor (Space, Profile, Journey) — the render side of the
// `header` element's image slot. Extracted from the refined Space branding form so the profile and journey
// editors get the exact same control instead of a bespoke canvas cropper or a bare upload box:
//
//   • Empty  — the shared dropzone (ImageUpload) that opens the universal Loom picker to browse or upload.
//   • Set    — the image previewed at the hero's set crop shape with the drag-to-focus marker on it
//              (ImageFocalPicker), plus Replace / Remove overlaid. Replace reopens the Loom picker.
//
// Everything funnels through the ONE Loom picker (owner directive: every image upload opens the Loom), and
// `scopeKey` locks that picker to the context being edited (a Space id, or 'mine' for a person/journey) so it
// shows only that library. Controlled: the parent owns the URL + the focal point + the saves. Copy runs
// CONTENT-VOICE (plain, no em dashes).
export function HeaderImageField({
  value,
  onChange,
  focus = DEFAULT_OBJECT_POSITION,
  onFocusChange,
  aspect = 16 / 6,
  scopeKey,
  label = 'Header image',
  hint = 'Wide banner across the top of your page.',
  focusHint = 'Drag to choose which part of your header photo stays in frame. This preview matches your header height.',
  disabled = false,
  rounded = false,
  noUrlPaste = false,
  className,
}: {
  /** The current cover image URL, or null when none is set. */
  value: string | null
  /** Called with the new public URL after a pick/upload, or null when removed. */
  onChange: (value: string | null) => void
  /** The saved focal point ("x% y%") and its (usually debounced) setter, owned by the parent. */
  focus?: string
  onFocusChange: (value: string) => void
  /** The width:height ratio of the hero at its current height, so the preview matches the live crop shape. */
  aspect?: number
  /** Lock the Loom picker to ONE scope (a Space id, or 'mine'), so it shows only that library. */
  scopeKey?: string
  label?: string
  /** Helper line under the empty dropzone. */
  hint?: string
  /** Helper line under the focal preview once an image is set. */
  focusHint?: string
  disabled?: boolean
  /** Round the preview (a profile photo / avatar) instead of the default rectangular banner crop. */
  rounded?: boolean
  /** Hide the "or paste an image URL" fallback (used for the avatar, whose URL is allowlisted server-side). */
  noUrlPaste?: boolean
  /** Extra classes on the outer wrapper (e.g. a max-width for a compact avatar control). */
  className?: string
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  // Empty: the shared dropzone, which opens the scoped Loom picker (browse + upload) or accepts a pasted URL.
  if (!value) {
    return (
      <div className={className}>
        <ImageUpload
          value={null}
          onChange={onChange}
          label={label}
          hint={hint}
          disabled={disabled}
          loom
          scopeKey={scopeKey}
          noUrlPaste={noUrlPaste}
        />
      </div>
    )
  }

  // Set: ONE control — the preview at the hero's crop shape, the drag-to-focus selector on it, and
  // Replace / Remove overlaid. Repositioning never changes the header height; it only picks what stays in
  // frame. Replace reopens the same scoped Loom picker.
  return (
    <div className={`space-y-1.5${className ? ` ${className}` : ''}`}>
      <div className="relative">
        <ImageFocalPicker
          // Key the preview by its aspect so a height switch REMOUNTS the crop box — it can never render at
          // a stale height whatever the reconciler does with the changed inline style.
          key={`hdr-${aspect}`}
          imageUrl={value}
          value={focus}
          onChange={onFocusChange}
          disabled={disabled}
          label={label}
          hint={focusHint}
          showSliders={false}
          aspect={aspect}
          rounded={rounded}
        />
        {/* Replace / Remove sit top-right over the preview; the focal marker owns the rest of the frame. */}
        <div className="absolute right-2 top-9 flex gap-1.5">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={disabled}
            className="rounded-lg bg-canvas/90 px-2.5 py-1 text-xs font-medium text-text shadow-sm backdrop-blur transition-colors hover:bg-canvas disabled:opacity-60 motion-reduce:transition-none"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label={`Remove ${label.toLowerCase()}`}
            className="rounded-lg bg-canvas/90 p-1 text-subtle shadow-sm backdrop-blur transition-colors hover:text-danger disabled:opacity-60 motion-reduce:transition-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <LoomPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => onChange(url)}
        title={`Choose ${label.toLowerCase()}`}
        scopeKey={scopeKey}
      />
    </div>
  )
}
