import { Sprout } from 'lucide-react'

// One small pill that marks a browse card as a SEEDED, still-unclaimed listing — a listing the
// Frequency team seeded on a poster's behalf (owned by the Frequency account, carrying a live claim
// token) that no one has claimed yet. The tell is a little sprout in the primary tokens, distinct
// from the warning-gold Demo badge and the signal Featured badge, so a seeded row reads as "waiting
// for its poster" without shouting. Presentational + server-friendly (no hooks), so it drops into the
// EntityCard `badge` slot in Server Components and into the classifieds grid card alike.
export function UnclaimedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Seeded by Frequency. Live until the original poster claims it."
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary-bg/60 px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-primary-strong ${className}`}
    >
      <Sprout className="h-2.5 w-2.5 text-primary-strong" aria-hidden />
      Unclaimed
    </span>
  )
}
