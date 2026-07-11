'use client'

import { useState, useTransition } from 'react'
import { labelClasses } from '@/components/ui/field'
import { updateEventHeroHeight } from '@/app/(main)/events/admin-actions'
import { EVENT_HERO_HEIGHTS, type EventHeroHeight } from '@/lib/events/hero-height'

// The event page hero HEIGHT picker (Short / Standard / Tall), mirroring the Business Space cover
// hero control. Optimistic: it sets the choice locally and saves through updateEventHeroHeight
// (events.theme.heroHeight). Lives in the Images area of the event settings module.
export function EventHeroHeightControl({
  eventId,
  slug,
  initial,
}: {
  eventId: string
  slug: string
  initial: EventHeroHeight
}) {
  const [height, setHeight] = useState<EventHeroHeight>(initial)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function pick(next: EventHeroHeight) {
    if (next === height || pending) return
    const prev = height
    setHeight(next)
    setError(null)
    start(async () => {
      const res = await updateEventHeroHeight(eventId, slug, next)
      if ('error' in res) {
        setHeight(prev)
        setError(res.error)
      }
    })
  }

  return (
    <div className="space-y-1.5">
      <span className={labelClasses}>Hero height</span>
      <div className="grid grid-cols-3 gap-2">
        {EVENT_HERO_HEIGHTS.map((o) => {
          const active = o.value === height
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              disabled={pending}
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
      <p className="text-2xs text-subtle">How tall the cover image shows at the top of the event page.</p>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  )
}
