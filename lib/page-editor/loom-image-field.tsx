'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Upload, X, ImageIcon, Search } from 'lucide-react'
import { prepareImageForUpload, SERVER_MAX_BYTES } from '@/lib/library/image-shrink'
import { listLoomImages, uploadToLoom, type LoomImagePick } from './loom-field-actions'
import { useSpaceEditorSlug } from './space-editor-context'
import { Input } from '@/components/ui/field'

// A Loom-BACKED custom Puck image field for a SPACE OPERATOR editing their own profile. The operator
// either PICKS an existing image from the Loom (their space's own images UNIONED with the shared/public
// library) or UPLOADS a new one, which FILES INTO their SPACE'S OWN Loom (never the shared root
// library). Either way the field stores the Loom asset's served URL, so an image resolves the SAME
// whether it was picked or uploaded (images resolve through the Loom `url`, the rendition-served
// address).
//
// The active-space `slug` comes from the SpaceEditor context both editor surfaces provide; the server
// actions re-resolve the space + re-gate per-space edit permission, so the slug is UX plumbing only.
// Outside a space editor (no slug) the field disables the Loom actions and explains why.
//
// It mirrors the SpotlightAssetField pattern (a 'use client' control wrapping 'use server' actions),
// so it renders in BOTH the desktop <Puck> field panel AND the mobile editor's FieldForm (both drive
// a `custom` field through its own `render`). Build-trap safe: 'use client' + server-action imports
// only, so nothing server-only reaches the editor bundle and the public profile ships no editor
// runtime.

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
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [items, setItems] = useState<LoomImagePick[]>([])
  const [q, setQ] = useState('')
  const [loading, startLoad] = useTransition()

  // Load the Loom grid when the picker opens or the query changes (debounced). Needs the space slug.
  useEffect(() => {
    if (!picking || !slug) return
    const handle = setTimeout(() => {
      startLoad(async () => {
        const rows = await listLoomImages(slug, q)
        setItems(rows)
      })
    }, 200)
    return () => clearTimeout(handle)
  }, [picking, q, slug])

  async function upload(raw: File) {
    setErr(null)
    if (!slug) {
      setErr('Open this from your space editor to add images.')
      return
    }
    if (!raw.type.startsWith('image/')) {
      setErr('Choose an image file.')
      return
    }
    setBusy(true)
    try {
      // Prep in the browser first (the shared seam): an iPhone HEIC is converted to JPEG (a raw HEIC
      // stores fine but renders broken in every browser but Safari), then a big photo is downscaled
      // so the server action stays under the platform body limit. An unconvertible HEIC gets an
      // inline message instead of a broken upload.
      const prepared = await prepareImageForUpload(raw)
      if ('error' in prepared) {
        setErr(prepared.error)
        return
      }
      const file = prepared.file
      if (file.size > SERVER_MAX_BYTES) {
        setErr(`That image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Try a smaller one.`)
        return
      }
      const fd = new FormData()
      fd.set('file', file)
      const res = await uploadToLoom(slug, fd)
      if ('error' in res) {
        setErr(res.error)
        return
      }
      onChange(res.url)
    } finally {
      setBusy(false)
    }
  }

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
          if (f) void upload(f)
          e.target.value = ''
        }}
      />

      {value ? (
        <div className={`relative ${aspect} w-full overflow-hidden rounded-card border border-border`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Loom-served asset preview in the editor, not a build-time asset */}
          <img src={value} alt="" className="h-full w-full object-cover" />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => setPicking((p) => !p)}
              disabled={busy}
              className="min-h-8 rounded-control bg-canvas/90 px-2.5 py-1 text-meta font-medium text-text shadow-sm backdrop-blur transition-colors hover:bg-canvas disabled:opacity-60"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={busy}
              aria-label="Remove image"
              className="flex min-h-8 items-center rounded-control bg-canvas/90 p-1 text-subtle shadow-sm backdrop-blur transition-colors hover:text-danger disabled:opacity-60"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            disabled={busy || !slug}
            className={`flex ${aspect} flex-1 flex-col items-center justify-center gap-1.5 rounded-control border border-dashed border-border bg-surface/60 px-3 text-center text-body-sm font-medium text-muted transition-colors hover:border-border-strong hover:bg-surface disabled:opacity-50`}
          >
            <ImageIcon className="h-5 w-5" aria-hidden />
            Pick from the Loom
            <span className="text-2xs font-normal text-subtle">your library plus the shared one</span>
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          disabled={!slug}
          className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1.5 text-meta font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
        >
          <ImageIcon className="h-3.5 w-3.5" aria-hidden />
          {picking ? 'Close library' : 'Browse the Loom'}
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || !slug}
          className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1.5 text-meta font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden />
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>

      {!slug && (
        <p className="text-2xs text-subtle">Open this from your space editor to pick or upload images.</p>
      )}

      {picking && slug && (
        <div className="rounded-card border border-border bg-surface p-2">
          <div className="mb-2 flex items-center gap-2 rounded-control border border-border bg-surface px-2">
            <Search className="h-3.5 w-3.5 text-subtle" aria-hidden />
            <Input
              variant="seamless"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the Loom"
              className="w-full py-1.5 text-body-sm"
            />
          </div>
          {loading ? (
            <p className="px-1 py-4 text-center text-meta text-subtle">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-1 py-4 text-center text-meta text-subtle">
              No images in your library yet. Upload one to get started.
            </p>
          ) : (
            <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => {
                    onChange(it.url)
                    setPicking(false)
                  }}
                  title={it.title}
                  className="aspect-square overflow-hidden rounded-lg border border-border transition-colors hover:border-primary"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Loom asset thumbnail in the picker, not a build-time asset */}
                  <img src={it.url} alt={it.alt ?? ''} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {err && <p className="text-meta text-danger">{err}</p>}
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
