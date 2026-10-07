import { Rocket } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// The BOOSTED mark (LIVE-756). A Crew member gave this Space a Boost in the last 7 days. Owner ruling
// 2026-10-06 ("Circles only"): a Boost lifts a Circle in discovery, but a Space only wears this mark,
// and the Space directory keeps its earned order (LIVE-262). Composes the shared Badge primitive, so
// this file owns the meaning (tone, glyph, words) and never the pill's metrics. Server-friendly.
export function BoostedBadge({ boosted, className = '' }: { boosted?: boolean | null; className?: string }) {
  if (!boosted) return null
  return (
    <Badge
      tone="primary"
      size="sm"
      icon={<Rocket aria-hidden />}
      title="Boosted. A Crew member backed this Space this week."
      className={className}
    >
      Boosted
    </Badge>
  )
}
