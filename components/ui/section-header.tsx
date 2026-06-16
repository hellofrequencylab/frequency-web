import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

// Shared section header — a light, editorial group label (title + optional
// count + optional action). Replaces the ad-hoc "uppercase text-2xs" and
// hairline-divider section headers scattered across the browse pages.
//
// Pass `href` to make the title + count a drill-down into the matching library/
// index (e.g. a "Your Journeys 3" header on My Quest links to /journeys). The
// header then shows a quiet ↗ affordance and is keyboard-reachable.

export function SectionHeader({
  title,
  count,
  action,
  href,
}: {
  title: string
  count?: number
  action?: React.ReactNode
  /** When set, the title + count link here (the section's library/index). */
  href?: string
}) {
  const heading = (
    <h2 className="flex items-baseline gap-2 text-sm font-bold tracking-tight text-text transition-colors group-hover:text-primary-strong">
      {title}
      {count != null && <span className="text-xs font-medium tabular-nums text-subtle">{count}</span>}
      {href && (
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 self-center text-subtle transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary-strong" />
      )}
    </h2>
  )

  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      {href ? (
        <Link href={href} className="group min-w-0">
          {heading}
        </Link>
      ) : (
        heading
      )}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
