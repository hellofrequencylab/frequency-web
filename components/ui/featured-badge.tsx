import { Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// One small pill that marks an entity as operator-Featured (curated) — circles + events
// carry a `featured_at` an operator stamps from the admin list. The tell is a filled star in
// the signal (highlight) tokens, distinct from the warning-gold Demo badge, so a featured row
// reads as "the team picked this" without shouting. Presentational + server-friendly (no hooks),
// so it drops into the EntityCard `badge` slot in Server Components.
//
// Composes the shared Badge primitive (components/ui/badge.tsx): this file owns the
// MEANING — which tone, which glyph, what the tooltip says — and never the pill's metrics.
export function FeaturedBadge({ className = '' }: { className?: string }) {
  return (
    <Badge
      tone="signal"
      size="sm"
      icon={<Star className="fill-current" aria-hidden />}
      title="Featured by the Frequency team."
      className={className}
    >
      Featured
    </Badge>
  )
}
