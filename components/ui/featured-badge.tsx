import { Star } from 'lucide-react'

// One small pill that marks an entity as operator-Featured (curated) — circles + events
// carry a `featured_at` an operator stamps from the admin list. The tell is a filled star in
// the signal (highlight) tokens, distinct from the warning-gold Demo badge, so a featured row
// reads as "the team picked this" without shouting. Presentational + server-friendly (no hooks),
// so it drops into the EntityCard `badge` slot in Server Components.
export function FeaturedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Featured by the Frequency team."
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-signal/30 bg-signal-bg/60 px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-signal-strong ${className}`}
    >
      <Star className="h-2.5 w-2.5 fill-signal-strong text-signal-strong" aria-hidden />
      Featured
    </span>
  )
}
