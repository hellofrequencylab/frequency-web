import { Sprout } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// One small pill that marks a browse card as a SEEDED, still-unclaimed listing — a listing the
// Frequency team seeded on a poster's behalf (owned by the Frequency account, carrying a live claim
// token) that no one has claimed yet. The tell is a little sprout in the primary tokens, distinct
// from the warning-gold Demo badge and the signal Featured badge, so a seeded row reads as "waiting
// for its poster" without shouting. Presentational + server-friendly (no hooks), so it drops into the
// EntityCard `badge` slot in Server Components and into the classifieds grid card alike.
//
// Composes the shared Badge primitive (components/ui/badge.tsx): this file owns the
// MEANING — which tone, which glyph, what the tooltip says — and never the pill's metrics.
export function UnclaimedBadge({ className = '' }: { className?: string }) {
  return (
    <Badge
      tone="primary"
      size="sm"
      icon={<Sprout aria-hidden />}
      title="Seeded by Frequency. Live until the original poster claims it."
      className={className}
    >
      Unclaimed
    </Badge>
  )
}
