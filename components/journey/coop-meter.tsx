import { Radio } from 'lucide-react'
import { getCoopMeter } from '@/lib/journey-coop-rewards'
import { CoopStrip } from '@/components/journey/coop-strip'

// The Co-op shared meter (docs/JOURNEYS.md §9.1). When ≥3 active members of a circle hold this
// official Journey, it renders the group's shared progress: how many are in rhythm this week and
// how many have finished. Below the threshold (or off-season), it falls back to the lightweight
// companions strip. Async Server Component — wrap in <Suspense> at the call site. Token colors,
// no em dashes (CONTENT-VOICE).

export async function CoopMeter({
  profileId,
  planId,
  fallbackCompanions,
}: {
  profileId: string
  planId: string
  fallbackCompanions: number
}) {
  const meter = await getCoopMeter(profileId, planId).catch(() => null)
  if (!meter) return <CoopStrip companions={fallbackCompanions} />

  const rhythmPct = meter.size > 0 ? Math.round((meter.inRhythm / meter.size) * 100) : 0
  const earned = meter.inRhythm >= 3

  return (
    <section className="rounded-2xl border border-signal-bg bg-signal-bg/40 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-signal-bg text-signal-strong">
          <Radio className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold text-text">Your circle is in co-op</p>
        <span className="ml-auto shrink-0 text-xs font-medium text-muted">{meter.size} on this journey</span>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {meter.inRhythm} of {meter.size} in rhythm this week
          </span>
          {meter.completed > 0 && <span>{meter.completed} finished</span>}
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-elevated">
          <div
            className="h-full rounded-full bg-signal-strong transition-all"
            style={{ width: `${rhythmPct}%` }}
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {earned
            ? 'Three or more of you kept rhythm this week. Everyone earns the co-op bonus.'
            : 'Get three of you in rhythm in the same week, and everyone earns the co-op bonus.'}
        </p>
      </div>
    </section>
  )
}
