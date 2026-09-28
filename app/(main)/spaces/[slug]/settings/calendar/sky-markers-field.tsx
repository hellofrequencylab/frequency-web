'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { isError } from '@/lib/action-result'
import { labelClasses } from '@/components/ui/field'
import { setSpaceSkyMarkers } from './entry-actions'

// THE SKY ON THIS SPACE'S CALENDAR, as a settings field (LIVE-526). One switch, on the Space
// settings page the calendar already lives on, beside Day notes and the time zone. It is NOT a
// second form: it saves through the calendar's own gated action, the same way those two do.
//
// OFF UNTIL SOMEONE SAYS OTHERWISE. Moon phases and the days the Sun changes sign suit some Spaces
// and would read as noise on a coworking or trades calendar, so nobody wakes up with them.
//
// The copy says what a member will see, in the words the calendar itself uses, rather than
// promising "astrology": what actually appears is a small glyph on the day with the full sentence
// as its label.

export function SkyMarkersField({
  slug,
  enabled,
  canEdit,
}: {
  slug: string
  enabled: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function save(next: boolean) {
    const previous = on
    setOn(next)
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await setSpaceSkyMarkers(slug, next)
      if (isError(res)) {
        // Put the switch back where it was: a control that stays flipped after a failed save tells
        // the operator something is on when it is not.
        setOn(previous)
        setError(res.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={on}
          disabled={!canEdit || pending}
          onChange={(e) => save(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded-control accent-primary"
        />
        <span>
          <span className={labelClasses}>Show the moon and the zodiac</span>
          <span className="mt-1 block text-body-sm text-muted">
            Marks new and full moons on your calendar, and the day the Sun enters each sign. The
            equinoxes and solstices ride along on the four days they fall on. Everyone who can see
            your calendar sees these.
          </span>
        </span>
      </label>
      {error ? <p className="text-body-sm text-danger">{error}</p> : null}
      {saved && !error ? <p className="text-body-sm text-muted">Saved.</p> : null}
    </div>
  )
}
