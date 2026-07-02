import { ScrollText } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

// AUDIT LOG, the append-only security trail for sensitive platform actions (ADR-233 §3.3). Module-driven
// (ADR-270/294): the page composes the AdminTemplate header, then renders <PageModules>, which lays out
// the recent-actions trail. The single block is a self-fetching, fail-safe RSC in
// components/widgets/audit/* isolated in its own <Suspense>, so the slow read never blocks the shell
// (PAGE-FRAMEWORK §5).
//
// STAFF-GATED: requireAdmin('admin') — the security trail is admin-only. The module renders only through
// this gated route, so it never re-gates. The /admin/* group mounts its own info rail (page-chrome
// 'none'), so no rail registration is needed here.
export const dynamic = 'force-dynamic'

export default async function AdminAuditPage() {
  await requireAdmin('admin')

  return (
    <AdminTemplate
      title="Audit log"
      icon={ScrollText}
      eyebrow="Operations"
      width="wide"
      description="A record of sensitive platform actions. Who did what, to whom. Append-only; the security trail for role grants, partner verification, and more."
    >
      <PageModules route="/admin/audit" />
    </AdminTemplate>
  )
}
