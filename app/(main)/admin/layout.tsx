import { requireAdminFloor } from '@/lib/admin/guard'
import { AdminSidebar, AdminMobileMenu } from '@/components/admin/admin-sidebar'
import { AdminBreadcrumb } from './sub-nav'

// Admin route group. The guard is the single entry gate (host+); a viewer without
// access is redirected home (logged-out → '/', insufficient role → '/feed') rather
// than shown a dead-end 404. Pages re-assert their own minimum via requireAdmin(min).
//
// Phase 2 chrome: under /admin/* the global member left rail is suppressed
// (lib/layout/page-chrome.ts → leftRailFor) and this layout mounts the ADMIN
// workspace instead — a persistent left SIDEBAR (the three domains + their areas)
// beside the page content, with a slim breadcrumb above it. URLs are untouched.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Floor for entering /admin: community host+ OR any staff role that can see at
  // least one admin group (ADR-127). Each group/page gates itself precisely.
  const { role, webRole, staffRole } = await requireAdminFloor()

  return (
    // Pull flush to the shell's content padding so the sidebar runs to the edge, then
    // re-pad the content column. Two columns on md+; single full-width column on a
    // phone (the sidebar collapses into the AdminMobileMenu disclosure).
    <div className="-mx-6 -my-6 flex min-h-full">
      <AdminSidebar role={role} webRole={webRole} staffRole={staffRole} />

      <div className="min-w-0 flex-1 px-6 py-4">
        {/* Mobile-only "Admin menu" disclosure — the desktop sidebar is hidden here. */}
        <div className="mb-3 md:hidden">
          <AdminMobileMenu role={role} webRole={webRole} staffRole={staffRole} />
        </div>

        {/* Wayfinding breadcrumb: Admin › Domain › Page. */}
        <AdminBreadcrumb />

        <div className="pt-6">{children}</div>
      </div>
    </div>
  )
}
