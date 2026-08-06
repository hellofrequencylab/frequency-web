'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { setTierCircleAction } from '@/lib/spaces/memberships-actions'
import { Select } from '@/components/ui/select'

// CIRCLE ACCESS panel (ADR-859): which of the Space's circles each membership tier includes.
// One row per tier with a circle select; a change saves immediately through the gated
// setTierCircleAction. Linking sweeps the tier's current active members into the circle, so
// the result line reports what actually happened (granted, and how many missed a full circle).
// The circle is the tier's communications hub: its events and its Message center audience.

export function MembershipCircleAccess({
  spaceId,
  tiers,
  circles,
}: {
  /** Passed to the action, which re-gates and re-validates ownership server-side (ADR-274). */
  spaceId: string
  /** The Space's tiers with their current link (space_membership_tiers.circle_id). */
  tiers: { id: string; name: string; circleId: string | null }[]
  /** The Space's own non-archived circles. */
  circles: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (tiers.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-3 py-4 text-center text-body-sm text-muted">
        No membership tiers yet. Create a tier above, then pick the circle it includes.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {tiers.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-text">{t.name}</span>
          {savingId === t.id && isPending && <Loader2 className="h-4 w-4 animate-spin text-subtle" />}
          <Select
            aria-label={`Circle included with ${t.name}`}
            value={t.circleId ?? ''}
            disabled={isPending}
            emptyLabel="No circle"
            wrapperClassName="inline-block w-max min-w-44 max-w-full"
            onChange={(e) => {
              const circleId = e.target.value || null
              setError(null)
              setNote(null)
              setSavingId(t.id)
              startTransition(async () => {
                const res = await setTierCircleAction(spaceId, t.id, circleId)
                if (isError(res)) {
                  setError(res.error)
                  return
                }
                if (circleId) {
                  const { granted, full } = res.data
                  setNote(
                    full > 0
                      ? `Linked. ${granted} current ${granted === 1 ? 'member' : 'members'} added; ${full} could not fit because the circle is full.`
                      : `Linked. ${granted} current ${granted === 1 ? 'member' : 'members'} added to the circle.`,
                  )
                } else {
                  setNote('Unlinked. Members the tier added were removed; anyone who joined on their own stays.')
                }
                router.refresh()
              })
            }}
          >
            {circles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      ))}
      {error && <p className="text-meta text-danger">{error}</p>}
      {note && <p className="text-meta text-muted">{note}</p>}
    </div>
  )
}
