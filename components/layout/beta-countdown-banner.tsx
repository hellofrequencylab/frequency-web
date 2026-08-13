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
// set, it counts down to it and quietly disappears the moment the date passes.
//
// 🔴 THE READ LIVES IN THE LAYOUT, NOT HERE (ADR-1030). This used to be an async component behind
// `<Suspense fallback={null}>`, which reserved NOTHING. On every request with a date set the shell
// painted, then the whole page jumped down by the banner's height the moment the read landed — the
// exact shift the boundary looks like it is preventing. A fixed-height fallback cannot fix it either:
// the copy wraps to two or three lines on a narrow viewport, so any number guessed here is wrong at
// some width.
//
// So the decision moves up. `app/(main)/layout.tsx` reads `betaEndsAt()` inside the parallel wave it
// already awaits (it costs no wall-clock: four other reads are in flight beside it) and mounts this
// only when there is a live countdown. Height is reserved by the banner itself, because the banner is
// already there in the first flush. Nothing is reserved when no date is set, so there is no gap either.
//
// That makes this a SYNCHRONOUS, presentational component: it is handed the date and renders it. It
// has no opinion about whether it should exist, which is why `betaCountdownEndsAt()` below is the one
// place that question is answered — the layout and this file cannot drift on it.

/**
 * The single predicate: is there a countdown to show RIGHT NOW, and if so, when does it end?
 *
 * Null when no date is set, when the stored value is unreadable, or when the date has already passed
 * (nothing to count down; the graduation flip owns what comes next). Callers render the banner if and
 * only if this returns a date, and hand that same date straight to it.
 *
 * Request-time "now" via `new Date()` — the repo's server-render pattern, which keeps
 * react-hooks/purity happy in a way `Date.now()` does not.
 */
export async function betaCountdownEndsAt(): Promise<Date | null> {
  const ends = await betaEndsAt()
  if (!ends) return null
  return ends.getTime() <= new Date().getTime() ? null : ends
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.ceil((toMs - fromMs) / 86_400_000))
}

export function BetaCountdownBanner({ ends }: { ends: Date }) {
  const nowMs = new Date().getTime()
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
