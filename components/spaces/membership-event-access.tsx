'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { setSpaceEventAccess, type SpaceEventAccessRow } from '@/lib/events/space-event-access'
import { cn } from '@/lib/utils'
import { fieldClasses } from '@/components/ui/field'

// EVENT ACCESS panel (ADR-824): which of the Space's upcoming events a membership includes.
// One row per event with an audience select; a change saves immediately through the gated
// setSpaceEventAccess action, which manages the event's members-only FREE ticket (ADR-823).
// The same state is editable from each event's own ticket editor; both write the same rows.

export function MembershipEventAccess({
  spaceId,
  slug,
  rows,
  membershipTiers,
  allowed,
}: {
  spaceId: string
  /** The Space slug, for the locked hint's plans link. */
  slug: string
  rows: SpaceEventAccessRow[]
  membershipTiers: { id: string; name: string }[]
  /** Collective plan gate; false renders the locked hint instead of the selects. */
  allowed: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
        No upcoming events yet. Events your space hosts show here so you can include them with a
        membership.
      </p>
    )
  }

  if (!allowed) {
    // One plain sentence, one link (the house upsell pattern). Never a modal, never urgency.
    return (
      <p className="rounded-lg bg-surface px-3 py-2 text-sm text-muted">
        Including events with your membership comes with the Collective plan.{' '}
        <Link href={`/spaces/${slug}/settings/billing`} className="font-medium text-primary hover:underline">
          See plans
        </Link>
      </p>
    )
  }

  function save(eventId: string, audience: string) {
    setError(null)
    setSavingId(eventId)
    startTransition(async () => {
      const result = await setSpaceEventAccess(spaceId, eventId, audience as 'none' | 'members')
      setSavingId(null)
      if (isError(result)) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const whenFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="space-y-2">
      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
        {rows.map((r) => (
          <li key={r.eventId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <Link
                href={`/events/${r.slug}`}
                className="truncate text-sm font-semibold text-text underline-offset-2 hover:underline"
              >
                {r.title}
              </Link>
              <p className="text-xs text-muted">{whenFmt.format(new Date(r.startsAt))}</p>
            </div>
            <label className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted">Included for</span>
              <select
                value={r.audience}
                onChange={(e) => save(r.eventId, e.target.value)}
                disabled={isPending}
                className={cn(fieldClasses, 'w-56')}
              >
                <option value="none">Nobody (tickets only)</option>
                <option value="members">All members</option>
                {membershipTiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} members
                  </option>
                ))}
              </select>
              {savingId === r.eventId && isPending && (
                <Loader2 className="h-4 w-4 animate-spin text-muted" aria-hidden />
              )}
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-subtle">
        Included means the event gets a free Members ticket only that audience can claim. It shows
        on the join cards automatically, next to any paid tickets the event sells.
      </p>
    </div>
  )
}
