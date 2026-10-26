import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

// The members kit's `.sec-h` (ADR-1737; the Unbounded `.h2` title, the count as `.meta`,
// the action on the right), the head every section in templates/members/*.html opens with.

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
  const heading = (
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
          {heading}
        </Link>
      ) : (
        heading
      )}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
