import { Sparkles } from 'lucide-react'

// One small pill that marks a card or map pin as a Starter Circle — a staff-made
// blueprint surfaced near the viewer that anyone can claim and make their own. The
// tell is a Sparkles ✦ in the primary (brand amber) tokens, distinct from the
// warning-gold Demo badge and the signal-teal Featured badge, so a Starter reads as
// "a good place to begin" without shouting. Presentational + server-friendly (no
// hooks), so it drops into the EntityCard `badge` slot in Server Components.
export function StarterBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="A Starter Circle. Claim it to make it your own."
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary-bg/60 px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-primary-strong ${className}`}
    >
      <Sparkles className="h-2.5 w-2.5 text-primary-strong" aria-hidden />
      Starter
    </span>
  )
}
