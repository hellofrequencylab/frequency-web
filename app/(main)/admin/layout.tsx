import { requireAdmin } from '@/lib/admin/guard'
import { AdminSubNav } from './sub-nav'

// Admin route group. The guard is the single entry gate (host+); below that it
// renders 404. Pages re-assert their own minimum via requireAdmin(min).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireAdmin('host')

  return (
    <div className="-mx-6 -my-6 flex min-h-full flex-col">
      <AdminSubNav role={role} />
      <div className="flex-1 px-6 py-6">{children}</div>
    </div>
  )
}
