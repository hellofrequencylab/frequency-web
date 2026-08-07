import { CalendarClock } from 'lucide-react'
import { betaEndsAt } from '@/lib/platform-flags'

// BETA COUNTDOWN BANNER — the in-product metered clock (platform_settings.beta_ends_at).
//
// 🔴 WHAT ENDS IS THE RATE, NOT THE PRODUCT (owner, 2026-08-06, two passes). The original read
// "Summer of Frequency runs through <date>. Free the whole way, your Opening Beta price stays
// locked." The owner's read: leading with free-then-a-date points at the moment we start charging,
// so the last thing a member takes from it is that something is being taken away.
//
// The first rewrite over-corrected into "the deal is open through <date>", which softened the
// deadline out of a component whose whole job is to carry one. The owner's second pass put it back
// and named the subject precisely: it is the **Founding Business rate** that ends, not free access.
// That distinction is the entire point. A rate ending is a reason to act; free ending is a reason
// to leave.
//
// So the line leads with where we are (Beta), says plainly what stops and when, and closes on what
// a member who acts KEEPS. The closing clause is not reassurance for its own sake: it is factually
// load-bearing, because lib/pricing/beta-notice's own copy is "subscribe before <date> to hold the
// beta rate" — the date closes the WINDOW TO SUBSCRIBE, and anyone already subscribed keeps their
// price. Without that clause an existing subscriber reads "the rate ends" as their own bill going
// up, which is not what happens.
//
// **Founding Business** is capitalised as a proper noun because lib/pricing/beta-notice already
// treats it as one (the badge a Space earns by taking the yearly plan before this same date), and
// NAMING.md wins on names. Voice per CONTENT-VOICE §10: plain sentences, no em dashes (the owner's
// draft used a hyphen as a connector; a period does the same work without tripping the rule), the
// proper noun carries the weight, and no line tells the reader how to feel about any of it.
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
        <span className="font-semibold">We&rsquo;re in Beta.</span> The Founding Business rate ends{' '}
        {dateLabel}.{' '}
        <span className="text-muted">Lock it in before then and it stays your rate.</span>
      </p>
      <span className="shrink-0 rounded-pill bg-primary/10 px-2.5 py-1 text-meta font-semibold text-primary-strong tabular-nums">
        {countLabel}
      </span>
    </div>
  )
}
