'use client'

import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { uploadSpotlightImage } from '@/app/(main)/settings/profile/spotlight-actions'

// A custom Puck field for the Spotlight IMAGE / GALLERY blocks: upload an image and
// store its owner-pinned storage PATH (never a URL). Spotlight assets live in the public
// `avatars` bucket at `<authUserId>/spotlight/<uuid>.<ext>` — the only shape the render +
// the validator (safeAssetPath) accept — so this control is UPLOAD-ONLY (no URL paste,
// which would point a block outside the owner's namespace and be dropped on save).
//
// It mirrors the marketing ImageField pattern (a client field wrapping a 'use server'
// upload action), so it renders in BOTH the desktop <Puck> field panel AND the mobile
// editor's FieldForm (which renders `custom` fields via the field's own render). The
// preview resolves against the same public base the renderer uses, so what you see in
// the editor is what publishes. Build-trap safe: 'use client' + a server-action import
// only, exactly like lib/page-editor/image-field.tsx.

const PUBLIC_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/avatars/`

export function SpotlightAssetField({
  value,
  onChange,
  square,
}: {
  value?: string
  onChange: (value: string) => void
  /** Render the frame as a 1:1 square (matches how galleries display publicly). */
  square?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function pick(file: File) {
    setErr(null)
    if (!file.type.startsWith('image/')) {
      setErr('Choose an image file.')
      return
    }
    setBusy(true)
    const fd = new FormData()
    fd.set('file', file)
    const res = await uploadSpotlightImage(fd)
    setBusy(false)
    if (res.error || !res.path) {
      setErr(res.error ?? 'Upload failed.')
      return
    }
    onChange(res.path)
  }

  const previewSrc = value ? `${PUBLIC_BASE}${value}` : null
  const aspect = square ? 'aspect-square' : 'aspect-[16/10]'

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) pick(f)
          e.target.value = '' // let the same file be re-picked after a remove
        }}
      />
      {previewSrc ? (
        <div className={`relative ${aspect} w-full overflow-hidden rounded-xl border border-border`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- member-uploaded asset preview in the editor, not a build-time asset */}
          <img src={previewSrc} alt="" className="h-full w-full object-cover" />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="min-h-[32px] rounded-lg bg-canvas/90 px-2.5 py-1 text-xs font-medium text-text shadow-sm backdrop-blur transition-colors hover:bg-canvas disabled:opacity-60"
            >
              {busy ? 'Uploading…' : 'Replace'}
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={busy}
              aria-label="Remove image"
              className="flex min-h-[32px] items-center rounded-lg bg-canvas/90 p-1 text-subtle shadow-sm backdrop-blur transition-colors hover:text-danger disabled:opacity-60"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={`flex ${aspect} w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-surface/60 px-3 text-center text-sm font-medium text-muted transition-colors hover:border-border-strong hover:bg-surface disabled:opacity-60`}
        >
          <Upload className="h-5 w-5" aria-hidden />
          {busy ? 'Uploading…' : 'Upload image'}
          <span className="text-2xs font-normal text-subtle">JPEG, PNG, GIF, or WebP up to 5 MB</span>
        </button>
      )}
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  )
}

type CustomFieldRenderArgs = { value?: string; onChange: (value: string) => void }

/** The Spotlight single-image upload field (landscape preview). */
export const spotlightAssetField = {
  type: 'custom' as const,
  label: 'Image',
  render: ({ value, onChange }: CustomFieldRenderArgs) => (
    <SpotlightAssetField value={value} onChange={onChange} />
  ),
}

/** The Spotlight gallery-item upload field (square preview, matching the public grid). */
export const spotlightGalleryImageField = {
  type: 'custom' as const,
  label: 'Image',
  render: ({ value, onChange }: CustomFieldRenderArgs) => (
    <SpotlightAssetField value={value} onChange={onChange} square />
  ),
}
