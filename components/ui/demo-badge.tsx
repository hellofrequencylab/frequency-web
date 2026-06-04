import { Zap } from 'lucide-react'

// One small pill that marks a row as Beta demo content — sample data we seed so
// the community looks alive during the Beta, tagged `is_demo` in the database.
// The tell is a little yellow (warning-gold) lightning bolt ⚡ so Beta testers can
// spot demo members, circles, posts, events, and practices at a glance. It reads
// the same everywhere and still recedes — soft warning tokens, never a loud
// accent — so real member content reads as primary. As real content seeds in,
// demo rows are purged and these disappear on their own. See the right-sidebar
// DemoNotice for the explainer + honest counts.
export function DemoBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Sample content for the Beta — it recedes as real members join."
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/30 bg-warning-bg/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning ${className}`}
    >
      <Zap className="h-2.5 w-2.5 fill-warning text-warning" aria-hidden />
      Demo
    </span>
  )
}
