'use client'

import { useCallback, useId, useRef } from 'react'
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
  className,
}: {
  /** The image to preview. Required — the picker is meaningless without it. */
  imageUrl: string
  /** Controlled `object-position` value ("x% y%"). Defaults to centered. */
  value?: string
  /** Notified with the next `object-position` string on every change. */
  onChange: (value: string) => void
  /** Crop-preview aspect ratio (width / height). Defaults to ~16:9, the common hero crop. */
  aspect?: number
  /** Alt text for the preview image (usually empty — this is a control, not content). */
  alt?: string
  disabled?: boolean
  /** Field label above the control. */
  label?: string
  /** Helper line under the control. Pass '' to hide. */
  hint?: string
  className?: string
}) {
  const { x, y } = objectPositionToXY(value)
  const frameRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const vId = useId()
  const hId = useId()
  const objectPosition = xyToObjectPosition(x, y)

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
        aria-label={`${label}: drag to reposition, or use the arrow keys and sliders below`}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        style={{ aspectRatio: String(aspect) }}
        className={cn(
          'relative w-full touch-none select-none overflow-hidden rounded-xl border border-border bg-surface-elevated outline-none',
          'focus-visible:ring-2 focus-visible:ring-border-strong/40',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair',
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

      {/* HORIZONTAL slider — secondary, for the rarer case where the crop needs a left/right nudge. */}
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

      {hint && <p className="text-2xs text-subtle">{hint}</p>}
    </div>
  )
}
