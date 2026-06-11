'use client'

import { usePathname } from 'next/navigation'

// Renders children on every admin page EXCEPT /admin itself. The Home page IS the
// dashboard — its sections own the live numbers — so the right Info rail there
// duplicated the page 1:1 (same members/active/events counts, the same five newest
// joins, twice on one screen). Interior pages keep the rail.
export function NotOnAdminHome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname === '/admin') return null
  return <>{children}</>
}
