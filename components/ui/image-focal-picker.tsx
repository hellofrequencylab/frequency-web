'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { labelClasses } from '@/components/ui/field'
import {
  DEFAULT_OBJECT_POSITION,
  objectPositionToXY,
  xyToObjectPosition,
} from '@/lib/images/focal-point'

// ImageFocalPicker — a reusable control for choosing WHERE a cropped image sits in its frame.
// Cropped surfaces (hero/cover banners, cards) render with `object-cover`, which crops to center
// by default, so a face or a horizon often gets cut off. This picker lets a creator drag a marker
// over a live crop preview to set the focus; it outputs a CSS `object-position` string ("x% y%")
// that the render site applies with `style={{ objectPosition }}`.
//
// VERTICAL is the axis creators care about most (the header ask), so the crop preview is a wide
// band and a prominent vertical slider backs the drag target for accessibility + precision. Full
// 2D is supported (x + y); horizontal defaults to 50%. Controlled: pass `value` + `onChange`.
//
// Reusable by design — give it any image URL and it adopts the same control, so "any uploaded
// image" can gain a focal point later with one wiring.
export function ImageFocalPicker({
  imageUrl,
  value = DEFAULT_OBJECT_POSITION,
  onChange,
  aspect = 16 / 9,
  alt = '',
  disabled = false,
  label = 'Focal point',
  hint = 'Drag the marker to keep the important part of the photo in frame when it is cropped.',
  showSliders = true,
  className,
  heightClassName,
}: {
  /** The image to preview. Required — the picker is meaningless without it. */
  imageUrl: string
  /** Controlled `object-position` value ("x% y%"). Defaults to centered. */
  value?: string
  /** Notified with the next `object-position` string on every change. */
  onChange: (value: string) => void
  /** Crop-preview aspect ratio (width / height). Defaults to ~16:9, the common hero crop. Ignored when
   *  `heightClassName` is set (an explicit height then drives the frame instead of the aspect). */
  aspect?: number
  /** Alt text for the preview image (usually empty — this is a control, not content). */
  alt?: string
  disabled?: boolean
  /** Field label above the control. */
  label?: string
  /** Helper line under the control. Pass '' to hide. */
  hint?: string
  /** Show the Vertical + Horizontal sliders under the drag preview. Off leaves the draggable
   *  marker (plus arrow-key nudging) as the only control — used where the compact marker is
   *  enough and the sliders would crowd the panel (the event cover-focus control). */
  showSliders?: boolean
  className?: string
  /** An explicit Tailwind HEIGHT class (e.g. the hero's set height) for the crop frame. When set it drives
   *  the frame height and the `aspect` ratio is ignored, so the preview matches exactly what the render site
   *  paints (used by the Space header control to preview at the hero's chosen height). */
  heightClassName?: string
}) {
  const { x, y } = objectPositionToXY(value)
  const frameRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const vId = useId()
  const hId = useId()
  const objectPosition = xyToObjectPosition(x, y)

  // DETERMINISTIC SIZING (belt-and-suspenders, aspect path only) — the padding-bottom trick below sizes the
  // box to width / aspect purely in CSS, which is correct in every normal case. But it has silently failed
  // inside the admin rail before (an ancestor's layout stopped the % padding from resolving), leaving the
  // preview at the wrong height. So when we are on the `aspect` path (no explicit `heightClassName`) we ALSO
  // measure the box's real rendered WIDTH with a ResizeObserver and pin an explicit pixel height of
  // Math.round(width / aspect). This guarantees the frame is exactly width / aspect regardless of any ancestor
  // CSS. It re-measures whenever `aspect` changes (a Short/Medium/Tall switch) and on any resize. On the
  // explicit-height path (the event cover-focus control) it is skipped entirely, so that surface is untouched.
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null)
  useEffect(() => {
    if (heightClassName) return // explicit height drives the frame — leave it alone
    const el = frameRef.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setMeasuredHeight(Math.round(w / aspect))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect, heightClassName])

  // Emit a next value; clamping to 0–100 happens in xyToObjectPosition.
  const emit = useCallback(
    (nx: number, ny: number) => {
      if (disabled) return
      onChange(xyToObjectPosition(nx, ny))
    },
    [disabled, onChange],
  )

  // Map a pointer position to x/y percentages against the preview frame.
  const setFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = frameRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const px = ((clientX - rect.left) / rect.width) * 100
      const py = ((clientY - rect.top) / rect.height) * 100
      emit(px, py)
    },
    [emit],
  )

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return
    e.preventDefault()
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    setFromClientPoint(e.clientX, e.clientY)
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    setFromClientPoint(e.clientX, e.clientY)
  }
  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer may already be released */
    }
  }

  // Arrow keys nudge the marker: vertical is primary (Up/Down), horizontal secondary (Left/Right).
  // Shift takes a bigger step for a fast coarse move.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const step = e.shiftKey ? 10 : 2
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        emit(x, y - step)
        break
      case 'ArrowDown':
        e.preventDefault()
        emit(x, y + step)
        break
      case 'ArrowLeft':
        e.preventDefault()
        emit(x - step, y)
        break
      case 'ArrowRight':
        e.preventDefault()
        emit(x + step, y)
        break
      default:
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      {label && <span className={labelClasses}>{label}</span>}

      {/* CROP PREVIEW — the exact cropped window (object-cover) with the live object-position, so
          the creator sees precisely what stays in frame as they move the marker. */}
      <div
        ref={frameRef}
        role="group"
        aria-label={
          showSliders
            ? `${label}: drag to reposition, or use the arrow keys and sliders below`
            : `${label}: drag to reposition, or use the arrow keys`
        }
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        // The crop box is sized by the PADDING-BOTTOM percentage trick, not the CSS `aspect-ratio` property:
        // padding-bottom is a % of the element's WIDTH, so the box height = width / aspect at any width, in
        // every browser and inside any flex / grid / slide-over panel (aspect-ratio was silently not resizing
        // the preview in the admin rail). Once the ResizeObserver above has measured the real width we switch
        // to an EXPLICIT pixel height (width / aspect) so the box can never be left at a wrong height by an
        // ancestor that swallows the % padding — the padding trick is the pre-measure fallback (identical
        // shape, so there is no visible jump). The img + marker are absolutely positioned, so they fill the
        // box either way and the pointer math (getBoundingClientRect) stays correct. When an explicit
        // `heightClassName` is given it drives the height instead (both the padding and the measured height
        // are dropped).
        style={
          heightClassName
            ? undefined
            : measuredHeight != null
              ? { height: measuredHeight }
              : { paddingBottom: `${100 / aspect}%`, height: 0 }
        }
        className={cn(
          'relative w-full touch-none select-none overflow-hidden rounded-xl border border-border bg-surface-elevated outline-none',
          'focus-visible:ring-2 focus-visible:ring-border-strong/40',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair',
          heightClassName,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={alt}
          draggable={false}
          style={{ objectPosition }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        {/* Marker only — a high-contrast ring that reads over any photo. The crosshair guide lines
            were removed to declutter the preview; the marker alone shows the focal point clearly, and
            the sliders below give precise, accessible control. */}
        <div
          aria-hidden
          className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary/80 shadow-md ring-2 ring-black/30"
          style={{ left: `${x}%`, top: `${y}%` }}
        />
      </div>

      {/* VERTICAL slider — the primary, most-precise control and the accessible fallback for the
          drag target. 0 keeps the TOP of the photo, 100 keeps the BOTTOM. */}
      {showSliders && (
        <div className="space-y-1">
          <label htmlFor={vId} className="flex items-center justify-between text-2xs font-medium text-subtle">
            <span>Vertical focus</span>
            <span className="tabular-nums">{y}%</span>
          </label>
          <input
            id={vId}
            type="range"
            min={0}
            max={100}
            step={1}
            value={y}
            disabled={disabled}
            onChange={(e) => emit(x, Number(e.target.value))}
            className="w-full accent-primary disabled:opacity-50"
          />
        </div>
      )}

      {/* HORIZONTAL slider — secondary, for the rarer case where the crop needs a left/right nudge. */}
      {showSliders && (
        <div className="space-y-1">
          <label htmlFor={hId} className="flex items-center justify-between text-2xs font-medium text-subtle">
            <span>Horizontal focus</span>
            <span className="tabular-nums">{x}%</span>
          </label>
          <input
            id={hId}
            type="range"
            min={0}
            max={100}
            step={1}
            value={x}
            disabled={disabled}
            onChange={(e) => emit(Number(e.target.value), y)}
            className="w-full accent-primary disabled:opacity-50"
          />
        </div>
      )}

      {hint && <p className="text-2xs text-subtle">{hint}</p>}
    </div>
  )
}
