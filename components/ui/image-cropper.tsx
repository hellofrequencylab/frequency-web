'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

// ImageCropper — an interactive, canvas-free crop control for baking a cropped image into a File.
// Email clients cannot crop, so a crop chosen here must be flattened to real pixels: the user drags
// and resizes a crop rectangle over a scaled preview, and on Apply we draw the selected SOURCE-pixel
// region to an offscreen <canvas> at the image's NATURAL resolution and hand back a JPEG/PNG File.
//
// No external crop library — a plain preview <img> + an overlay rectangle driven by pointer events.
// The displayed crop rect is mapped back to natural pixels via a single scale factor, so output is
// full-resolution, never downscaled to the preview size.

const MAX_PREVIEW_WIDTH = 520
const MAX_PREVIEW_HEIGHT = 520
const MIN_CROP_PX = 24 // minimum crop size in preview pixels, so a handle stays grabbable

type Handle = 'nw' | 'ne' | 'sw' | 'se'
type DragMode = { kind: 'move' } | { kind: 'resize'; handle: Handle }

// The crop rectangle, in PREVIEW pixels (origin = top-left of the displayed image).
type Rect = { x: number; y: number; w: number; h: number }

const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se']

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function ImageCropper({
  src,
  aspect,
  fileName,
  onCancel,
  onCropped,
}: {
  /** Image URL to crop. May be cross-origin — the loader sets crossOrigin so the canvas is not tainted. */
  src: string
  /** Optional width / height. When set, the crop box is locked to this ratio; otherwise freeform. */
  aspect?: number
  /** Optional base name for the produced File (default 'crop'). */
  fileName?: string
  onCancel: () => void
  /** Called with a JPEG (or PNG fallback) File of the cropped region. */
  onCropped: (file: File) => void
}) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  // Natural pixel size of the loaded image, and the scale factor from natural -> preview.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [display, setDisplay] = useState<{ w: number; h: number } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  // Live drag state — kept in a ref so pointer handlers stay stable and do not re-bind mid-drag.
  const dragRef = useRef<{
    mode: DragMode
    startX: number
    startY: number
    startRect: Rect
  } | null>(null)

  // Build the initial, centered crop rectangle for a given displayed size. When aspect is set the
  // box is the largest centered rectangle of that ratio that fits; otherwise it is 80% of the frame.
  const initialRect = useCallback(
    (dw: number, dh: number): Rect => {
      if (aspect && aspect > 0) {
        let w = dw
        let h = w / aspect
        if (h > dh) {
          h = dh
          w = h * aspect
        }
        w *= 0.9
        h *= 0.9
        return { x: (dw - w) / 2, y: (dh - h) / 2, w, h }
      }
      const w = dw * 0.8
      const h = dh * 0.8
      return { x: (dw - w) / 2, y: (dh - h) / 2, w, h }
    },
    [aspect],
  )

  // Reset while a new src loads, and reseed the crop when aspect changes — the canonical React
  // "adjust state on prop change" pattern (compare against state stored on the previous render, set
  // synchronously in the render body). React re-renders immediately, avoiding a setState-in-effect.
  const [prevSrc, setPrevSrc] = useState(src)
  const [prevAspect, setPrevAspect] = useState(aspect)
  if (prevSrc !== src) {
    setPrevSrc(src)
    setPrevAspect(aspect)
    setError(false)
    setNatural(null)
    setDisplay(null)
    setRect(null)
  } else if (prevAspect !== aspect) {
    setPrevAspect(aspect)
    if (display) setRect(initialRect(display.w, display.h))
  }

  // Load the image (crossOrigin='anonymous' so drawing it to a canvas does not taint the canvas),
  // then compute the preview size bounded to MAX_PREVIEW_WIDTH/HEIGHT and seed the crop rectangle.
  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      if (cancelled) return
      const nw = img.naturalWidth
      const nh = img.naturalHeight
      if (!nw || !nh) {
        setError(true)
        return
      }
      const scale = Math.min(MAX_PREVIEW_WIDTH / nw, MAX_PREVIEW_HEIGHT / nh, 1)
      const dw = Math.round(nw * scale)
      const dh = Math.round(nh * scale)
      imgRef.current = img
      setNatural({ w: nw, h: nh })
      setDisplay({ w: dw, h: dh })
      setRect(initialRect(dw, dh))
    }
    img.onerror = () => {
      if (!cancelled) setError(true)
    }
    img.src = src

    return () => {
      cancelled = true
    }
  }, [src, initialRect])

  // The window-level drag listeners, kept in refs so endDrag removes EXACTLY what beginDrag added. Driving the
  // drag off window listeners (not element pointer-capture) is the fix for issue #4: a fast release off the
  // tiny handle could miss the element's pointerup, leaving dragRef set so the box kept following the cursor
  // until an unrelated re-render. A window pointerup / pointercancel always ends the drag.
  const moveListener = useRef<((e: PointerEvent) => void) | null>(null)
  const endListener = useRef<((e: PointerEvent) => void) | null>(null)

  const endDrag = useCallback(() => {
    dragRef.current = null
    if (moveListener.current) window.removeEventListener('pointermove', moveListener.current)
    if (endListener.current) {
      window.removeEventListener('pointerup', endListener.current)
      window.removeEventListener('pointercancel', endListener.current)
    }
    moveListener.current = null
    endListener.current = null
  }, [])

  // Map a pointer position to the next crop rect for the active drag. Reads the (frozen) start state from the
  // drag ref plus the current display/aspect; never reads `rect`, so a burst of moves never captures a stale
  // rectangle. Called by the window pointermove listener.
  const applyMove = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current
      if (!drag || !display) return
      const dx = clientX - drag.startX
      const dy = clientY - drag.startY
      const { w: dw, h: dh } = display
      const start = drag.startRect

      if (drag.mode.kind === 'move') {
        const nx = clamp(start.x + dx, 0, dw - start.w)
        const ny = clamp(start.y + dy, 0, dh - start.h)
        setRect({ x: nx, y: ny, w: start.w, h: start.h })
        return
      }

      // Resize. Anchor the corner OPPOSITE the dragged handle so it stays pinned.
      const handle = drag.mode.handle
      const right = start.x + start.w
      const bottom = start.y + start.h
      const anchorX = handle === 'nw' || handle === 'sw' ? right : start.x
      const anchorY = handle === 'nw' || handle === 'ne' ? bottom : start.y
      // The moving corner, clamped to the frame.
      let cornerX = clamp((handle === 'nw' || handle === 'sw' ? start.x : right) + dx, 0, dw)
      let cornerY = clamp((handle === 'nw' || handle === 'ne' ? start.y : bottom) + dy, 0, dh)

      let newW = Math.abs(cornerX - anchorX)
      let newH = Math.abs(cornerY - anchorY)

      if (aspect && aspect > 0) {
        // Lock to ratio: pick the dominant axis, derive the other, then clamp so the box still fits.
        if (newW / aspect >= newH) {
          newH = newW / aspect
        } else {
          newW = newH * aspect
        }
        // If the ratio-locked box would spill past the anchored corner, shrink to fit both axes.
        const maxW = handle === 'nw' || handle === 'sw' ? anchorX : dw - anchorX
        const maxH = handle === 'nw' || handle === 'ne' ? anchorY : dh - anchorY
        if (newW > maxW) {
          newW = maxW
          newH = newW / aspect
        }
        if (newH > maxH) {
          newH = maxH
          newW = newH * aspect
        }
      }

      newW = Math.max(newW, MIN_CROP_PX)
      newH = Math.max(newH, aspect && aspect > 0 ? MIN_CROP_PX / aspect : MIN_CROP_PX)

      // Recompute the moving corner from the (possibly ratio-adjusted) size, keeping the anchor fixed.
      cornerX = handle === 'nw' || handle === 'sw' ? anchorX - newW : anchorX + newW
      cornerY = handle === 'nw' || handle === 'ne' ? anchorY - newH : anchorY + newH

      const x = Math.min(anchorX, cornerX)
      const y = Math.min(anchorY, cornerY)
      setRect({
        x: clamp(x, 0, dw - newW),
        y: clamp(y, 0, dh - newH),
        w: newW,
        h: newH,
      })
    },
    [display, aspect],
  )

  const beginDrag = useCallback(
    (e: React.PointerEvent, mode: DragMode) => {
      if (!rect) return
      e.preventDefault()
      e.stopPropagation()
      dragRef.current = { mode, startX: e.clientX, startY: e.clientY, startRect: rect }
      // Add window listeners for THIS drag and remember them so endDrag removes exactly these. A release
      // anywhere (window pointerup / pointercancel) ends the drag, so a click-drag-release is always clean.
      const move = (ev: PointerEvent) => applyMove(ev.clientX, ev.clientY)
      const end = () => endDrag()
      moveListener.current = move
      endListener.current = end
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', end)
      window.addEventListener('pointercancel', end)
    },
    [rect, applyMove, endDrag],
  )

  // Safety net: drop any live drag listeners if the cropper unmounts mid-drag.
  useEffect(() => endDrag, [endDrag])

  // Apply — map the preview rect to natural pixels, draw that region to an offscreen canvas at full
  // resolution, and hand back a File. Guards a tainted canvas / null blob by cancelling cleanly.
  const apply = useCallback(async () => {
    const img = imgRef.current
    if (!img || !rect || !natural || !display || busy) return
    setBusy(true)

    const scaleX = natural.w / display.w
    const scaleY = natural.h / display.h
    const sx = clamp(Math.round(rect.x * scaleX), 0, natural.w)
    const sy = clamp(Math.round(rect.y * scaleY), 0, natural.h)
    const sw = clamp(Math.round(rect.w * scaleX), 1, natural.w - sx)
    const sh = clamp(Math.round(rect.h * scaleY), 1, natural.h - sy)

    try {
      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sh
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setBusy(false)
        onCancel()
        return
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

      const base = fileName ?? 'crop'
      const blob = await new Promise<Blob | null>((resolve) => {
        // Prefer JPEG for size; if the browser refuses the type it returns null and we retry PNG.
        canvas.toBlob(
          (b) => {
            if (b) resolve(b)
            else canvas.toBlob((p) => resolve(p), 'image/png')
          },
          'image/jpeg',
          0.9,
        )
      })

      if (!blob) {
        setBusy(false)
        onCancel()
        return
      }
      const ext = blob.type === 'image/png' ? 'png' : 'jpg'
      const file = new File([blob], `${base}.${ext}`, { type: blob.type || 'image/jpeg' })
      setBusy(false)
      onCropped(file)
    } catch {
      // Tainted canvas (cross-origin without CORS) throws on toBlob — fail closed.
      setBusy(false)
      onCancel()
    }
  }, [rect, natural, display, busy, fileName, onCropped, onCancel])

  return (
    <div className="space-y-4">
      {error ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface-elevated p-6 text-center">
          <p className="text-sm text-muted">That image could not be loaded for cropping.</p>
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            Close
          </Button>
        </div>
      ) : !display || !rect ? (
        <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-border bg-surface-elevated p-6">
          <p className="text-sm text-muted">Loading image...</p>
        </div>
      ) : (
        <>
          <div className="flex justify-center">
            <div
              ref={frameRef}
              className="relative select-none overflow-hidden rounded-xl border border-border bg-surface-elevated"
              style={{ width: display.w, height: display.h, touchAction: 'none' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full select-none"
              />

              {/* Dimmed mask outside the crop — four bands around the selection so the crop reads clearly. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 bg-black/50"
                style={{ height: rect.y }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/50"
                style={{ height: display.h - (rect.y + rect.h) }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute left-0 bg-black/50"
                style={{ top: rect.y, height: rect.h, width: rect.x }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute right-0 bg-black/50"
                style={{ top: rect.y, height: rect.h, width: display.w - (rect.x + rect.w) }}
              />

              {/* Crop rectangle — draggable body (move) with corner handles (resize). */}
              <div
                role="group"
                aria-label="Crop selection. Drag to move, drag a corner to resize."
                onPointerDown={(e) => beginDrag(e, { kind: 'move' })}
                className="absolute cursor-move border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
              >
                {HANDLES.map((handle) => {
                  const pos: Record<Handle, string> = {
                    nw: '-left-1.5 -top-1.5 cursor-nwse-resize',
                    ne: '-right-1.5 -top-1.5 cursor-nesw-resize',
                    sw: '-left-1.5 -bottom-1.5 cursor-nesw-resize',
                    se: '-right-1.5 -bottom-1.5 cursor-nwse-resize',
                  }
                  return (
                    <div
                      key={handle}
                      onPointerDown={(e) => beginDrag(e, { kind: 'resize', handle })}
                      className={cn(
                        'absolute h-3 w-3 rounded-full border-2 border-white bg-primary shadow ring-1 ring-black/30',
                        pos[handle],
                      )}
                    />
                  )
                })}
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-muted">
            Drag the box to move it, or drag a corner to resize.
            {aspect ? ' The crop stays locked to a fixed shape.' : ''}
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={apply} disabled={busy}>
              {busy ? 'Working...' : 'Apply crop'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
