import { requireAdminFloor } from '@/lib/admin/guard'
import { FrequencyAdminConsole } from '@/components/frequency/admin/admin-console'

// Admin route group. The guard is the single entry gate (host+); a viewer without
// access is redirected home rather than shown a dead-end 404. Pages re-assert their
// own minimum via requireAdmin(min). The console wears the Frequency admin shell (the glass sidebar
// over the admin_header menu, the sticky top bar), ADR-1737.

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profileId, role, webRole, staffRole } = await requireAdminFloor()

  return (
    <FrequencyAdminConsole profileId={profileId} role={role} webRole={webRole} staffRole={staffRole}>
      {children}
    </FrequencyAdminConsole>
  )
}
