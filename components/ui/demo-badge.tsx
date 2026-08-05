import { Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// One small pill that marks a row as Beta demo content — sample data we seed so
// the community looks alive during the Beta, tagged `is_demo` in the database.
// The tell is a little yellow (warning-gold) lightning bolt ⚡ so Beta testers can
// spot demo members, circles, posts, events, and practices at a glance. It reads
// the same everywhere and still recedes — soft warning tokens, never a loud
// accent — so real member content reads as primary. As real content seeds in,
// demo rows are purged and these disappear on their own. See the right-sidebar
// DemoNotice for the explainer + honest counts.
//
// Composes the shared Badge primitive (components/ui/badge.tsx): this file owns the
// MEANING — which tone, which glyph, what the tooltip says — and never the pill's metrics.
export function DemoBadge({ className = '' }: { className?: string }) {
  return (
    <Badge
      tone="warning"
      size="sm"
      icon={<Zap className="fill-current" aria-hidden />}
      title="Sample content for the Beta. It recedes as real members join."
      className={className}
    >
      Demo
    </Badge>
  )
}
