'use client'

// The Loom crop/rotate editor (HYG-109, ADR-1592). Opened from the asset drawer for a raster still,
// and LOADED LAZILY: loom-grid.tsx reaches this file only through next/dynamic, so its code is fetched
// when an operator presses "Crop and rotate" and never ships with the grid, let alone a member route.
//
// Native Canvas 2D, zero dependencies. HYG-109 measured the alternative (Filerobot: seven packages,
// ~6.8 MB, a second styling runtime and two beta pins) and this is the exit that adds none of it. It
// covers what the Loom was missing: crop to a CROP_FRAMES frame or freeform, rotate by quarter turns,
// and straighten by up to 45°. It does not do filters or annotation.
//
// ONE SAVE PATH. The redrawn bytes go through prepareImageForUpload (the browser seam every uploader
// uses) and then replaceLibraryAssetFile, which versions the current file with recordVersion BEFORE
// the swap and runs the new bytes through ingest. So a crop keeps the asset id and every reference,
// strips metadata like any upload, and rolls back from the Versions list like any replace. Do not
// give this editor a storage write of its own.

import { useEffect, useRef, useState, useTransition } from 'react'
import { RotateCcw, RotateCw, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { CROP_FRAMES } from '@/lib/library/renditions'
import { prepareImageForUpload } from '@/lib/library/image-shrink'
import {
  editNote,
  frameRatio,
  largestCentered,
  moveCrop,
  outputSize,
  resizeCrop,
  rotatedBounds,
  type Corner,
  type CropFrameKey,
  type CropRect,
} from '@/lib/library/crop-geometry'
import { replaceLibraryAssetFile } from './replace-actions'

const MAX_STAGE_HEIGHT = 320
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']
const CORNER_CLS: Record<Corner, string> = {
  nw: '-left-2 -top-2 cursor-nwse-resize',
  ne: '-right-2 -top-2 cursor-nesw-resize',
  sw: '-left-2 -bottom-2 cursor-nesw-resize',
  se: '-right-2 -bottom-2 cursor-nwse-resize',
}

type Geometry = { turns: number; straighten: number; frame: CropFrameKey; rect: CropRect }

function freshGeometry(W: number, H: number, turns: number, straighten: number, frame: CropFrameKey): Geometry {
  const deg = turns * 90 + straighten
  return { turns, straighten, frame, rect: largestCentered(W, H, deg, frameRatio(frame, W, H, deg)) }
}

export default function LoomCropEditor({
  assetId,
  url,
  mime,
  slug,
  onCancel,
  onSaved,
}: {
  assetId: string
  /** The master file url (never a rendition: the edit must start from full resolution). */
  url: string
  mime: string | null
  slug: string
  onCancel: () => void
  onSaved: () => void
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [geo, setGeo] = useState<Geometry | null>(null)
  const [stageWidth, setStageWidth] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Load the master as bytes, not as an <img>: a fetched blob decodes into a bitmap that can never
  // taint the canvas, whatever the browser cached for the same url without CORS.
  useEffect(() => {
    let live = true
    let loaded: ImageBitmap | null = null
    fetch(url, { mode: 'cors' })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => createImageBitmap(b))
      .then((bmp) => {
        if (!live) {
          bmp.close()
          return
        }
        loaded = bmp
        setBitmap(bmp)
        setGeo(freshGeometry(bmp.width, bmp.height, 0, 0, 'free'))
      })
      .catch(() => {
        if (live) setLoadError(true)
      })
    return () => {
      live = false
      loaded?.close()
    }
  }, [url])

  // The stage is as wide as the drawer gives it.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setStageWidth(Math.floor(entries[0]?.contentRect.width ?? 0)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const W = bitmap?.width ?? 1
  const H = bitmap?.height ?? 1
  const deg = geo ? geo.turns * 90 + geo.straighten : 0
  const bounds = rotatedBounds(W, H, deg)
  const scale = stageWidth > 0 ? Math.min(stageWidth / bounds.w, MAX_STAGE_HEIGHT / bounds.h) : 0
  const dispW = Math.round(bounds.w * scale)
  const dispH = Math.round(bounds.h * scale)

  // Paint the turned picture into the preview canvas (device-pixel sharp).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !bitmap || !scale) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.max(1, Math.round(dispW * dpr))
    canvas.height = Math.max(1, Math.round(dispH * dpr))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.scale(dpr * scale, dpr * scale)
    ctx.translate(bounds.w / 2, bounds.h / 2)
    ctx.rotate((deg * Math.PI) / 180)
    ctx.drawImage(bitmap, -W / 2, -H / 2)
  }, [bitmap, deg, scale, dispW, dispH, bounds.w, bounds.h, W, H])

  // Drags run on window listeners so a fast release off a small handle still ends the drag (the same
  // fix components/ui/image-cropper.tsx carries).
  const endRef = useRef<(() => void) | null>(null)
  useEffect(() => () => endRef.current?.(), [])

  function beginDrag(e: React.PointerEvent, corner: Corner | null) {
    if (!geo || !scale) return
    e.preventDefault()
    e.stopPropagation()
    const start = geo
    const startX = e.clientX
    const startY = e.clientY
    const frameRect = stageRef.current?.querySelector('[data-crop-frame]')?.getBoundingClientRect()
    const ratio = start.frame === 'free' ? null : frameRatio(start.frame, W, H, deg)
    const move = (ev: PointerEvent) => {
      let rect: CropRect
      if (corner && frameRect) {
        // The pointer in the turned frame, source pixels, centre-relative.
        const px = (ev.clientX - frameRect.left) / scale - bounds.w / 2
        const py = (ev.clientY - frameRect.top) / scale - bounds.h / 2
        rect = resizeCrop(start.rect, corner, px, py, ratio, W, H, deg)
      } else {
        rect = moveCrop(start.rect, (ev.clientX - startX) / scale, (ev.clientY - startY) / scale, W, H, deg)
      }
      setGeo({ ...start, rect })
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      endRef.current = null
    }
    endRef.current?.()
    endRef.current = end
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  function nudge(e: React.KeyboardEvent) {
    if (!geo) return
    const step = (e.shiftKey ? 0.1 : 0.01) * Math.max(bounds.w, bounds.h)
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const v = d[e.key]
    if (!v) return
    e.preventDefault()
    setGeo({ ...geo, rect: moveCrop(geo.rect, v[0], v[1], W, H, deg) })
  }

  function save() {
    if (!bitmap || !geo) return
    setError(null)
    startSave(async () => {
      const { rect } = geo
      const out = outputSize(rect)
      const canvas = document.createElement('canvas')
      canvas.width = out.width
      canvas.height = out.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setError('This browser could not draw the edit. Nothing was changed.')
        return
      }
      // A JPEG stays a JPEG. Anything else is written lossless with its alpha; the upload seam then
      // shrinks a big one and picks WebP when it really is transparent.
      const type = mime === 'image/jpeg' ? 'image/jpeg' : 'image/png'
      let blob: Blob | null = null
      try {
        ctx.imageSmoothingQuality = 'high'
        ctx.scale(out.scale, out.scale)
        ctx.translate(rect.w / 2 - rect.cx, rect.h / 2 - rect.cy)
        ctx.rotate((deg * Math.PI) / 180)
        ctx.drawImage(bitmap, -W / 2, -H / 2)
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92))
      } catch {
        blob = null
      }
      if (!blob) {
        setError('This browser could not encode the edit. Nothing was changed.')
        return
      }
      const file = new File([blob], `${slug || 'image'}-edit.${type === 'image/jpeg' ? 'jpg' : 'png'}`, { type })
      const prepared = await prepareImageForUpload(file)
      if ('error' in prepared) {
        setError(prepared.error)
        return
      }
      const fd = new FormData()
      fd.append('file', prepared.file)
      fd.append('note', editNote(geo.frame, geo.turns, geo.straighten))
      const res = await replaceLibraryAssetFile(assetId, fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      onSaved()
    })
  }

  const ready = !!bitmap && !!geo && scale > 0
  const r = geo?.rect
  // The crop box in stage pixels.
  const box = r
    ? {
        left: (bounds.w / 2 + r.cx - r.w / 2) * scale,
        top: (bounds.h / 2 + r.cy - r.h / 2) * scale,
        width: r.w * scale,
        height: r.h * scale,
      }
    : null

  return (
    <div data-loom-crop-editor className="space-y-3 rounded-card border border-border bg-surface-elevated/50 p-3">
      <p className="text-body-sm font-semibold text-text">Crop and rotate</p>

      <div ref={stageRef} className="flex min-h-40 w-full items-center justify-center">
        {loadError ? (
          <p className="px-2 text-center text-body-sm text-muted">
            This image could not be opened for editing. Try Replace file instead.
          </p>
        ) : !ready ? (
          <div className="h-40 w-full animate-pulse rounded-card bg-surface-elevated" />
        ) : (
          <div
            data-crop-frame
            className="relative select-none overflow-hidden rounded-card"
            style={{ width: dispW, height: dispH, touchAction: 'none' }}
          >
            <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />
            {box && (
              <>
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 bg-ink/50" style={{ height: box.top }} />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 bg-ink/50"
                  style={{ height: Math.max(0, dispH - box.top - box.height) }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-0 bg-ink/50"
                  style={{ top: box.top, height: box.height, width: box.left }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute right-0 bg-ink/50"
                  style={{ top: box.top, height: box.height, width: Math.max(0, dispW - box.left - box.width) }}
                />
                <div
                  role="group"
                  tabIndex={0}
                  aria-label="Crop area. Drag or use the arrow keys to move it, drag a corner to resize."
                  onPointerDown={(e) => beginDrag(e, null)}
                  onKeyDown={nudge}
                  className="absolute cursor-move border-2 border-on-ink ring-1 ring-ink/40"
                  style={box}
                >
                  {CORNERS.map((c) => (
                    <div
                      key={c}
                      aria-hidden
                      onPointerDown={(e) => beginDrag(e, c)}
                      className={cn(
                        'absolute h-4 w-4 rounded-pill border-2 border-on-ink bg-primary ring-1 ring-ink/30',
                        CORNER_CLS[c],
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {ready && geo && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-40 flex-1">
              <span className="mb-1 block eyebrow text-subtle">Frame</span>
              <Select
                value={geo.frame}
                disabled={saving}
                onChange={(e) =>
                  setGeo(freshGeometry(W, H, geo.turns, geo.straighten, e.target.value as CropFrameKey))
                }
              >
                {CROP_FRAMES.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </label>
            <IconButton
              label="Rotate left"
              variant="bordered"
              disabled={saving}
              onClick={() => setGeo(freshGeometry(W, H, geo.turns - 1, geo.straighten, geo.frame))}
            >
              <RotateCcw className="h-4 w-4" />
            </IconButton>
            <IconButton
              label="Rotate right"
              variant="bordered"
              disabled={saving}
              onClick={() => setGeo(freshGeometry(W, H, geo.turns + 1, geo.straighten, geo.frame))}
            >
              <RotateCw className="h-4 w-4" />
            </IconButton>
            <IconButton
              label="Start over"
              variant="bordered"
              disabled={saving}
              onClick={() => setGeo(freshGeometry(W, H, 0, 0, 'free'))}
            >
              <Undo2 className="h-4 w-4" />
            </IconButton>
          </div>

          <label className="block">
            <span className="mb-1 flex items-center justify-between eyebrow text-subtle">
              <span>Straighten</span>
              <span className="tabular-nums">{geo.straighten}°</span>
            </span>
            <input
              type="range"
              min={-45}
              max={45}
              step={0.5}
              value={geo.straighten}
              disabled={saving}
              onChange={(e) => setGeo(freshGeometry(W, H, geo.turns, Number(e.target.value), geo.frame))}
              className="w-full accent-primary"
            />
          </label>
        </>
      )}

      <p className="text-meta text-subtle">
        Saves over this asset and keeps every place it is used. The current file is kept as a version you can restore.
      </p>
      {error && <p className="text-meta text-danger">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={!ready} loading={saving}>
          Save edit
        </Button>
      </div>
    </div>
  )
}
