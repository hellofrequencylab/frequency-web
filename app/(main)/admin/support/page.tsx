import Link from 'next/link'
import { LifeBuoy } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { SupportTable } from './support-table'
import { listTickets, ticketStatusCounts } from '@/lib/support/store'
import { type TicketStatus } from '@/lib/support/types'

export const dynamic = 'force-dynamic'

const FILTERS: { key: string; label: string }[] = [
  { key: 'open_all', label: 'Open' },
  { key: 'all', label: 'All' },
  { key: 'open', label: 'New' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
]

// Support console (ADR-159) — the staff triage queue. Wired to the reporter's profile
// (and from there, the CRM). Gate (ADR-223): community host+ OR a staff role with the
// `members` domain (write) — Support/Operations do member assist (docs/ROLES.md
// §System 3). The floor matches the sections.ts link gate exactly (host + `members`).
export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; q?: string }>
}) {
  await requireAdmin('host', { staff: 'members' })

  const { status = 'open_all', type, q } = await searchParams
  const [tickets, counts] = await Promise.all([
    listTickets({ status: status as TicketStatus | 'all' | 'open_all', type: type as never, q }),
    ticketStatusCounts(),
  ])

  const openCount = (counts.open ?? 0) + (counts.in_progress ?? 0) + (counts.waiting ?? 0)

  return (
    <AdminTemplate
      title="Support"
      icon={LifeBuoy}
      eyebrow="Studio"
      description="Bug reports and support requests from members. Triage, reply, and track them to resolution."
      width="wide"
    >
      <AdminSection>
        {/* Status filter chips (URL-as-state) */}
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = status === f.key
            const count = f.key === 'open_all' ? openCount : f.key === 'all' ? undefined : counts[f.key]
            return (
              <Link
                key={f.key}
                href={`/admin/support?status=${f.key}`}
                aria-current={active ? 'true' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors motion-reduce:transition-none ${
                  active ? 'bg-primary text-on-primary' : 'border border-border bg-surface text-muted hover:bg-surface-elevated'
                }`}
              >
                {f.label}
                {count != null && <span className={active ? 'opacity-80' : 'text-subtle'}>{count}</span>}
              </Link>
            )
          })}
        </div>
      </AdminSection>

      <AdminSection title={`${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`}>
        <SupportTable
          tickets={tickets}
          empty={
            <EmptyState
              variant={status === 'all' ? 'first-use' : 'no-results'}
              title={status === 'all' ? 'No tickets yet' : 'Nothing in this view'}
              description={status === 'all' ? 'Member bug reports and support requests will appear here.' : 'Try the “All” filter to widen the search.'}
            />
          }
        />
      </AdminSection>
    </AdminTemplate>
  )
}
