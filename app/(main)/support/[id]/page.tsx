import { notFound, redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getTicketForViewer } from '@/lib/support/store'
import { relativeTime } from '@/lib/utils'
import { DetailTemplate } from '@/components/templates'
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
    <div className="mx-auto w-full max-w-3xl">
      <DetailTemplate
        title={ticket.subject}
        subtitle={`${TYPE_LABELS[ticket.type]} · #${ticket.ref} · opened ${relativeTime(ticket.createdAt)}`}
        badges={
          <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${statusChipClass(ticket.status)}`}>
            {STATUS_LABELS[ticket.status]}
          </span>
        }
      >
        <div className="space-y-5">
          <TicketContext context={ticket.context} pageUrl={ticket.pageUrl} screenshotUrl={ticket.screenshotUrl} />

          <section className="rounded-2xl border border-border bg-surface p-4">
            <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-subtle">Conversation</p>
            <TicketMessages messages={ticket.messages} />
            <div className="mt-4 border-t border-border pt-3">
              <TicketReply ticketId={ticket.id} disabled={ticket.status === 'closed'} />
            </div>
          </section>
        </div>
      </DetailTemplate>
    </div>
  )
}
