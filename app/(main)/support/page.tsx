import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LifeBuoy, ChevronRight } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { listMyTickets } from '@/lib/support/store'
import { relativeTime } from '@/lib/utils'
import { ReportButton } from '@/components/support/report-button'
import {
  TYPE_LABELS, STATUS_LABELS, statusChipClass, type SupportTicket,
} from '@/lib/support/types'

export const dynamic = 'force-dynamic'

// A member's support history (ADR-159) — every report they've filed and its status,
// newest activity first. "New report" opens the global capture dialog.
export default async function SupportPage() {
  const me = await getCallerProfile()
  if (!me) redirect('/sign-in?next=/support')
  const tickets = await listMyTickets(me.id)

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Support</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
            <LifeBuoy className="h-5 w-5 shrink-0 text-primary-strong" /> Your reports
          </h1>
          <p className="mt-1 text-sm text-muted">Bugs, questions and ideas you’ve sent — and where they stand.</p>
        </div>
        <ReportButton label="New report" />
      </header>

      {tickets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-12 text-center">
          <LifeBuoy className="mx-auto h-8 w-8 text-subtle" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-text">No reports yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Hit a bug or have a question? Send a report and we’ll pick it up — you can track it here.
          </p>
          <div className="mt-4 flex justify-center">
            <ReportButton label="Send your first report" />
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <TicketRow ticket={t} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TicketRow({ ticket }: { ticket: SupportTicket }) {
  return (
    <Link
      href={`/support/${ticket.id}`}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${statusChipClass(ticket.status)}`}>
            {STATUS_LABELS[ticket.status]}
          </span>
          <span className="text-2xs font-medium text-subtle">{TYPE_LABELS[ticket.type]} · #{ticket.ref}</span>
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-text">{ticket.subject}</p>
        <p className="text-xs text-subtle">Updated {relativeTime(ticket.lastActivityAt)}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
    </Link>
  )
}
