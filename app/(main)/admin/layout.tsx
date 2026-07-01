import { Suspense } from 'react'
import { requireAdminFloor } from '@/lib/admin/guard'
import { AdminSearchBar } from '@/components/admin/admin-search-bar'
import { AdminSubNav } from '@/components/admin/admin-sub-nav'
import { AdminInfoRail } from '@/components/admin/admin-info-rail'
import { AdminRailDrawerColumn } from '@/components/admin/admin-rail-drawer-column'
import { AdminPageDock } from '@/components/admin/admin-page-dock'
import { AdminFooter } from '@/components/admin/admin-footer'
import { getMenu } from '@/lib/menus/read'
import { viewerRoleFor } from '@/components/layout/menu-role'

// Admin route group. The guard is the single entry gate (host+); a viewer without
// access is redirected home rather than shown a dead-end 404. Pages re-assert their
// own minimum via requireAdmin(min).
//
// Chrome (owner directive: one menu site-wide): the admin area rides the SAME global
// left menu as the rest of the site (the app shell's nav; leftRailFor → 'global'). The
// admin MENU is now a full-width secondary sub-header that the app shell renders itself
// (sticky just under the main header, full viewport width, pushing content down). On top
// of the shared shell this layout keeps the operator extras: the Ask-Vera/search command
// bar (its own sticky band below the sub-header), the live info rail on the right (xl+),
// and the bottom-right page-admin dock. The operator's profile card is the shell's own
// ProfileCard (one card everywhere). The app-shell's member RIGHT rail stays suppressed
// (railFor → 'none'). The info rail streams behind Suspense.

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role, webRole, staffRole } = await requireAdminFloor()

  // The admin sub-nav (§6): the ACTIVE Studio world's sub-pages render as a flat horizontal row of
  // text links at the TOP of this sticky band, directly above the search bar — the MegaBar's second
  // dropdown layer is gone (removed from the shell). The active world + active leaf are resolved
  // client-side (usePathname) inside AdminSubNav; here we just read the admin_header surface (DB
  // override, code default on any miss) and collapse the viewer to the MenuAccess token + staff role
  // the two-axis gate consumes. Gates are unchanged: canSeeMenuItem unions the same axes as before.
  const adminHeaderMenu = await getMenu('admin_header')
  const menuViewer = {
    viewerRole: viewerRoleFor({ loggedIn: true, communityRole: role, webRole }),
    staffRole,
  }

  // The page-admin dock shares the canvas-tab skin: flush to the bottom edge, rounded
  // on top, hairline outline, canvas-colored with a soft blur over content.
  const cornerTab =
    'pointer-events-auto rounded-t-2xl border-x border-t border-border/70 bg-[var(--color-canvas)]/95 px-2 pt-1 backdrop-blur-sm'

  return (
    <div>
      {/* No row gap: the rail column carries its own left gap at xl (w-72 = rail + gap), and a
          gap on a zero-width column would push the center in at lg. */}
      <div className="flex w-full">
        {/* Center — the admin chrome block: the flat sub-nav link row + the Ask-Vera/search command
            bar, in ONE sticky band that stays visible on scroll. */}
        <main className="min-w-0 flex-1">
          {/* The admin chrome block (§6a): the sub-nav text-link row on TOP and the Ask-Vera/search
              bar below live in ONE opaque sticky container, so page content scrolls cleanly UNDERNEATH
              the whole band like header chrome — nothing bleeds through the padding (the old bug was a
              transparent gap above the input). bg-[var(--color-canvas)] at FULL opacity spans the whole
              band height; a hairline border-b reads the scroll seam as chrome. The old shell-rendered
              admin sub-header is gone, so this band now pins directly under the main header (3.5rem) at
              EVERY breakpoint — the sub-nav row it absorbed is inside this same container. */}
          <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 mb-6 border-b border-border bg-[var(--color-canvas)]">
            <AdminSubNav sections={adminHeaderMenu.categories} viewer={menuViewer} />
            <div className="py-2.5">
              <AdminSearchBar role={role} webRole={webRole} staffRole={staffRole} />
            </div>
          </div>

          {children}
        </main>

        {/* Right — the live operator info rail (xl+), in the column the shell-level Settings
            drawer slides OVER. The drawer mounts inside this column (not the shell's) so it
            covers the rail and compresses the center as its grab handle widens it. */}
        <AdminRailDrawerColumn>
          <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />}>
            <AdminInfoRail role={role} webRole={webRole} staffRole={staffRole} />
          </Suspense>
        </AdminRailDrawerColumn>
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
