import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

type Crumb = {
  label: string
  href?: string
}

export function HierarchyBreadcrumb({
  crumbs,
  className = '',
}: {
  crumbs: Crumb[]
  className?: string
}) {
  if (crumbs.length === 0) return null

  return (
    <nav
      aria-label="Hierarchy"
      className={`flex items-center gap-1 flex-wrap text-xs text-subtle ${className}`}
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 text-subtle shrink-0" />}
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="hover:text-primary-strong transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-muted font-medium' : ''}>
                {crumb.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
