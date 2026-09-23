'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { labelClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { ZONE_CHOICES, zoneWords } from '@/lib/time/zone-words'
import { setSpaceTimeZone } from './entry-actions'

// THE SPACE'S TIME ZONE, as a settings field (LIVE-471). One control, on the Space settings page the
// calendar already lives on, beside Day notes. It is NOT a second form: it saves through the
// calendar's own gated action (setSpaceTimeZone in ./entry-actions), the same way Day notes saves
// through saveDayNote, and it writes the one column the console header and every new date read.
//
// THE MENU KEEPS WHAT IS STORED. A Space whose zone is not one of the named choices (it was
// backfilled from an event in an unusual zone, say) gets its own zone added to the list in its own
// plain words, so opening this page can never quietly rewrite a zone nobody was asked about.
//
// "Not set" is a real choice, not a placeholder: it clears the column, and the calendar goes back to
// reading the viewer's browser zone. The copy below says that out loud rather than leaving a person
// to discover it from a date landing in the wrong hour.

export function SpaceTimeZoneField({
  slug,
  timeZone,
  canEdit,
}: {
  slug: string
  /** The Space's stored zone, or null when it has never said. */
  timeZone: string | null
  canEdit: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState(timeZone ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const stored = timeZone ?? ''
  const options = [
    { value: '', label: 'Not set' },
    // The stored zone first when the menu does not already carry it, so it is never dropped.
    ...(stored && !ZONE_CHOICES.some((c) => c.value === stored)
      ? [{ value: stored, label: zoneWords(stored) }]
      : []),
    ...ZONE_CHOICES,
  ]

  const save = () => {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await setSpaceTimeZone(slug, value)
      if (isError(res)) setError(res.error)
      else {
        setSaved(true)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-3 rounded-card border border-border bg-surface p-4">
      <div>
        <h3 className="text-body font-semibold text-text">Time zone</h3>
        <p className="text-body-sm text-muted">
          The zone your calendar runs in. New dates you pencil in, and anything Vera proposes, are
          written in it wherever you happen to be that week.
        </p>
      </div>

      <div className="grid gap-1 sm:max-w-sm">
        <label htmlFor="space-time-zone" className={labelClasses}>
          Your calendar runs in
        </label>
        <Select
          id="space-time-zone"
          value={value}
          options={options}
          disabled={!canEdit || pending}
          onChange={(e) => {
            setValue(e.target.value)
            setSaved(false)
          }}
        />
        <p className="text-meta text-subtle">
          {value
            ? `New dates land in ${zoneWords(value)}.`
            : 'With no zone set, new dates land in whatever zone the browser you are on is in.'}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}

      {canEdit && (
        <div className="flex items-center justify-end gap-3">
          {saved && !pending && <span className="text-meta text-muted">Saved.</span>}
          <Button type="button" size="sm" onClick={save} disabled={pending || value === stored}>
            {pending ? 'Saving' : 'Save time zone'}
          </Button>
        </div>
      )}
    </div>
  )
}
