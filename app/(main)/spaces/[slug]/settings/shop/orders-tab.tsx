import { Receipt, Wallet, Landmark, RotateCcw } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { listSpaceOrders, spaceEarningsSummary } from '@/lib/commerce/orders'
import { OrderFulfilmentControl } from '@/components/marketplace/order-fulfilment-control'
import { OrderShareNote } from '@/components/marketplace/order-share-note'
import { setOrderFulfillmentAction } from './shop-actions'

// The Orders tab of the Shop console (ADR-596). A Space's sales + earnings, scoped by owner_space_id
// (listOrdersForSeller filters owner_profile_id, which is null for a Space, so a Space's orders are
// invisible through the maker path). Each order that needs sending carries the seller's fulfilment door
// (LIVE-606): mark it shipped with a carrier and tracking, then delivered, then complete. A staff
// preview (`readOnly`) sees the state and no door. While billing is gated OFF there are no settled
// orders, so this shows a calm "no orders yet" state. No em or en dashes.
//
// A split order that pays this Space (LIVE-624) is listed as the Space's SHARE of it: its lines, its
// gross in the amount column, and a share line with the net and where the payout stands. Its
// fulfilment shows read-only: the fulfilment writer binds to the order's owner columns, which a
// split order leaves empty, so a door here would only refuse.

function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function when(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid',
  fulfilled: 'Fulfilled',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

export async function OrdersTab({ spaceId, slug, readOnly = false }: { spaceId: string; slug: string; readOnly?: boolean }) {
  const [orders, earnings] = await Promise.all([listSpaceOrders(spaceId, { limit: 50 }), spaceEarningsSummary(spaceId)])

  if (orders.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState
          icon={Receipt}
          variant="first-use"
          title="No orders yet."
          description="When someone buys from your shop, it shows up here with what you earned. Payouts run straight to your connected account."
        />
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard bordered size="sm" label="Net earned" value={usd(earnings.netCents)} icon={Wallet} />
        <StatCard bordered size="sm" label="Platform fee" value={usd(earnings.feeCents)} icon={Landmark} />
        <StatCard bordered size="sm" label="Refunded" value={usd(earnings.refundedCents)} icon={RotateCcw} />
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {orders.map((o) => (
          <li key={o.id} className="p-4" data-order-fulfilment={o.needsFulfilment ? o.fulfillmentStatus : undefined}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-body-sm font-medium text-text">
                  {o.items[0]?.title ?? 'Order'}
                  {o.items.length > 1 ? ` +${o.items.length - 1}` : ''}
                </p>
                <p className="text-meta text-muted">
                  {when(o.paidAt ?? o.createdAt)} · {STATUS_LABEL[o.status] ?? o.status}
                </p>
              </div>
              <p className="shrink-0 text-body-sm font-semibold text-text">{usd(o.amountCents)}</p>
            </div>
            <OrderShareNote order={o} />
            <OrderFulfilmentControl
              order={o}
              action={setOrderFulfillmentAction.bind(null, slug, o.id)}
              readOnly={readOnly || o.share !== null}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
