import { Suspense } from 'react'
import { requireAdminFloor } from '@/lib/admin/guard'
import { AdminSearchBar } from '@/components/admin/admin-search-bar'
import { AdminTopMenu } from '@/components/admin/admin-top-menu'
import { AdminInfoRail } from '@/components/admin/admin-info-rail'
import { AdminPageDock } from '@/components/admin/admin-page-dock'
import { AdminFooter } from '@/components/admin/admin-footer'
import { atLeastRole, isStaff, isJanitor, type CommunityRole, type WebRole } from '@/lib/core/roles'
import { staffCan, type StaffRole, type StaffDomain } from '@/lib/core/staff-roles'

// Admin route group. The guard is the single entry gate (host+); a viewer without
// access is redirected home rather than shown a dead-end 404. Pages re-assert their
// own minimum via requireAdmin(min).
//
// Chrome (owner directive: one menu site-wide): the admin area rides the SAME global
// left menu as the rest of the site (the app shell's nav; leftRailFor → 'global'). On
// top of the shared shell it adds the operator extras: a SIMPLE ADMIN MENU + the
// Ask-Vera/search command bar in one sticky band above the content, the live info rail
// on the right (xl+), and the bottom-right page-admin dock. The operator's profile card
// is the shell's own ProfileCard (one card everywhere). The app-shell's member RIGHT
// rail stays suppressed (railFor → 'none'). The info rail streams behind Suspense.

// The simple admin menu (owner directive): the admin sections as a sticky horizontal
// row above the search bar, mirroring the left-nav Admin section + its gates. Each item
// shows when the viewer meets its role floor OR holds its staff domain.
type AdminMenuItem = { href: string; label: string; min: CommunityRole; staffDomain?: StaffDomain }
const ADMIN_MENU: readonly AdminMenuItem[] = [
  { href: '/admin', label: 'Dashboard', min: 'admin' },
  { href: '/admin/community', label: 'Community', min: 'host', staffDomain: 'community' },
  { href: '/lead', label: 'Leadership', min: 'host' },
  { href: '/admin/programs', label: 'Programs', min: 'host', staffDomain: 'community' },
  { href: '/admin/growth', label: 'Growth', min: 'host', staffDomain: 'marketing' },
  { href: '/admin/vera-ai', label: 'Vera AI', min: 'janitor', staffDomain: 'insights' },
  { href: '/admin/operations', label: 'Operations', min: 'janitor', staffDomain: 'platform' },
  { href: '/admin/qr', label: 'QR Studio', min: 'admin', staffDomain: 'qr' },
]
function canSeeAdminMenuItem(
  it: AdminMenuItem,
  role: CommunityRole,
  webRole: WebRole,
  staffRole: StaffRole | null,
): boolean {
  const meetsMin =
    it.min === 'janitor' ? isJanitor(webRole) : it.min === 'admin' ? isStaff(webRole) : atLeastRole(role, it.min)
  return meetsMin || (!!it.staffDomain && staffCan(staffRole, it.staffDomain, 'write'))
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role, webRole, staffRole } = await requireAdminFloor()

  const adminMenu = ADMIN_MENU.filter((it) => canSeeAdminMenuItem(it, role, webRole, staffRole)).map(
    ({ href, label }) => ({ href, label }),
  )

  // The page-admin dock shares the canvas-tab skin: flush to the bottom edge, rounded
  // on top, hairline outline, canvas-colored with a soft blur over content.
  const cornerTab =
    'pointer-events-auto rounded-t-2xl border-x border-t border-border/70 bg-[var(--color-canvas)]/95 px-2 pt-1 backdrop-blur-sm'

  return (
    <div>
      <div className="flex w-full gap-8">
        {/* Center — the simple admin menu + command bar, one sticky band above the
            content (both stay visible on scroll). */}
        <main className="min-w-0 flex-1">
          <div className="sticky top-14 z-20 mb-6 space-y-2.5 bg-[var(--color-canvas)] py-2.5">
            <AdminTopMenu items={adminMenu} />
            <AdminSearchBar role={role} webRole={webRole} staffRole={staffRole} />
          </div>

          {children}
        </main>

        {/* Right — the live operator info rail, rising to the header (xl+). */}
        <aside className="hidden w-64 shrink-0 xl:block">
          <div className="sticky top-14 max-h-[calc(100vh-4.5rem)] overflow-y-auto pb-6 pt-2.5">
            <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />}>
              <AdminInfoRail role={role} webRole={webRole} staffRole={staffRole} />
            </Suspense>
          </div>
        </aside>
      </div>

      {/* The page-admin dock (bottom-right canvas tab, lg+). The operator profile card
          is the shell's own (one card site-wide), so it is not duplicated here. */}
      <div className={`fixed bottom-0 right-3 z-40 hidden w-72 lg:block ${cornerTab}`}>
        <AdminPageDock role={role} webRole={webRole} staffRole={staffRole} />
      </div>

      <AdminFooter role={role} webRole={webRole} staffRole={staffRole} />
    </div>
  )
}
