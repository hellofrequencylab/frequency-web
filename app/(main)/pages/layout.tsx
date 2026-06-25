import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPageDock } from '@/components/admin/admin-page-dock'

// The Pages admin (page editor, Beta splash editor, Home SEO editor, splash
// sequences) is staff-gated (admin+). Belt-and-braces: noindex so an editorial
// surface can never be crawled even if an auth edge case ever exposed it.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function PagesAdminLayout({ children }: { children: React.ReactNode }) {
  // Gate the route group at the floor the Pages workspace needs (each page re-asserts
  // its own minimum). This also feeds the page-admin dock the operator's roles.
  const { role, webRole, staffRole } = await requireAdmin('admin')

  // The page-admin dock shares the canvas-tab skin: flush to the bottom edge, rounded
  // on top, hairline outline, canvas-colored with a soft blur over content. Mounted
  // here (the workspace is OUTSIDE the /admin route group) so the "Sort areas" organizer
  // is reachable on /pages, just like the dashboard sorter is under /admin.
  const cornerTab =
    'pointer-events-auto rounded-t-2xl border-x border-t border-border/70 bg-[var(--color-canvas)]/95 px-2 pt-1 backdrop-blur-sm'

  return (
    <>
      {children}
      <div className={`fixed bottom-0 right-3 z-40 hidden w-72 lg:block ${cornerTab}`}>
        <AdminPageDock role={role} webRole={webRole} staffRole={staffRole} />
      </div>
    </>
  )
}
