import { Suspense } from 'react'
import { requireAdminFloor } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminDashboardTab, AdminMobileNav } from '@/components/admin/admin-top-nav'
import { AdminLeftNav } from '@/components/admin/admin-left-nav'
import { AdminSearchBar } from '@/components/admin/admin-search-bar'
import { AdminInfoRail } from '@/components/admin/admin-info-rail'
import { AdminProfileCard } from '@/components/admin/admin-profile-card'
import { AdminPageDock } from '@/components/admin/admin-page-dock'
import { AdminFooter } from '@/components/admin/admin-footer'
import type { ProfileIdentity } from '@/lib/types/profile'

// Admin route group. The guard is the single entry gate (host+); a viewer without
// access is redirected home rather than shown a dead-end 404. Pages re-assert their
// own minimum via requireAdmin(min).
//
// Chrome (five-area IA): an open, background-less workspace framed by three columns
// that all rise to the header (sticky top-14). LEFT — the Admin Dashboard anchor tab
// under the logo, then the primary AREAS. CENTER — the Ask Vera + search command bar
// above the page content. RIGHT — the live info rail (counts + newest + needs-
// attention). The shell's member rails stay suppressed (page-chrome 'none' on both
// axes) because this layout owns the admin frame; the member edge tabs (Next Steps /
// Vera) also stay off /admin — instead the BOTTOM CORNERS hold two fixed canvas tabs:
// the operator's PROFILE CARD (left) and the PAGE-ADMIN dock (right — a tab that
// slides up to page settings + the Home section sort). The info rail loads behind
// Suspense so it never blocks the page (PAGE-FRAMEWORK §5).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profileId, role, webRole, staffRole } = await requireAdminFloor()

  // The operator's identity for the bottom-left card. One cheap row read. (The
  // bottom-right dock's section sorter reads its per-scope order client-side.)
  const { data: identity } = await createAdminClient()
    .from('profiles')
    .select('display_name, handle, avatar_url')
    .eq('id', profileId)
    .single()

  // The corner tabs share one canvas skin: flush to the bottom edge, rounded on top,
  // hairline outline, canvas-colored (no solid panel) with a soft blur over content.
  const cornerTab =
    'pointer-events-auto rounded-t-2xl border-x border-t border-border/70 bg-[var(--color-canvas)]/95 px-2 pt-1 backdrop-blur-sm'

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
            <AdminSearchBar role={role} webRole={webRole} staffRole={staffRole} />
          </div>

          {children}
        </main>

        {/* Right — the live rail, rising to the header alongside the content. */}
        <aside className="hidden w-64 shrink-0 xl:block">
          <div className="sticky top-14 max-h-[calc(100vh-4.5rem)] overflow-y-auto pb-6 pt-2.5">
            <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />}>
              <AdminInfoRail role={role} webRole={webRole} staffRole={staffRole} />
            </Suspense>
          </div>
        </aside>
      </div>

      {/* The bottom-corner canvas tabs (lg+): profile left, page admin right — where
          the member edge tabs would sit (those stay off /admin). */}
      {identity && (
        <div className={`fixed bottom-0 left-3 z-40 hidden w-60 lg:block ${cornerTab}`}>
          <AdminProfileCard profile={identity as ProfileIdentity} role={role} />
        </div>
      )}
      <div className={`fixed bottom-0 right-3 z-40 hidden w-72 lg:block ${cornerTab}`}>
        <AdminPageDock role={role} webRole={webRole} staffRole={staffRole} />
      </div>

      <AdminFooter role={role} webRole={webRole} staffRole={staffRole} />
    </div>
  )
}
