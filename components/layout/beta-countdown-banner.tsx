import { CalendarClock } from 'lucide-react'
import { betaEndsAt } from '@/lib/platform-flags'

// BETA COUNTDOWN BANNER — the in-product metered clock (platform_settings.beta_ends_at). A calm strip
// that shows how much of the Summer of Frequency is left. DARK UNTIL SET: betaEndsAt() returns null when
// the operator hasn't set a date (and on any read error), so this renders nothing today. Once a date is
// set, it counts down to it and quietly disappears the moment the date passes. Server component; one
// cached read. Voice per CONTENT-VOICE §10 (plain, no em dashes, proper noun carries the magic).

function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.ceil((toMs - fromMs) / 86_400_000))
}

export async function BetaCountdownBanner() {
  const ends = await betaEndsAt()
  if (!ends) return null
  // Request-time read via `new Date()` (the repo's server-render pattern; keeps react-hooks/purity happy,
  // unlike Date.now()). Past the end date: nothing to count down; the graduation flip owns what's next.
  const nowMs = new Date().getTime()
  if (ends.getTime() <= nowMs) return null

  const days = daysBetween(nowMs, ends.getTime())
  const dateLabel = ends.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
  const countLabel = days === 1 ? '1 day left' : `${days} days left`

  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary-bg/40 px-4 py-3"
    >
      <CalendarClock className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
      <p className="min-w-0 flex-1 text-sm leading-relaxed text-text">
        <span className="font-semibold">Summer of Frequency</span> runs through {dateLabel}.{' '}
        <span className="text-muted">Free the whole way, founder pricing stays locked.</span>
      </p>
      <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary-strong tabular-nums">
        {countLabel}
      </span>
    </div>
  )
}
