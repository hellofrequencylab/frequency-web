'use client'

import { useRef, useState, useCallback } from 'react'
import { Upload, Trash2, RotateCcw, Move } from 'lucide-react'

// Editable profile header — upload a wide image, then reposition (drag) and zoom to
// crop it to the banner. WYSIWYG: the editor canvas IS the export, so what you frame
// is what saves. Newly-uploaded files are local blobs (same-origin → no canvas taint),
// so the crop only applies to a fresh upload; an existing header just shows with
// Change/Remove. Emits a cropped JPEG blob (or null on remove) to the parent.

const OW = 1500 // output banner width
const OH = 560 // output banner height (~2.68:1 — a touch taller than before)

export function HeaderEditor({
  initialUrl,
  onChange,
}: {
  initialUrl: string | null
  onChange: (blob: Blob | null, removed: boolean) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const view = useRef({ ox: 0, oy: 0, base: 1, zoom: 1, dragging: false, px: 0, py: 0 })

  const [mode, setMode] = useState<'edit' | 'existing' | 'empty'>(initialUrl ? 'existing' : 'empty')
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState('')

  const draw = useCallback(() => {
    const c = canvasRef.current
    const img = imgRef.current
    if (!c || !img) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const v = view.current
    const s = v.base * v.zoom
    const dw = img.naturalWidth * s
    const dh = img.naturalHeight * s
    v.ox = Math.min(0, Math.max(OW - dw, v.ox))
    v.oy = Math.min(0, Math.max(OH - dh, v.oy))
    ctx.clearRect(0, 0, OW, OH)
    ctx.drawImage(img, v.ox, v.oy, dw, dh)
  }, [])

  const emit = useCallback(() => {
    canvasRef.current?.toBlob((b) => onChange(b, false), 'image/jpeg', 0.9)
  }, [onChange])

  function loadFile(file: File) {
    if (file.size > 12 * 1024 * 1024) {
      setError(`Too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 12 MB.`)
      return
    }
    setError('')
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      imgRef.current = img
      const base = Math.max(OW / img.naturalWidth, OH / img.naturalHeight)
      view.current = {
        base,
        zoom: 1,
        ox: (OW - img.naturalWidth * base) / 2,
        oy: (OH - img.naturalHeight * base) / 2,
        dragging: false,
        px: 0,
        py: 0,
      }
      setZoom(1)
      setMode('edit')
      requestAnimationFrame(() => { draw(); emit() })
    }
    img.onerror = () => { URL.revokeObjectURL(url); setError('Could not read that image.') }
    img.src = url
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    view.current.dragging = true
    view.current.px = e.clientX
    view.current.py = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const v = view.current
    if (!v.dragging) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = OW / rect.width // screen px → canvas px
    v.ox += (e.clientX - v.px) * ratio
    v.oy += (e.clientY - v.py) * ratio
    v.px = e.clientX
    v.py = e.clientY
    draw()
  }
  function onPointerUp() {
    if (view.current.dragging) { view.current.dragging = false; emit() }
  }
  function onZoom(z: number) {
    view.current.zoom = z
    setZoom(z)
    draw()
    emit()
  }

  function clear() {
    imgRef.current = null
    if (fileRef.current) fileRef.current.value = ''
    setMode(initialUrl ? 'existing' : 'empty')
  }
  function remove() {
    imgRef.current = null
    if (fileRef.current) fileRef.current.value = ''
    setMode('empty')
    onChange(null, true)
  }

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-elevated">
        {mode === 'edit' ? (
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={OW}
              height={OH}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              className="block w-full cursor-grab touch-none active:cursor-grabbing"
              style={{ aspectRatio: `${OW} / ${OH}` }}
            />
            <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/45 px-2 py-1 text-2xs font-medium text-white">
              <Move className="h-3 w-3" /> Drag to reposition
            </span>
          </div>
        ) : mode === 'existing' && initialUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={initialUrl} alt="Profile header" className="block w-full object-cover" style={{ aspectRatio: `${OW} / ${OH}` }} />
        ) : (
          <div className="w-full bg-gradient-to-br from-primary via-signal to-signal-strong" style={{ aspectRatio: `${OW} / ${OH}` }} />
        )}
      </div>

      {mode === 'edit' && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-subtle">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => onZoom(Number(e.target.value))}
            className="h-1.5 flex-1 accent-primary"
            aria-label="Zoom header image"
          />
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-sm font-medium text-primary-strong transition-colors hover:text-primary-hover"
        >
          {mode === 'empty' ? 'Upload header' : 'Change header'}
        </button>
        {mode === 'edit' && (
          <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-sm text-subtle transition-colors hover:text-muted">
            <RotateCcw className="h-3.5 w-3.5" /> Cancel
          </button>
        )}
        {mode !== 'empty' && (
          <button type="button" onClick={remove} className="inline-flex items-center gap-1 text-sm text-subtle transition-colors hover:text-danger">
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-subtle">
          <Upload className="h-3.5 w-3.5" /> Wide image up to 12 MB · drag &amp; zoom to crop
        </span>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f) }} />
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  )
}
