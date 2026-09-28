'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { isError } from '@/lib/action-result'
import { Checkbox } from '@/components/ui/checkbox'
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
      {/* The Checkbox PRIMITIVE, not a hand-rolled input. check:adoption ratchets `raw-input` and a
          first draft of this field raised it by one; the primitive also brings the implicit label
          association, the disabled treatment and the global focus ring, all of which the raw
          version would have had to re-implement and only half did. */}
      <Checkbox
        checked={on}
        disabled={!canEdit || pending}
        onChange={(e) => save(e.target.checked)}
        label="Show the moon and the zodiac"
        hint="Marks new and full moons on your calendar, and the day the Sun enters each sign. The equinoxes and solstices ride along on the four days they fall on. Everyone who can see your calendar sees these."
      />
      {error ? <p className="text-body-sm text-danger">{error}</p> : null}
      {saved && !error ? <p className="text-body-sm text-muted">Saved.</p> : null}
    </div>
  )
}
