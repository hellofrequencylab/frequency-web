import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ExternalLink, KanbanSquare, User } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getTicketAdmin, listAssignableAgents, ticketCountForProfile } from '@/lib/support/store'
import { relativeTime } from '@/lib/utils'
import { AdminTemplate } from '@/components/templates'
import { TicketMessages } from '@/components/support/ticket-messages'
import { TicketContext } from '@/components/support/ticket-context'
import { AdminTicketControls } from '@/components/support/admin-ticket-controls'
import { TYPE_LABELS, STATUS_LABELS, statusChipClass } from '@/lib/support/types'

export const dynamic = 'force-dynamic'

// Staff ticket workspace: the full thread (with internal notes), captured context +
// screenshot, triage controls, and the reporter card linked into the CRM/profile.
export default async function AdminSupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getCallerProfile()
  if (!me) redirect('/')
  if (!atLeastRole(me.community_role, 'host')) redirect('/feed')

  const ticket = await getTicketAdmin(id)
  if (!ticket) notFound()
  const [agents, reporterTickets] = await Promise.all([
    listAssignableAgents(),
    ticket.reporter ? ticketCountForProfile(ticket.reporter.id) : Promise.resolve({ total: 0, open: 0 }),
  ])

  return (
    <AdminTemplate
      title={ticket.subject}
      back={{ href: '/admin/support', label: 'Support queue' }}
      eyebrow={
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${statusChipClass(ticket.status)}`}>{STATUS_LABELS[ticket.status]}</span>
          <span className="text-2xs font-medium text-subtle">{TYPE_LABELS[ticket.type]} · #{ticket.ref} · opened {relativeTime(ticket.createdAt)}</span>
        </span>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        {/* Conversation + triage */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-border bg-surface p-4">
            <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-subtle">Conversation</p>
            <TicketMessages messages={ticket.messages} />
          </section>
          <section className="rounded-2xl border border-border bg-surface p-4">
            <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-subtle">Triage</p>
            <AdminTicketControls
              ticketId={ticket.id}
              status={ticket.status}
              priority={ticket.priority}
              assignedTo={ticket.assignedTo}
              agents={agents}
            />
          </section>
        </div>

        {/* Reporter + context rail */}
        <aside className="space-y-4">
          {ticket.reporter && (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Reporter</p>
              <p className="mt-1.5 text-sm font-bold text-text">{ticket.reporter.name}</p>
              <p className="text-xs text-subtle">@{ticket.reporter.handle}</p>
              <p className="mt-1 text-xs text-muted">
                {reporterTickets.total} ticket{reporterTickets.total === 1 ? '' : 's'} · {reporterTickets.open} open
              </p>
              <div className="mt-3 space-y-1.5">
                <Link href={`/people/${ticket.reporter.handle}`} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated">
                  <User className="h-3.5 w-3.5 text-subtle" /> View profile <ExternalLink className="ml-auto h-3 w-3 text-subtle" />
                </Link>
                <Link href={`/connections?q=${encodeURIComponent(ticket.reporter.handle)}`} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated">
                  <KanbanSquare className="h-3.5 w-3.5 text-subtle" /> Find in CRM <ExternalLink className="ml-auto h-3 w-3 text-subtle" />
                </Link>
              </div>
            </div>
          )}

          <TicketContext context={ticket.context} pageUrl={ticket.pageUrl} screenshotUrl={ticket.screenshotUrl} />
        </aside>
      </div>
    </AdminTemplate>
  )
}
