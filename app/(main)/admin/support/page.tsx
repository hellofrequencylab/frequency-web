import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LifeBuoy } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { listTickets, ticketStatusCounts, type AdminTicketRow } from '@/lib/support/store'
import { relativeTime } from '@/lib/utils'
import {
  TYPE_LABELS, STATUS_LABELS, statusChipClass, priorityChipClass, PRIORITY_LABELS,
  type TicketStatus,
} from '@/lib/support/types'

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
// (and from there, the CRM). Host+ only; a janitor can retune access in the grid.
export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; q?: string }>
}) {
  const me = await getCallerProfile()
  if (!me) redirect('/')
  if (!atLeastRole(me.community_role, 'host')) redirect('/feed')

  const { status = 'open_all', type, q } = await searchParams
  const [tickets, counts] = await Promise.all([
    listTickets({ status: status as TicketStatus | 'all' | 'open_all', type: type as never, q }),
    ticketStatusCounts(),
  ])

  const openCount = (counts.open ?? 0) + (counts.in_progress ?? 0) + (counts.waiting ?? 0)

  return (
    <AdminPage
      title="Support"
      icon={LifeBuoy}
      eyebrow="Studio"
      description="Bug reports and support requests from members — triage, reply, and track them to resolution."
    >
      {/* Status filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = status === f.key
          const count = f.key === 'open_all' ? openCount : f.key === 'all' ? undefined : counts[f.key]
          return (
            <Link
              key={f.key}
              href={`/admin/support?status=${f.key}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                active ? 'bg-primary text-on-primary' : 'border border-border bg-surface text-muted hover:bg-surface-elevated'
              }`}
            >
              {f.label}
              {count != null && <span className={active ? 'opacity-80' : 'text-subtle'}>{count}</span>}
            </Link>
          )
        })}
      </div>

      <AdminSection title={`${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`}>
        {tickets.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted">
            Nothing here. {status !== 'all' && 'Try the “All” filter.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {tickets.map((t) => <li key={t.id}><AdminTicketRow ticket={t} /></li>)}
          </ul>
        )}
      </AdminSection>
    </AdminPage>
  )
}

function AdminTicketRow({ ticket }: { ticket: AdminTicketRow }) {
  return (
    <Link
      href={`/admin/support/${ticket.id}`}
      className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${statusChipClass(ticket.status)}`}>{STATUS_LABELS[ticket.status]}</span>
          <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${priorityChipClass(ticket.priority)}`}>{PRIORITY_LABELS[ticket.priority]}</span>
          <span className="text-2xs font-medium text-subtle">{TYPE_LABELS[ticket.type]} · #{ticket.ref}</span>
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-text">{ticket.subject}</p>
        <p className="text-xs text-subtle">
          {ticket.reporter?.name ?? 'Unknown'} · {ticket.replyCount} message{ticket.replyCount === 1 ? '' : 's'} · {relativeTime(ticket.lastActivityAt)}
          {ticket.assignee && <> · → {ticket.assignee.name}</>}
        </p>
      </div>
    </Link>
  )
}
