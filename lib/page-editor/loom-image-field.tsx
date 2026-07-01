'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Upload, X, ImageIcon, Search } from 'lucide-react'
import { listLoomImages, uploadToLoom, type LoomImagePick } from './loom-field-actions'

// A Loom-BACKED custom Puck image field. The operator either PICKS an existing image from the shared
// Loom (the DAM Loom Studio browses) or UPLOADS a new one, which FILES INTO the Loom so it is
// catalogued + reusable. Either way the field stores the Loom asset's served URL, so an image
// resolves the SAME whether it was picked or uploaded (images resolve through the Loom `url`, the
// rendition-served address).
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
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [items, setItems] = useState<LoomImagePick[]>([])
  const [q, setQ] = useState('')
  const [loading, startLoad] = useTransition()

  // Load the Loom grid when the picker opens or the query changes (debounced).
  useEffect(() => {
    if (!picking) return
    const handle = setTimeout(() => {
      startLoad(async () => {
        const rows = await listLoomImages(q)
        setItems(rows)
      })
    }, 200)
    return () => clearTimeout(handle)
  }, [picking, q])

  async function upload(file: File) {
    setErr(null)
    if (!file.type.startsWith('image/')) {
      setErr('Choose an image file.')
      return
    }
    setBusy(true)
    const fd = new FormData()
    fd.set('file', file)
    const res = await uploadToLoom(fd)
    setBusy(false)
    if ('error' in res) {
      setErr(res.error)
      return
    }
    onChange(res.url)
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
          if (f) upload(f)
          e.target.value = ''
        }}
      />

      {value ? (
        <div className={`relative ${aspect} w-full overflow-hidden rounded-xl border border-border`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Loom-served asset preview in the editor, not a build-time asset */}
          <img src={value} alt="" className="h-full w-full object-cover" />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => setPicking((p) => !p)}
              disabled={busy}
              className="min-h-[32px] rounded-lg bg-canvas/90 px-2.5 py-1 text-xs font-medium text-text shadow-sm backdrop-blur transition-colors hover:bg-canvas disabled:opacity-60"
            >
              Change
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            disabled={busy}
            className={`flex ${aspect} flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-surface/60 px-3 text-center text-sm font-medium text-muted transition-colors hover:border-border-strong hover:bg-surface disabled:opacity-60`}
          >
            <ImageIcon className="h-5 w-5" aria-hidden />
            Pick from the Loom
            <span className="text-2xs font-normal text-subtle">or upload a new image</span>
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-elevated"
        >
          <ImageIcon className="h-3.5 w-3.5" aria-hidden />
          {picking ? 'Close library' : 'Browse the Loom'}
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden />
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>

      {picking && (
        <div className="rounded-xl border border-border bg-surface p-2">
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-surface px-2">
            <Search className="h-3.5 w-3.5 text-subtle" aria-hidden />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the Loom"
              className="w-full bg-transparent py-1.5 text-sm outline-none"
            />
          </div>
          {loading ? (
            <p className="px-1 py-4 text-center text-xs text-subtle">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-1 py-4 text-center text-xs text-subtle">
              No images in the Loom yet. Upload one to get started.
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

      {err && <p className="text-xs text-danger">{err}</p>}
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
