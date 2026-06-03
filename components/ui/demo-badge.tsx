import { FlaskConical } from 'lucide-react'

// One small, understated pill that marks a row as Beta demo content — sample
// data we seed so the community looks alive during the Beta, tagged `is_demo`
// in the database. It reads the same everywhere (directory, circles, profiles,
// feed) and is designed to *recede*: muted tokens, never a loud accent, so real
// member content always reads as primary. As real content seeds in, demo rows
// are purged and these disappear on their own.
export function DemoBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Sample content for the Beta — it recedes as real members join."
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border bg-surface-elevated px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle ${className}`}
    >
      <FlaskConical className="h-2.5 w-2.5" aria-hidden />
      Beta Demo
    </span>
  )
}
