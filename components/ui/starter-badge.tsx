import { Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// One small pill that marks a card or map pin as a Starter Circle — a staff-made
// blueprint surfaced near the viewer that anyone can claim and make their own. The
// tell is a Sparkles ✦ in the primary (brand amber) tokens, distinct from the
// warning-gold Demo badge and the signal-teal Featured badge, so a Starter reads as
// "a good place to begin" without shouting. Presentational + server-friendly (no
// hooks), so it drops into the EntityCard `badge` slot in Server Components.
//
// Composes the shared Badge primitive (components/ui/badge.tsx): this file owns the
// MEANING — which tone, which glyph, what the tooltip says — and never the pill's metrics.
export function StarterBadge({ className = '' }: { className?: string }) {
  return (
    <Badge
      tone="primary"
      size="sm"
      icon={<Sparkles aria-hidden />}
      title="A Starter Circle. Claim it to make it your own."
      className={className}
    >
      Starter
    </Badge>
  )
}
