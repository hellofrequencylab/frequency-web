'use client'

import { useRef, useState, useTransition } from 'react'
import { labelClasses } from '@/components/ui/field'
import { ImageFocalPicker } from '@/components/ui/image-focal-picker'
import { updateEventCoverFocus, updateEventHeroHeight } from '@/app/(main)/events/admin-actions'
import { DEFAULT_OBJECT_POSITION } from '@/lib/images/focal-point'
import { EVENT_HERO_HEIGHTS, type EventHeroHeight } from '@/lib/events/hero-height'
import { measureCoverAspect } from '@/lib/events/cover-aspect'

// The event HEADER controls — one tidy section that pairs the cover FOCAL POINT (where the cover
// image sits inside its cropped hero window) with the hero HEIGHT (Short / Standard / Tall). Both
// save to the existing events.theme jsonb bag (coverFocus + heroHeight keys) — no new DB column.
//
// Combining them lets the two stay in sync: the focus picker sits on the LEFT and the height
// buttons on the RIGHT (they stack on a narrow panel). Height saves optimistically; focus drag
// fires onChange rapidly, so its save is DEBOUNCED (the marker moves live; the write lands once the
// creator settles). The focus picker only shows when there is a cover image to reposition.
//
// ── THE COVER'S OWN SHAPE IS CAPTURED HERE TOO (ADR-1248) ────────────────────────────────────────
// The picker paints the cover, so the browser has decoded it and knows its intrinsic size. When
// that image loads, its width / height is stored on events.theme.coverAspect through the same
// action the focus goes through, and the poster band on the event page sizes itself to it instead
// of to a tier-shaped guess. The measurement is free (no second decode, no server decode) and it
// re-runs every time the preview changes, which is every time the gallery re-crowns its first
// photo: a swapped cover re-measures itself the moment its preview appears. A write is only sent
// when the measured value differs from what is stored, so opening the panel costs nothing.
export function EventHeaderControls({
  eventId,
  slug,
  imageUrl,
  initialFocus = DEFAULT_OBJECT_POSITION,
  initialAspect = null,
  initialHeight,
}: {
  eventId: string
  slug: string
  /** The current cover/header image URL, or null when the event has no cover yet. */
  imageUrl: string | null
  initialFocus?: string
  /** The cover aspect already stored on events.theme (lib/events/cover-aspect.ts), or null. Used
   *  only to skip a write that would store what is already there. */
  initialAspect?: number | null
  initialHeight: EventHeroHeight
}) {
  const [focus, setFocus] = useState(initialFocus)
  const [height, setHeight] = useState<EventHeroHeight>(initialHeight)
  const [heightPending, startHeight] = useTransition()
  const [, startFocus] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // What the database holds (or is about to hold) for coverAspect, so a re-render of the same
  // cover does not re-send the same number.
  const storedAspect = useRef<number | null>(initialAspect)

  // Focus: move the marker live, debounce the write so a drag does not fire a save per pixel.
  function onFocusChange(next: string) {
    setFocus(next)
    setError(null)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      startFocus(async () => {
        const res = await updateEventCoverFocus(eventId, slug, next)
        if ('error' in res) setError(res.error)
      })
    }, 400)
  }

  // Aspect: the picker's <img> has decoded, so its natural size is the cover's real shape. Store it
  // beside the focus when it is new. A failed decode measures null and is NOT written: the band
  // then keeps whatever it had rather than a shape that describes nothing. `focus` here is the
  // render's current value: the picker takes a fresh callback on every render, so the load event
  // always sees the focus the marker shows.
  function onCoverLoad({ width, height: h }: { width: number; height: number }) {
    const measured = measureCoverAspect(width, h)
    if (measured === null || measured === storedAspect.current) return
    storedAspect.current = measured
    startFocus(async () => {
      const res = await updateEventCoverFocus(eventId, slug, focus, measured)
      if ('error' in res) setError(res.error)
    })
  }

  // Height: optimistic — set locally, roll back if the save fails.
  function pickHeight(next: EventHeroHeight) {
    if (next === height || heightPending) return
    const prev = height
    setHeight(next)
    setError(null)
    startHeight(async () => {
      const res = await updateEventHeroHeight(eventId, slug, next)
      if ('error' in res) {
        setHeight(prev)
        setError(res.error)
      }
    })
  }

  return (
    <div className="space-y-1.5">
      <span className={labelClasses}>Header</span>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-start">
        {/* LEFT — cover focus (the draggable crop preview). Constrained by the grid column, so the
            preview reads as a compact header crop rather than a full-width band. The Vertical +
            Horizontal sliders are hidden here (showSliders={false}) — the draggable marker, with
            arrow-key nudging, is the only control, which keeps the rail panel tidy. */}
        {imageUrl ? (
          <ImageFocalPicker
            imageUrl={imageUrl}
            value={focus}
            onChange={onFocusChange}
            onImageLoad={onCoverLoad}
            label="Cover focus"
            hint="Drag to choose which part of the cover stays in frame. Vertical matters most."
            showSliders={false}
          />
        ) : (
          <p className="text-2xs text-muted">
            Add a header photo above to choose where it sits in frame.
          </p>
        )}

        {/* RIGHT — hero height. Stacks under the picker on a narrow panel. */}
        <div className="space-y-1.5">
          <span className={labelClasses}>Hero height</span>
          <div className="flex flex-col gap-2">
            {EVENT_HERO_HEIGHTS.map((o) => {
              const active = o.value === height
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => pickHeight(o.value)}
                  disabled={heightPending}
                  aria-pressed={active}
                  className={`rounded-control border px-3 py-1.5 text-meta font-semibold transition-colors disabled:opacity-60 ${
                    active
                      ? 'border-primary-strong bg-primary-bg text-primary-strong'
                      : 'border-border bg-surface text-text hover:border-border-strong'
                  }`}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
          <p className="text-2xs text-muted">How tall the cover shows at the top of the event page.</p>
        </div>
      </div>

      {/* The standalone Header Preview band was removed: the header is previewed at the top of the
          gallery (the first photo IS the header), so a second preview in the rail was redundant. */}

      {error && <p className="text-meta font-medium text-danger">{error}</p>}
    </div>
  )
}
