import { Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// The one "Coming soon" marker. Anything the product shows before it works carries this, so a
// visitor reads "not yet" at a glance instead of finding a dead button. Composes the shared Badge
// primitive: this file owns the meaning (neutral tone, a clock, the words) and never the metrics.
// Pair it with a disabled control and a one-line reason; never wrap a live action in it.
export function ComingSoonMark({ className = '', label = 'Coming soon' }: { className?: string; label?: string }) {
  return (
    <Badge
      tone="neutral"
      size="sm"
      icon={<Clock aria-hidden />}
      title="Not built yet. It lands here when it is ready."
      className={className}
    >
      {label}
    </Badge>
  )
}
