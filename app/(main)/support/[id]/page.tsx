import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { getTicketForViewer } from '@/lib/support/store'
import { relativeTime } from '@/lib/utils'
import { TicketMessages } from '@/components/support/ticket-messages'
import { TicketContext } from '@/components/support/ticket-context'
import { TicketReply } from '@/components/support/ticket-reply'
import { TYPE_LABELS, STATUS_LABELS, statusChipClass } from '@/lib/support/types'

export const dynamic = 'force-dynamic'

// One of the member's own tickets: the conversation with support, the captured
// context + screenshot, and a reply box. Replying to a resolved ticket reopens it.
export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getCallerProfile()
  if (!me) redirect(`/sign-in?next=/support/${id}`)
  const ticket = await getTicketForViewer(id, me.id)
  if (!ticket) notFound()

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <Link href="/support" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-text">
        <ArrowLeft className="h-3.5 w-3.5" /> Your reports
      </Link>

      <header className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${statusChipClass(ticket.status)}`}>
            {STATUS_LABELS[ticket.status]}
          </span>
          <span className="text-2xs font-medium text-subtle">{TYPE_LABELS[ticket.type]} · #{ticket.ref} · opened {relativeTime(ticket.createdAt)}</span>
        </div>
        <h1 className="mt-1.5 text-lg font-bold text-text">{ticket.subject}</h1>
      </header>

      <TicketContext context={ticket.context} pageUrl={ticket.pageUrl} screenshotUrl={ticket.screenshotUrl} />

      <section className="rounded-2xl border border-border bg-surface p-4">
        <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-subtle">Conversation</p>
        <TicketMessages messages={ticket.messages} />
        <div className="mt-4 border-t border-border pt-3">
          <TicketReply ticketId={ticket.id} disabled={ticket.status === 'closed'} />
        </div>
      </section>
    </div>
  )
}
