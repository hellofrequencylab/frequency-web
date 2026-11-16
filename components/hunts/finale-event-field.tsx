'use client'

// THE FINALE PICKER (FH-031S): the author chooses the host Event a trail ends at, in the editor's
// publish step. The field is the HUNT manifest's `finaleEventId`; the choices are loaded on the server
// (lib/hunts/finale-store.ts `loadFinaleEventOptions`): upcoming Events of the Hunt's own Space or of a
// live partner. Publish checks the choice again. Picking an Event holds no place at it for anyone.

import { FieldControl, StudioField } from '@/components/studio/spark'
import { HUNT_MANIFEST } from '@/lib/studio/entities/hunt'

const FIELD = HUNT_MANIFEST.fields.find((f) => f.path === 'finaleEventId')

export function FinaleEventField({ options, value, onChange, disabled }: {
  options: readonly { value: string; label: string }[]
  value: string | undefined
  onChange: (eventId: string | undefined) => void
  disabled: boolean
}) {
  // Nothing to choose and nothing chosen: the trail simply has no finale, and the field stays out of the way.
  if (!FIELD || (options.length === 0 && !value)) return null
  // An Event chosen earlier that is no longer offered stays visible, so the author can see it and clear it.
  const choices = value && !options.some((o) => o.value === value) ? [{ value, label: 'An event that is no longer available' }, ...options] : options
  return (
    <StudioField label={FIELD.label}>
      <FieldControl
        def={FIELD}
        loaded={{ finaleEvents: choices }}
        value={value ?? ''}
        onChange={(v) => onChange((Array.isArray(v) ? v[0] : v) || undefined)}
        disabled={disabled}
      />
      <p className="mt-1 text-body-sm text-subtle">
        The trail ends at this event. Finishing the trail does not hold a place there: players still need their own ticket or RSVP.
      </p>
    </StudioField>
  )
}
