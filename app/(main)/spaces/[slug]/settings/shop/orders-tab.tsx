import { formatDateMedium } from '@/lib/format-date'
import { Receipt, Wallet, Landmark, RotateCcw, CreditCard } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { listSpaceOrders, readCompleteSpaceEarnings, sellerNames, type CommerceOrder } from '@/lib/commerce/orders'
import { listSpaceTicketAndDonationSales, type SpaceSale } from '@/lib/commerce/space-sales'
import { OrderFulfilmentControl } from '@/components/marketplace/order-fulfilment-control'
import { OrderShareNote } from '@/components/marketplace/order-share-note'
import { setOrderFulfillmentAction } from './shop-actions'
import { RefundSaleButton } from './refund-sale-button'

// The Orders tab of the Shop console (ADR-596). A Space's sales + earnings, scoped by owner_space_id
// (listOrdersForSeller filters owner_profile_id, which is null for a Space, so a Space's orders are
// invisible through the maker path). Each order that needs sending carries the seller's fulfilment door
// (LIVE-606): mark it shipped with a carrier and tracking, then delivered, then complete. A staff
// preview (`readOnly`) sees the state and no door. While billing is gated OFF there are no settled
// orders, so this shows a calm "no orders yet" state. No em or en dashes.
//
// A split order that pays this Space (LIVE-624) is listed as the Space's SHARE of it: its lines, its
// gross in the amount column, and a share line with the net and where the payout stands. Its door
// moves the Space's OWN share (LIVE-705, ADR-1652): the writer finds the order through the Space's
// transfer row, and the step shown is the share's, not the other sellers'.
//
// TICKETS AND DONATIONS LIST HERE TOO (LIVE-2545). The money cards above this tab count shop orders,
// ticket sales and donations; the list used to read shop orders alone, so a ticket sale showed in the
// totals and nowhere else. Every sale now lists with who bought, what, how much, when and its status,
// newest first, so the list and the cards count the same sales.
//
// EVERY SALE THAT STANDS CAN BE REFUNDED HERE (LIVE-2550), by the owner or a Space admin. A split
// order (this Space's share of a charge that pays other sellers too) has no door: it stays with staff.

function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function when(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return formatDateMedium(d)
}

const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid',
  fulfilled: 'Fulfilled',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

const KIND_LABEL: Record<SpaceSale['kind'], string> = { ticket: 'Ticket', donation: 'Donation', order: 'Order' }

type Row = { at: string; order: CommerceOrder; sale?: undefined } | { at: string; sale: SpaceSale; order?: undefined }

export async function OrdersTab({
  spaceId,
  slug,
  readOnly = false,
  canRefund = false,
}: {
  spaceId: string
  slug: string
  readOnly?: boolean
  /** The viewer is the owner or a Space admin, so each sale that stands carries a Refund door. */
  canRefund?: boolean
}) {
  const [orders, sales, earnings] = await Promise.all([
    listSpaceOrders(spaceId, { limit: 50 }),
    listSpaceTicketAndDonationSales(spaceId, { limit: 50 }),
    readCompleteSpaceEarnings(spaceId),
  ])
  const buyerNames = await sellerNames(
    orders.filter((o) => o.buyerProfileId).map((o) => ({ kind: 'profile', profileId: o.buyerProfileId, spaceId: null })),
  )
  const rows: Row[] = [
    ...orders.map((o) => ({ at: o.paidAt ?? o.createdAt, order: o })),
    ...sales.map((s) => ({ at: s.at, sale: s })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 50)

  if (rows.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState
          icon={Receipt}
          variant="first-use"
          title="No orders yet."
          description="When someone buys a ticket, an item or a service, or gives a donation, it shows up here with what you earned. Payouts run straight to your connected account."
        />
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      {/* The card fee is its own line once it passes through (LIVE-2422, ADR-1978); before the date it is 0 and hidden. */}
      <div className={`grid gap-3 ${earnings?.cardFeeCents ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        <StatCard bordered size="sm" label="Net earned" value={earnings ? usd(earnings.netCents) : 'Unavailable'} icon={Wallet} />
        <StatCard bordered size="sm" label="Finder’s fee" value={earnings ? usd(earnings.feeCents) : 'Unavailable'} icon={Landmark} />
        {earnings?.cardFeeCents ? (
          <StatCard bordered size="sm" label="Card fee" value={usd(earnings.cardFeeCents)} icon={CreditCard} />
        ) : null}
        <StatCard bordered size="sm" label="Refunded" value={earnings ? usd(earnings.refundedCents) : 'Unavailable'} icon={RotateCcw} />
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {rows.map((r) =>
          r.sale ? (
            <li key={`${r.sale.kind}:${r.sale.id}`} className="p-4" data-sale-kind={r.sale.kind}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-medium text-text">
                    {r.sale.title}
                    {r.sale.qty > 1 ? ` ×${r.sale.qty}` : ''}
                  </p>
                  <p className="truncate text-meta text-muted">
                    {KIND_LABEL[r.sale.kind]} · {r.sale.buyer ?? 'Guest'} · {when(r.sale.at)} · {r.sale.status === 'refunded' ? 'Refunded' : 'Paid'}
                  </p>
                </div>
                <p className="shrink-0 text-body-sm font-semibold text-text">{usd(r.sale.amountCents)}</p>
              </div>
              {canRefund && r.sale.status === 'paid' && r.sale.kind !== 'order' && r.sale.amountCents > 0 ? (
                <RefundSaleButton slug={slug} kind={r.sale.kind} id={r.sale.id} amountLabel={usd(r.sale.amountCents)} />
              ) : null}
            </li>
          ) : (
            <li key={r.order.id} className="p-4" data-order-fulfilment={r.order.needsFulfilment ? r.order.fulfillmentStatus : undefined}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-medium text-text">
                    {r.order.items[0]?.title ?? 'Order'}
                    {r.order.items.length > 1 ? ` +${r.order.items.length - 1}` : ''}
                  </p>
                  <p className="truncate text-meta text-muted">
                    Order · {(r.order.buyerProfileId && buyerNames.get(`profile:${r.order.buyerProfileId}`)) || 'Guest'} ·{' '}
                    {when(r.order.paidAt ?? r.order.createdAt)} · {STATUS_LABEL[r.order.status] ?? r.order.status}
                  </p>
                </div>
                <p className="shrink-0 text-body-sm font-semibold text-text">{usd(r.order.amountCents)}</p>
              </div>
              <OrderShareNote order={r.order} />
              {canRefund && !r.order.share && r.order.fundsFlow !== 'separate' && (r.order.status === 'paid' || r.order.status === 'fulfilled') ? (
                <RefundSaleButton slug={slug} kind="order" id={r.order.id} amountLabel={usd(r.order.amountCents)} />
              ) : null}
              <OrderFulfilmentControl
                order={r.order}
                action={setOrderFulfillmentAction.bind(null, slug, r.order.id)}
                readOnly={readOnly}
              />
            </li>
          ),
        )}
      </ul>
    </div>
  )
}
