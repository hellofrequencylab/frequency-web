'use client'

import { useRef, useState, useTransition } from 'react'
import { labelClasses } from '@/components/ui/field'
import { ImageFocalPicker } from '@/components/ui/image-focal-picker'
import { updateEventCoverFocus } from '@/app/(main)/events/admin-actions'
import { DEFAULT_OBJECT_POSITION } from '@/lib/images/focal-point'

// The event cover FOCAL POINT picker — where the cover image sits inside its cropped hero window.
// Wraps the reusable ImageFocalPicker and saves through updateEventCoverFocus (events.theme
// .coverFocus). Lives in the Images area of the event settings module, under the cover + hero
// height. Only shown when there is a cover image to reposition. Drag fires onChange rapidly, so the
// save is DEBOUNCED (the marker moves live; the write lands once the creator settles).
export function EventCoverFocusControl({
  eventId,
  slug,
  imageUrl,
  initial = DEFAULT_OBJECT_POSITION,
}: {
  eventId: string
  slug: string
  imageUrl: string
  initial?: string
}) {
  const [focus, setFocus] = useState(initial)
  const [, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onChange(next: string) {
    setFocus(next)
    setError(null)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      start(async () => {
        const res = await updateEventCoverFocus(eventId, slug, next)
        if ('error' in res) setError(res.error)
      })
    }, 400)
  }

  return (
    <div className="space-y-1.5">
      <span className={labelClasses}>Cover focus</span>
      <ImageFocalPicker
        imageUrl={imageUrl}
        value={focus}
        onChange={onChange}
        label=""
        hint="Drag to choose which part of the cover stays in frame on the event page. Vertical matters most."
      />
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  )
}
