'use client'

import { useRef, useState, useTransition } from 'react'
import { labelClasses } from '@/components/ui/field'
import { ImageFocalPicker } from '@/components/ui/image-focal-picker'
import { updateChannelCoverFocus, updateChannelHeroHeight } from '@/app/(main)/channels/admin-actions'
import { DEFAULT_OBJECT_POSITION } from '@/lib/images/focal-point'
import { CHANNEL_HERO_HEIGHTS, type ChannelHeroHeight } from '@/lib/channels/hero'

// The Channel HEADER controls, the twin of EventHeaderControls: the cover FOCAL POINT (where the
// image sits inside its cropped hero window) beside the hero HEIGHT (Short / Standard / Tall).
// Both save into the topical_channels.theme jsonb bag, the same shape events use, so there is no
// column per setting and an untouched Channel stores {}.
//
// This exists because a Channel cover is usually a WORDMARK, and a center crop cuts it. The Meld
// Community Cowork cover is the case in point: a wide two-line logo whose lower line was cropped
// away with no operator control to move it.
//
// Height saves optimistically. Focus fires onChange continuously while dragging, so its write is
// DEBOUNCED: the marker tracks the pointer live and the save lands once the operator settles. The
// focus picker only appears when there is a cover to reposition, since positioning a gradient is
// meaningless.
export function ChannelHeaderControls({
  channelId,
  slug,
  imageUrl,
  initialFocus = DEFAULT_OBJECT_POSITION,
  initialHeight,
}: {
  channelId: string
  slug: string
  /** The current cover image URL, or null when the Channel falls back to its token gradient. */
  imageUrl: string | null
  initialFocus?: string
  initialHeight: ChannelHeroHeight
}) {
  const [focus, setFocus] = useState(initialFocus)
  const [height, setHeight] = useState<ChannelHeroHeight>(initialHeight)
  const [heightPending, startHeight] = useTransition()
  const [, startFocus] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Move the marker immediately, debounce the write so a drag is not one save per pixel. */
  function onFocusChange(next: string) {
    setFocus(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      startFocus(async () => {
        const res = await updateChannelCoverFocus(channelId, slug, next)
        setError(res && 'error' in res ? res.error : null)
      })
    }, 600)
  }

  function onHeightChange(next: ChannelHeroHeight) {
    const previous = height
    setHeight(next) // optimistic: the buttons must feel instant
    startHeight(async () => {
      const res = await updateChannelHeroHeight(channelId, slug, next)
      if (res && 'error' in res) {
        setHeight(previous) // put it back rather than showing a state we failed to save
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
              Drag to choose what stays in view when the cover is cropped. Useful when the image is
              a logo with text near an edge.
            </p>
          </div>
        )}

        <div className="space-y-1.5 sm:w-40">
          <span className={labelClasses}>Height</span>
          <div className="flex flex-wrap gap-1.5">
            {CHANNEL_HERO_HEIGHTS.map((h) => {
              const on = h.value === height
              return (
                <button
                  key={h.value}
                  type="button"
                  disabled={heightPending}
                  aria-pressed={on}
                  onClick={() => onHeightChange(h.value)}
                  className={
                    'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ' +
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
          <p className="text-2xs text-muted">How tall the band is on the Channel page.</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
