import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { requireAdminFloor } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminDashboardTab, AdminMobileNav } from '@/components/admin/admin-top-nav'
import { AdminLeftNav } from '@/components/admin/admin-left-nav'
import { AdminSearchBar } from '@/components/admin/admin-search-bar'
import { AdminInfoRail } from '@/components/admin/admin-info-rail'
import { AdminProfileCard } from '@/components/admin/admin-profile-card'
import { AdminPageDock } from '@/components/admin/admin-page-dock'
import { AdminFooter } from '@/components/admin/admin-footer'
import { DASH_ORDER_COOKIE, sanitizeDashOrder } from './dash-sections'
import type { ProfileIdentity } from '@/lib/types/profile'

// Admin route group. The guard is the single entry gate (host+); a viewer without
// access is redirected home rather than shown a dead-end 404. Pages re-assert their
// own minimum via requireAdmin(min).
//
// Chrome (five-area IA): an open, background-less workspace framed by three columns
// that all rise to the header and run the full height under it. LEFT — the Admin
// Dashboard anchor tab, the primary AREAS, and the operator's PROFILE CARD pinned at
// the bottom. CENTER — the Ask Vera + search command bar above the page content.
// RIGHT — the live info rail, with the PAGE-ADMIN dock pinned at the bottom (the
// profile card's mirror: a tab that slides up to page settings + sort functions —
// the Home section organizer). Both bottom cards sit ON the canvas (hairline above,
// no panel). The shell's member rails stay suppressed (page-chrome 'none') because
// this layout owns the admin frame. Slow bits load behind Suspense (PAGE-FRAMEWORK §5).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profileId, role, webRole, staffRole } = await requireAdminFloor()

  // The operator's identity (bottom-left card) + their saved Home section order
  // (bottom-right dock). One cheap row read; the cookie is already in the request.
  const [{ data: identity }, jar] = await Promise.all([
    createAdminClient()
      .from('profiles')
      .select('display_name, handle, avatar_url')
      .eq('id', profileId)
      .single(),
    cookies(),
  ])
  const dashOrder = sanitizeDashOrder(jar.get(DASH_ORDER_COOKIE)?.value)

  return (
    <div>
      <div className="mx-auto flex w-full max-w-[105rem] gap-8">
        {/* Left — anchor tab + areas, with the profile card pinned at the bottom. */}
        <aside className="hidden w-48 shrink-0 lg:block">
          <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col pt-2.5">
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              <AdminDashboardTab />
              <div className="mt-5">
                <AdminLeftNav role={role} webRole={webRole} staffRole={staffRole} />
              </div>
            </div>
            {identity && <AdminProfileCard profile={identity as ProfileIdentity} role={role} />}
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

        {/* Right — the live rail, with the page-admin dock pinned at the bottom. */}
        <aside className="hidden w-64 shrink-0 xl:block">
          <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col pt-2.5">
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />}>
                <AdminInfoRail />
              </Suspense>
            </div>
            <AdminPageDock role={role} webRole={webRole} staffRole={staffRole} initialOrder={dashOrder} />
          </div>
        </aside>
      </div>

      <AdminFooter role={role} webRole={webRole} staffRole={staffRole} />
    </div>
  )
}
