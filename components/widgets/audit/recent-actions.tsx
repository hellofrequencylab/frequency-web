import { History } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { getRecentAdminActions } from '@/lib/admin/audit'
import { AuditTable } from '@/app/(main)/admin/audit/audit-table'

// Audit layout module (LP7): the append-only security trail for sensitive platform actions, rendered
// through the canonical DataTable. Self-fetching RSC; the page owns the admin gate, so this never
// re-gates. Fail-safe: any read error degrades to the empty state rather than a crash. The 100 most
// recent sensitive actions, newest first.
export async function AuditRecentActions() {
  let rows: Awaited<ReturnType<typeof getRecentAdminActions>> = []
  try {
    rows = await getRecentAdminActions(100)
  } catch {
    rows = []
  }

  return (
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
  )
}
