import { ScrollText, History } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { getRecentAdminActions } from '@/lib/admin/audit'
import { AuditTable } from './audit-table'

export const dynamic = 'force-dynamic'

// Audit log — the INDEX/TABLE template (ADR-233 §3.3): the append-only security trail
// for sensitive platform actions rendered through the canonical DataTable. Header +
// instructional copy on the canvas; the trail lives in one white tile. The ACTION_LABEL
// map is CONTENT (the human reading of each dotted action key) and stays — it now lives
// next to the table that consumes it.

export default async function AdminAuditPage() {
  await requireAdmin('admin')
  const rows = await getRecentAdminActions(100)

  return (
    <AdminTemplate
      title="Audit log"
      icon={ScrollText}
      eyebrow="Operations"
      width="wide"
      description="A record of sensitive platform actions. Who did what, to whom. Append-only; the security trail for role grants, partner verification, and more."
    >
      <AdminSection title="Recent actions" description="The 100 most recent sensitive actions, newest first.">
        {rows.length === 0 ? (
          <EmptyState
            variant="first-use"
            icon={History}
            title="No actions logged yet"
            description="Sensitive admin actions (role grants, partner verification) will appear here."
          />
        ) : (
          <AuditTable
            rows={rows.map((r) => ({
              id: r.id,
              action: r.action,
              actor: r.actor?.displayName ?? 'System',
              targetType: r.targetType,
              targetId: r.targetId,
              detail: r.detail,
              createdAt: r.createdAt,
            }))}
          />
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
