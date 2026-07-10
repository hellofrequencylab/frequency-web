import { Receipt } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { listSpaceOrders, spaceEarningsSummary } from '@/lib/commerce/orders'

// The Orders tab of the Shop console (ADR-593). A Space's sales + earnings, scoped by owner_space_id
// (listOrdersForSeller filters owner_profile_id, which is null for a Space, so a Space's orders are
// invisible through the maker path). Read-only. While billing is gated OFF there are no settled orders,
// so this shows a calm "no orders yet" state. No em or en dashes.

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

export async function OrdersTab({ spaceId }: { spaceId: string }) {
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
      <dl className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-surface p-3">
          <dt className="text-xs text-muted">Net earned</dt>
          <dd className="text-lg font-bold text-text">{usd(earnings.netCents)}</dd>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <dt className="text-xs text-muted">Platform fee</dt>
          <dd className="text-lg font-bold text-text">{usd(earnings.feeCents)}</dd>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <dt className="text-xs text-muted">Refunded</dt>
          <dd className="text-lg font-bold text-text">{usd(earnings.refundedCents)}</dd>
        </div>
      </dl>

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {orders.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">
                {o.items[0]?.title ?? 'Order'}
                {o.items.length > 1 ? ` +${o.items.length - 1}` : ''}
              </p>
              <p className="text-xs text-muted">
                {when(o.paidAt ?? o.createdAt)} · {STATUS_LABEL[o.status] ?? o.status}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold text-text">{usd(o.amountCents)}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
