'use client'

import { useRef, useState, useTransition } from 'react'
import { labelClasses } from '@/components/ui/field'
import { ImageFocalPicker } from '@/components/ui/image-focal-picker'
import {
  updateCircleCoverFocus,
  updateCircleHeroHeight,
  updateCircleCoverScrim,
} from '@/app/(main)/circles/admin-actions'
import { DEFAULT_OBJECT_POSITION } from '@/lib/images/focal-point'
import { CIRCLE_HERO_HEIGHTS, type CircleHeroHeight } from '@/lib/circles/hero'
import { COVER_SCRIM_OPTIONS, type CoverScrim } from '@/lib/layout/cover-scrim'

// The Circle HEADER controls, the twin of ChannelHeaderControls (and EventHeaderControls before
// it): the cover FOCAL POINT (where the image sits inside its cropped hero window), the hero
// HEIGHT (Short / Standard / Tall), and the OVERLAY over the photo (None / Shade / Blend). All
// three save into the circles.theme jsonb bag, the same shape events and Channels use, so there is
// no column per setting and an untouched Circle stores {}.
//
// This exists because a Circle's cover (circles.image_url) renders as a plain center crop on the
// page hero, and a host had no control when the crop cut the part of the photo that matters — the
// same gap the owner called out on Channels ("basic setting for focus picker"), now closed here.
//
// THE OVERLAY is the Space control brought over unchanged (owner ask): the same three options, the
// same words for them, the same `coverScrim` key, read and merged through the same pure helpers
// (lib/layout/cover-scrim.ts). A host who has set up a Space already knows this control.
//
// Height and overlay save optimistically. Focus fires onChange continuously while dragging, so its
// write is DEBOUNCED: the marker tracks the pointer live and the save lands once the host settles.
// The focus picker only appears when there is a cover to reposition, since positioning a gradient is
// meaningless.
export function CircleHeaderControls({
  circleId,
  slug,
  imageUrl,
  initialFocus = DEFAULT_OBJECT_POSITION,
  initialHeight,
  initialScrim,
}: {
  circleId: string
  slug: string
  /** The current cover image URL, or null when the Circle falls back to its token gradient. */
  imageUrl: string | null
  initialFocus?: string
  initialHeight: CircleHeroHeight
  initialScrim: CoverScrim
}) {
  const [focus, setFocus] = useState(initialFocus)
  const [height, setHeight] = useState<CircleHeroHeight>(initialHeight)
  const [scrim, setScrim] = useState<CoverScrim>(initialScrim)
  const [heightPending, startHeight] = useTransition()
  const [scrimPending, startScrim] = useTransition()
  const [, startFocus] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Move the marker immediately, debounce the write so a drag is not one save per pixel. */
  function onFocusChange(next: string) {
    setFocus(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      startFocus(async () => {
        const res = await updateCircleCoverFocus(circleId, slug, next)
        setError(res && 'error' in res ? res.error : null)
      })
    }, 600)
  }

  function onHeightChange(next: CircleHeroHeight) {
    const previous = height
    setHeight(next) // optimistic: the buttons must feel instant
    startHeight(async () => {
      const res = await updateCircleHeroHeight(circleId, slug, next)
      if (res && 'error' in res) {
        setHeight(previous) // put it back rather than showing a state we failed to save
        setError(res.error)
      } else {
        setError(null)
      }
    })
  }

  function onScrimChange(next: CoverScrim) {
    const previous = scrim
    setScrim(next) // optimistic, same as height
    startScrim(async () => {
      const res = await updateCircleCoverScrim(circleId, slug, next)
      if (res && 'error' in res) {
        setScrim(previous)
        setError(res.error)
      } else {
        setError(null)
      }
    })
  }

  return (
    <div className="space-y-3 rounded-card border border-border bg-surface-elevated/40 p-3">
      <span className={labelClasses}>Header</span>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {imageUrl && (
          <div className="min-w-0 flex-1 space-y-1.5">
            <ImageFocalPicker imageUrl={imageUrl} value={focus} onChange={onFocusChange} />
            <p className="text-2xs text-muted">
              Drag to choose what stays in view when the cover is cropped. Useful when the
              important part of the photo sits near an edge.
            </p>
          </div>
        )}

        <div className="space-y-1.5 sm:w-40">
          <span className={labelClasses}>Height</span>
          <div className="flex flex-wrap gap-1.5">
            {CIRCLE_HERO_HEIGHTS.map((h) => {
              const on = h.value === height
              return (
                <button
                  key={h.value}
                  type="button"
                  disabled={heightPending}
                  aria-pressed={on}
                  onClick={() => onHeightChange(h.value)}
                  className={
                    'rounded-control px-2.5 py-1.5 text-meta font-semibold transition-colors disabled:opacity-40 ' +
                    (on
                      ? 'bg-primary text-on-primary'
                      : 'border border-border bg-surface text-text hover:border-border-strong')
                  }
                >
                  {h.label}
                </button>
              )
            })}
          </div>
          <p className="text-2xs text-muted">How tall the band is on the circle page.</p>
        </div>
      </div>

      {/* Overlay — what sits between the photo and the circle name on top of it. Only meaningful
          once there is a photo: with no cover the hero draws its token gradient and there is
          nothing to shade. */}
      {imageUrl && (
        <div className="space-y-1.5">
          <span className={labelClasses} id="circle-overlay-label">
            Overlay
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="circle-overlay-label">
            {COVER_SCRIM_OPTIONS.map((o) => {
              const on = o.value === scrim
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={scrimPending}
                  aria-pressed={on}
                  title={o.tagline}
                  onClick={() => onScrimChange(o.value)}
                  className={
                    'rounded-control px-2.5 py-1.5 text-meta font-semibold transition-colors disabled:opacity-40 ' +
                    (on
                      ? 'bg-primary text-on-primary'
                      : 'border border-border bg-surface text-text hover:border-border-strong')
                  }
                >
                  {o.label}
                </button>
              )
            })}
          </div>
          <p className="text-2xs text-muted">
            {COVER_SCRIM_OPTIONS.find((o) => o.value === scrim)?.tagline}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-meta font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
