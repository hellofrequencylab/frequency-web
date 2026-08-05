import { Heart } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// One small pill that marks a member as a **Supporter** — the pay-more entitlement
// tier above Crew (profiles.membership_tier = 'supporter'). It's the cosmetic
// thank-you for chipping in beyond the standard membership, so it reads as warm and
// endorsed (filled signal token, a little heart) without shouting over a member's
// rank or role. Reuses the badge convention (RoleBadge / DemoBadge) so a Supporter
// reads identically everywhere it shows up — profile header, people cards, post flair.
//
// Gate the render on the DISPLAYED profile's tier, not the viewer's:
//   {tier === 'supporter' && <SupporterBadge />}
//
// Composes the shared Badge primitive (components/ui/badge.tsx): this file owns the
// MEANING — which tone, which glyph, what the tooltip says — and never the pill's metrics.
// `compact` drops the label, leaving the heart alone in the pill.
export function SupporterBadge({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Badge
      tone="signal"
      size="sm"
      icon={<Heart className="fill-current" aria-hidden />}
      title="Supporter. Chips in beyond membership to keep Frequency running."
      className={className}
    >
      {!compact && 'Supporter'}
    </Badge>
  )
}
