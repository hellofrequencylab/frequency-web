import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { SITE_DESIGN } from '@/lib/theme/design'

// FREQUENCY (ADR-1737): the members kit's `.sec-h` (the Unbounded `.h2` title, the count as `.meta`,
// the action on the right), the head every section in templates/members/*.html opens with. Inlined at
// build; DAWN's markup below is unchanged.
const FREQUENCY = SITE_DESIGN === 'frequency'

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
  id,
}: {
  title: string
  count?: number
  action?: React.ReactNode
  /** When set, the title + count link here (the section's library/index). */
  href?: string
  /** Lands on the `<h2>` so a wrapping `<section aria-labelledby>` can name itself from
   *  the heading a sighted person already reads. The spoken name and the seen name then
   *  cannot drift, because they are the same string. */
  id?: string
}) {
  if (FREQUENCY) {
    const fqHeading = (
      <h2 id={id} className="h2 mu-sec-t">
        {title}
        {count != null && <span className="meta">{count}</span>}
        {href && <ArrowUpRight aria-hidden className="mu-sec-arrow" />}
      </h2>
    )
    return (
      <div className="sec-h">
        {href ? (
          <Link href={href} className="mu-sec-link">
            {fqHeading}
          </Link>
        ) : (
          fqHeading
        )}
        {action && <div className="shrink-0">{action}</div>}
      </div>
    )
  }
  const heading = (
    <h2 id={id} className="flex items-baseline gap-2 text-body-sm font-bold tracking-tight text-text transition-colors group-hover:text-primary-strong">
      {title}
      {count != null && <span className="text-meta font-medium tabular-nums text-subtle">{count}</span>}
      {href && (
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 self-center text-subtle transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary-strong" />
      )}
    </h2>
  )

  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      {href ? (
        <Link
          href={href}
          className="group press min-w-0 rounded-control outline-none transition-transform focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
        >
          {heading}
        </Link>
      ) : (
        heading
      )}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
