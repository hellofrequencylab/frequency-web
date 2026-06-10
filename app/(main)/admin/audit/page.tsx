import { ScrollText, History } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { EmptyState } from '@/components/ui/empty-state'
import { getRecentAdminActions } from '@/lib/admin/audit'

export const dynamic = 'force-dynamic'

const ACTION_LABEL: Record<string, string> = {
  'role.assign': 'Assigned a role',
  'persona.verified': 'Verified a partner persona',
  'persona.active': 'Activated a partner persona',
  'persona.suspended': 'Suspended a partner persona',
  'moderation.hide': 'Hid reported content',
  'moderation.dismiss': 'Dismissed a report',
  'moderation.warn': 'Warned a member',
  'moderation.suspend': 'Suspended a member',
  'moderation.event_cancel': 'Cancelled a reported event',
  'demo.purge': 'Purged demo content',
}
const label = (a: string) => ACTION_LABEL[a] ?? a

function detailText(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ')
}

export default async function AdminAuditPage() {
  await requireAdmin('admin')
  const rows = await getRecentAdminActions(100)

  return (
    <AdminPage
      title="Audit log"
      icon={ScrollText}
      eyebrow="People"
      description="A record of sensitive platform actions. Who did what, to whom. Append-only; the security trail for role grants, partner verification, and more."
    >
      <AdminSection title="Recent actions">
        {rows.length === 0 ? (
          <EmptyState icon={History} title="No actions logged yet" description="Sensitive admin actions (role grants, partner verification) will appear here." />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text">{label(r.action)}</p>
                  <p className="truncate text-xs text-subtle">
                    {r.actor?.displayName ?? 'System'}
                    {r.targetType ? ` → ${r.targetType}:${(r.targetId ?? '').slice(0, 8)}` : ''}
                    {Object.keys(r.detail).length ? ` · ${detailText(r.detail)}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-2xs text-subtle">{new Date(r.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </AdminPage>
  )
}
