'use client'

import { usePathname } from 'next/navigation'

/**
 * Holds a shell-level banner to the same MEASURE as the page body underneath it.
 *
 * Why this exists. `AnnouncementBanner` renders in `app/(main)/layout.tsx` as a sibling ABOVE
 * `{children}`, so it spans the full content column. On most routes that is exactly right: the
 * right rail is a sibling of the content column in the shell, so "full content width" already
 * stops before it.
 *
 * The operator consoles are the exception. Their info rail (`components/admin/admin-info-rail.tsx`)
 * is a column INSIDE the page, not a shell rail — which is why `components/admin/admin-footer.tsx`
 * carries a `w-64` spacer of its own "to end exactly where the content does". The banner had no
 * such compensation, so it ran the full width and painted across the rail: the alert appeared to
 * bleed into LIVE / NEEDS ATTENTION rather than sit above the body.
 *
 * The margin is `lg:mr-72` because the rail column is `w-64` (16rem) with a `gap-8` (2rem) beside
 * it, and 16 + 2 = 18rem = `mr-72`. It is `lg:` only, matching the breakpoint at which that rail
 * appears at all — below it the console is single-column and the banner should span everything.
 *
 * Client-side because the decision is per-ROUTE and the banner's own parent is a layout that
 * cannot see which page rendered beneath it.
 */
export function BannerMeasure({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  // `/manage` consoles compose the same info rail as `/admin` (MENU-CONTRACT), so they get the
  // same measure. Anything else spans the column, which is the existing behaviour.
  const hasInfoRail = pathname.startsWith('/admin') || pathname.startsWith('/manage')
  return <div className={hasInfoRail ? 'lg:mr-72' : undefined}>{children}</div>
}
