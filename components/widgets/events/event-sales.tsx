import { getEventContext } from '@/lib/events/active-event'
import { RefundTicketButton } from '@/app/(main)/events/[slug]/ticket-button'
import { soldTicketBuyer } from '@/lib/events/sold-ticket-buyer'
import { Badge } from '@/components/ui/badge'

// The host-only ticket-sales list (the `event-sales` layout module): a self-fetching RSC bound in
// the widget registry that renders the event's succeeded ticket sales with a per-row refund control.
// Reads everything from the request-scoped event context (lib/events/active-event.ts) — no props,
// no re-fetch. Self-gates to managers of a paid event; renders nothing for everyone else (a viewer
// without edit settings, or a free event), so the module never leaves an empty slot.
export const EventSales = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  const { event, canManage, isPaidEvent, soldTickets } = ctx
  if (!canManage || !isPaidEvent) return null

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="eyebrow text-subtle">
        Sales <span className="ml-1 font-normal normal-case text-muted">{soldTickets.length} sold</span>
      </p>
      {soldTickets.length === 0 ? (
        <p className="mt-2 text-body-sm text-subtle">No tickets sold yet.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {soldTickets.map((t) => {
            // A guest buyer is their address, a member is their name, and a buyer whose account is
            // gone says so (LIVE-319). The Guest tag is what tells the host this row has no profile
            // to click through to and no seat under a member's name at the door.
            const who = soldTicketBuyer({ buyer: t.buyer, guestEmail: t.guest_email })
            return (
            <li key={t.id} className="flex items-center justify-between gap-3 text-body-sm">
              <span className="min-w-0 truncate text-text">
                <span className={who.kind === 'gone' ? 'text-muted' : undefined}>{who.label}</span>
                {who.kind === 'guest' ? (
                  <Badge tone="neutral" size="sm" className="ml-1.5 align-middle">
                    Guest
                  </Badge>
                ) : null}
                <span className="ml-2 text-subtle">
                  ${(t.amount_cents / 100).toFixed(2)}
                  {t.qty > 1 ? ` · ${t.qty}×` : ''}
                </span>
              </span>
              <RefundTicketButton
                ticketId={t.id}
                eventId={event.id}
                slug={event.slug}
                amountLabel={`$${(t.amount_cents / 100).toFixed(2)}`}
              />
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
