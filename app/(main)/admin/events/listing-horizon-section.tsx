'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/field'
import { saveEventsListingHorizon } from './series-actions'

// The operator control for how far ahead /events looks (owner ruling 2026-08-20). One integer, one
// save, no deploy. Models series-display-section.tsx beside it: a local editable copy, save on the
// button, an inline confirmation that echoes the STORED value rather than what was typed.
//
// WHY IT EXISTS: the horizon was a hardcoded 60 days. A host published a gathering 64 days out and
// it never listed, with no explanation on the listing, the event page, or the host's own library.
//
// 0 IS THE DEFAULT AND MEANS NO CAP. The copy says so in the field itself, because a number field
// where zero means "unlimited" is a trap otherwise. No max: a large number is already a no-op.
//
// Nothing here imports @/lib/platform-flags — that module reaches the service-role client, and this
// is a client component. It takes the current number as a prop and calls the server action.
export function ListingHorizonSection({ days }: { days: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [value, setValue] = useState(days)
  const [stored, setStored] = useState<number | null>(null)

  function save() {
    setStored(null)
    start(async () => {
      const next = await saveEventsListingHorizon(value)
      // Snap the input back to what was actually stored, so the form never shows a number the
      // listing is not using.
      setValue(next)
      setStored(next)
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="space-y-4">
        <label className="block">
          <span className="block text-body-sm font-semibold text-text">Days ahead</span>
          <span className="mt-0.5 block text-meta text-muted">0 shows every upcoming event</span>
          <Input
            type="number"
            value={value}
            min={0}
            step={1}
            disabled={pending}
            onChange={(e) => setValue(Number(e.target.value))}
            className="mt-2 w-24 px-2.5 py-1.5 tabular-nums"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-body-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {pending ? 'Saving' : 'Save'}
          </button>
          {stored !== null && (
            <p role="status" className="text-body-sm text-muted">
              {stored === 0
                ? 'Saved. Events lists every upcoming event, however far out it is.'
                : `Saved. Events lists gatherings up to ${stored} ${stored === 1 ? 'day' : 'days'} ahead.`}
            </p>
          )}
        </div>

        <p className="text-meta text-subtle">
          A number here hides anything further out than that, and the host is never told why, so
          leave it at 0 unless you have a reason. Listings pick the new number up on their next
          render. Saving here refreshes them for you.
        </p>
      </div>
    </div>
  )
}
