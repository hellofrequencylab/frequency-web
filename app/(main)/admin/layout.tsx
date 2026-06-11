import { requireAdminFloor } from '@/lib/admin/guard'
import { AdminTopNav } from '@/components/admin/admin-top-nav'

// Admin route group. The guard is the single entry gate (host+); a viewer without
// access is redirected home (logged-out → '/', insufficient role → '/feed') rather
// than shown a dead-end 404. Pages re-assert their own minimum via requireAdmin(min).
//
// Phase 4 chrome (ADR-228): the persistent left SIDEBAR + the separate breadcrumb
// strip are retired. Under /admin/* the global member left rail is suppressed
// (lib/layout/page-chrome.ts → leftRailFor 'none') AND the right rail is dropped
// (railFor 'none') so the workspace is full-width; this layout mounts ONE sticky
// top-nav menubar (the three domains + Home) above the page, whose active state is
// the wayfinding the breadcrumb used to provide. Every page composes the shared
// AdminTemplate header beneath it. URLs are untouched.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Floor for entering /admin: community host+ OR any staff role that can see at
  // least one admin group (ADR-127). Each group/page gates itself precisely.
  const { role, webRole, staffRole } = await requireAdminFloor()

  return (
    <div>
      <AdminTopNav role={role} webRole={webRole} staffRole={staffRole} />
      {children}
    </div>
  )
}
