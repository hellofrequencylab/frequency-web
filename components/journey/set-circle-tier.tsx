'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setCircleTierAction } from '@/app/(main)/circles/actions'
import { isError } from '@/lib/action-result'
import { INTENSITY_TIERS, type IntensityTier } from '@/lib/journey-tiers'

// Host control: set the circle's default practice depth (Initiate / Adept / Master) for its
// members. A human who knows the room sets the tier, not an algorithm (docs/JOURNEYS.md §5).
// Members can still override their own depth per Journey. Mirrors SetCirclePractice.

const LABELS: Record<IntensityTier, string> = { initiate: 'Initiate', adept: 'Adept', master: 'Master' }

export function SetCircleTier({
  circleId,
  current,
}: {
  circleId: string
  /** The circle's saved default tier (a plain string from the DB; the action re-validates). */
  current?: string | null
}) {
  const [val, setVal] = useState<string>(current ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
      >
        <option value="">No default (members choose)</option>
        {INTENSITY_TIERS.map((t) => (
          <option key={t} value={t}>
            {LABELS[t]}
          </option>
        ))}
      </select>
      <button
        disabled={pending || val === (current ?? '')}
        onClick={() =>
          start(async () => {
            const res = await setCircleTierAction(circleId, (val || null) as IntensityTier | null)
            if (isError(res)) setErr(res.error)
            else {
              setErr(null)
              router.refresh()
            }
          })
        }
        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  )
}
