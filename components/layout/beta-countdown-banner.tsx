import { CalendarClock } from 'lucide-react'
import { betaEndsAt } from '@/lib/platform-flags'

// BETA COUNTDOWN BANNER — the in-product metered clock (platform_settings.beta_ends_at).
//
// 🔴 IT ANNOUNCES AN OFFER, NOT AN EXPIRY (owner, 2026-08-06). It used to read "Summer of Frequency
// runs through <date>. Free the whole way, your Opening Beta price stays locked." The owner's read:
// leading with free-then-a-date points at the moment we start charging, so the last thing a member
// takes from it is that something is being taken away. A countdown is going to imply a deadline no
// matter what; the fix is to make the thing that ends an OFFER they can still take rather than a
// free ride running out.
//
// So it leads with where we are (Beta), names the deal (**Founding Business**, the term
// lib/pricing/beta-notice already uses for the badge a Space earns by taking the yearly plan before
// this same date), and closes on what the member KEEPS rather than what stops. Voice per
// CONTENT-VOICE §10: plain sentences, no em dashes, the proper noun carries it, and no line tells
// the reader how to feel about any of it.
//
// DARK UNTIL SET: betaEndsAt() returns null when
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
      <p className="min-w-0 flex-1 text-body-sm leading-relaxed text-text">
        <span className="font-semibold">We are in Beta.</span> The Founding Business deal is open
        through {dateLabel}.{' '}
        <span className="text-muted">Your rate stays locked for as long as you keep the plan.</span>
      </p>
      <span className="shrink-0 rounded-pill bg-primary/10 px-2.5 py-1 text-meta font-semibold text-primary-strong tabular-nums">
        {countLabel}
      </span>
    </div>
  )
}
