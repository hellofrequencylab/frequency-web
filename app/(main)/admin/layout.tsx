import { Suspense } from 'react'
import { requireAdminFloor } from '@/lib/admin/guard'
import { AdminDashboardTab, AdminMobileNav } from '@/components/admin/admin-top-nav'
import { AdminLeftNav } from '@/components/admin/admin-left-nav'
import { AdminSearchBar } from '@/components/admin/admin-search-bar'
import { AdminInfoRail } from '@/components/admin/admin-info-rail'
import { AdminFooter } from '@/components/admin/admin-footer'

// Admin route group. The guard is the single entry gate (host+); a viewer without
// access is redirected home rather than shown a dead-end 404. Pages re-assert their
// own minimum via requireAdmin(min).
//
// Chrome (five-area IA): an open, background-less workspace framed by three columns
// that all rise to the header (sticky top-14). LEFT — the Admin Dashboard anchor tab
// under the logo, then the primary AREAS. CENTER — the Ask Vera + search command bar
// above the page content. RIGHT — the live info rail (counts + newest + needs-
// attention). The shell's member rails stay suppressed (page-chrome 'none' on both
// axes) because this layout owns the admin frame. The info rail loads behind Suspense
// so it never blocks the page (PAGE-FRAMEWORK §5).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role, webRole, staffRole } = await requireAdminFloor()

  return (
    <div>
      <div className="mx-auto flex w-full max-w-[105rem] gap-8">
        {/* Left — the anchor tab (under the logo) + the primary areas. Rises to the
            header and pins there as the page scrolls. */}
        <aside className="hidden w-48 shrink-0 lg:block">
          <div className="sticky top-14 max-h-[calc(100vh-4.5rem)] overflow-y-auto pb-6 pt-2.5">
            <AdminDashboardTab />
            <div className="mt-5">
              <AdminLeftNav role={role} webRole={webRole} staffRole={staffRole} />
            </div>
          </div>
        </aside>

        {/* Center — the command bar above the content. On phones the tab + the nav
            sheet + search stack here (the left rail is hidden below lg). */}
        <main className="min-w-0 flex-1">
          <div className="mb-4 flex items-center gap-2 lg:hidden">
            <AdminDashboardTab />
            <div className="min-w-0 flex-1">
              <AdminMobileNav role={role} webRole={webRole} staffRole={staffRole} />
            </div>
          </div>

          <div className="sticky top-14 z-20 mb-6 bg-[var(--color-canvas)] py-2.5">
            <AdminSearchBar />
          </div>

          {children}
        </main>

        {/* Right — the live rail, rising to the header alongside the content. */}
        <aside className="hidden w-64 shrink-0 xl:block">
          <div className="sticky top-14 max-h-[calc(100vh-4.5rem)] overflow-y-auto pb-6 pt-2.5">
            <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />}>
              <AdminInfoRail />
            </Suspense>
          </div>
        </aside>
      </div>

      <AdminFooter role={role} webRole={webRole} staffRole={staffRole} />
    </div>
  )
}
