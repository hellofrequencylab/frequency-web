import { CalendarRange, Clock, LayoutGrid } from 'lucide-react'
import { summarizeAvailability, type AvailabilityWindow } from '@/lib/spaces/booking'

// OWNER AVAILABILITY SUMMARY (ENTITY-SPACES-SYSTEM section 2.4, booking v1). A small read-only card
// for the Practitioner availability console: it turns the windows the owner just published into an
// at-a-glance read of what members see, weekly slots offered, days covered, and the slot lengths in
// use. Pure derivation from the already-fetched windows (summarizeAvailability), so it adds no fetch
// and no write. When nothing is published yet it stays silent (the editor's own empty copy covers
// that case). Plain labels, no narrated feelings, no em/en dashes (CONTENT-VOICE section 10).

/** Format the distinct slot lengths as a plain phrase, e.g. "30 min" or "30 and 60 min". */
function slotLengthLabel(lengths: number[]): string {
  if (lengths.length === 0) return 'No slots set'
  if (lengths.length === 1) return `${lengths[0]} min`
  if (lengths.length === 2) return `${lengths[0]} and ${lengths[1]} min`
  const head = lengths.slice(0, -1).join(', ')
  return `${head}, and ${lengths[lengths.length - 1]} min`
}

export function BookingAvailabilitySummary({ windows }: { windows: AvailabilityWindow[] }) {
  // Nothing published yet: stay quiet. The editor below already names the empty state and next step.
  if (windows.length === 0) return null

  const summary = summarizeAvailability(windows)
  const stats = [
    {
      icon: LayoutGrid,
      value: String(summary.weeklySlots),
      label: summary.weeklySlots === 1 ? 'slot a week' : 'slots a week',
    },
    {
      icon: CalendarRange,
      value: String(summary.dayCount),
      label: summary.dayCount === 1 ? 'day covered' : 'days covered',
    },
    {
      icon: Clock,
      value: slotLengthLabel(summary.slotLengths),
      label: 'session length',
    },
  ]

  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-sm sm:grid-cols-3">
      {stats.map(({ icon: Icon, value, label }) => (
        <div key={label} className="flex items-center gap-3 bg-surface px-4 py-3.5">
          <Icon className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0">
            <dd className="truncate text-base font-bold tabular-nums text-text">{value}</dd>
            <dt className="text-xs text-muted">{label}</dt>
          </div>
        </div>
      ))}
    </dl>
  )
}
