'use client'

import { useRef, useState, useTransition } from 'react'
import { labelClasses } from '@/components/ui/field'
import { ImageFocalPicker } from '@/components/ui/image-focal-picker'
import { updateEventCoverFocus, updateEventHeroHeight } from '@/app/(main)/events/admin-actions'
import { DEFAULT_OBJECT_POSITION } from '@/lib/images/focal-point'
import {
  EVENT_HERO_HEIGHTS,
  eventHeroHeightClass,
  type EventHeroHeight,
} from '@/lib/events/hero-height'

// The event HEADER controls — one tidy section that pairs the cover FOCAL POINT (where the cover
// image sits inside its cropped hero window) with the hero HEIGHT (Short / Standard / Tall). Both
// save to the existing events.theme jsonb bag (coverFocus + heroHeight keys) — no new DB column.
//
// Combining them lets the two stay in sync: the focus picker sits on the LEFT and the height
// buttons on the RIGHT (they stack on a narrow panel). Height saves optimistically; focus drag
// fires onChange rapidly, so its save is DEBOUNCED (the marker moves live; the write lands once the
// creator settles). The focus picker only shows when there is a cover image to reposition.
export function EventHeaderControls({
  eventId,
  slug,
  imageUrl,
  initialFocus = DEFAULT_OBJECT_POSITION,
  initialHeight,
}: {
  eventId: string
  slug: string
  /** The current cover/header image URL, or null when the event has no cover yet. */
  imageUrl: string | null
  initialFocus?: string
  initialHeight: EventHeroHeight
}) {
  const [focus, setFocus] = useState(initialFocus)
  const [height, setHeight] = useState<EventHeroHeight>(initialHeight)
  const [heightPending, startHeight] = useTransition()
  const [, startFocus] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
            label="Cover focus"
            hint="Drag to choose which part of the cover stays in frame. Vertical matters most."
            showSliders={false}
          />
        ) : (
          <p className="text-2xs text-subtle">
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
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
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
          <p className="text-2xs text-subtle">How tall the cover shows at the top of the event page.</p>
        </div>
      </div>

      {/* LIVE HEADER PREVIEW — the real hero band, at the chosen height with the chosen focus, so a
          change to either control updates this the moment it happens. Mirrors the event page hero
          (eventHeroHeightClass + object-cover + objectPosition); the no-cover gradient matches the
          page's placeholder fill. */}
      <div className="space-y-1.5 pt-1">
        <span className={labelClasses}>Header preview</span>
        {imageUrl ? (
          <div
            className={`relative w-full overflow-hidden rounded-2xl border border-border bg-surface-elevated ${eventHeroHeightClass(height)}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              style={{ objectPosition: focus }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        ) : (
          <div
            className={`flex w-full items-center justify-center overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary-bg via-surface-elevated to-signal-bg ${eventHeroHeightClass(height)}`}
          >
            <span className="text-2xs font-medium text-subtle">No header photo yet</span>
          </div>
        )}
        <p className="text-2xs text-subtle">How the header looks at the top of the event page.</p>
      </div>

      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  )
}
