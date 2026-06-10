import { requireAdminFloor } from '@/lib/admin/guard'
import { AdminSubNav } from './sub-nav'

// Admin route group. The guard is the single entry gate (host+); a viewer without
// access is redirected home (logged-out → '/', insufficient role → '/feed') rather
// than shown a dead-end 404. Pages re-assert their own minimum via requireAdmin(min).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Floor for entering /admin: community host+ OR any staff role that can see at
  // least one admin group (ADR-127). Each group/page gates itself precisely.
  const { role, webRole, staffRole } = await requireAdminFloor()

  return (
    <div className="-mx-6 -my-6 flex min-h-full flex-col">
      <AdminSubNav role={role} webRole={webRole} staffRole={staffRole} />
      <div className="flex-1 px-6 py-6">{children}</div>
    </div>
  )
}
