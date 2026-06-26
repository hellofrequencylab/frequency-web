import { getEventContext } from '@/lib/events/active-event'
import { RefundTicketButton } from '@/app/(main)/events/[slug]/ticket-button'

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
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
        Sales <span className="ml-1 font-normal normal-case text-muted">{soldTickets.length} sold</span>
      </p>
      {soldTickets.length === 0 ? (
        <p className="mt-2 text-sm text-subtle">No tickets sold yet.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {soldTickets.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-text">
                {t.buyer?.display_name ?? 'A member'}
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
          ))}
        </ul>
      )}
    </div>
  )
}
