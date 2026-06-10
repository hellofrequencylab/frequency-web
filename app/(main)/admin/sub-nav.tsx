'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { domainForPath, pageLabelForPath } from './sections'

// Admin breadcrumb bar (Phase 2). The top SWITCHER is gone — the three domains now
// live in the persistent left sidebar (components/admin/admin-sidebar.tsx). What
// remains here is the slim wayfinding breadcrumb `Admin › {Domain} › {Page}`,
// derived from the URL via `domainForPath` / `pageLabelForPath`. It sits above the
// content as a quiet location strip, so a viewer always knows where they are even
// once the sidebar is scrolled or collapsed.
export function AdminBreadcrumb() {
  const pathname = usePathname()
  const activeDomain = domainForPath(pathname)
  const pageLabel = pageLabelForPath(pathname)

  return (
    <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto border-b border-border px-1 py-2 text-sm text-muted">
      <Link href="/admin" className="shrink-0 transition-colors hover:text-text">
        Admin
      </Link>
      {activeDomain && (
        <>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
          <Link
            href={activeDomain.href}
            className={`shrink-0 transition-colors hover:text-text ${pageLabel ? '' : 'font-medium text-text'}`}
          >
            {activeDomain.label}
          </Link>
        </>
      )}
      {pageLabel && (
        <>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
          <span className="shrink-0 font-medium text-text">{pageLabel}</span>
        </>
      )}
    </div>
  )
}
