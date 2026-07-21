import { Receipt } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { listAllOrders, orderStatusCounts, type CommerceOrder } from '@/lib/commerce/orders'
import { refundOrderAction } from '../actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Orders · Admin' }

function usd(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

const OWNER_LABEL: Record<string, string> = { platform: 'Shop', profile: 'Maker', space: 'Space' }

function OrderRow({ o }: { o: CommerceOrder }) {
  const when = new Date(o.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const refundable = o.status === 'paid' || o.status === 'fulfilled'
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-text">
          {o.items.map((it) => `${it.title}${it.qty > 1 ? ` ×${it.qty}` : ''}`).join(', ') || 'Order'}
        </p>
        <p className="text-xs text-subtle">
          {OWNER_LABEL[o.ownerKind] ?? o.ownerKind} · {when} · <span className="uppercase tracking-wide">{o.status}</span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-right text-sm">
          <span className="font-semibold text-text">{usd(o.amountCents, o.currency)}</span>
          {o.platformFeeCents > 0 && <span className="block text-2xs text-subtle">fee {usd(o.platformFeeCents, o.currency)}</span>}
        </span>
        {refundable && (
          <form action={refundOrderAction.bind(null, o.id)}>
            <button type="submit" className={buttonClasses('ghost', 'sm')}>Refund</button>
          </form>
        )}
      </div>
    </div>
  )
}

export default async function MarketplaceOrdersPage() {
  await requireAdmin('admin', { staff: 'platform' })
  const [orders, counts] = await Promise.all([listAllOrders({ limit: 200 }), orderStatusCounts()])
  // Gross / fees count only CAPTURED money (paid or fulfilled), matching the Space-side spaceEarningsSummary.
  // listAllOrders returns every status, so a `pending` (unpaid checkout), `cancelled`, `failed`, or already
  // `refunded` order must not pad these tiles (the prior `!== refunded && !== failed` filter let pending +
  // cancelled inflate both figures).
  const captured = orders.filter((o) => o.status === 'paid' || o.status === 'fulfilled')
  const gross = captured.reduce((s, o) => s + o.amountCents, 0)
  const fees = captured.reduce((s, o) => s + o.platformFeeCents, 0)

  return (
    <AdminTemplate
      title="Orders"
      eyebrow="Marketplace"
      description="Every commerce order across the Shop, makers, and Space storefronts. Refund a paid order from here."
      back={{ href: '/admin/marketplace', label: 'Marketplace' }}
      width="wide"
    >
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Paid" value={counts.paid ?? 0} />
        <StatCard label="Refunded" value={counts.refunded ?? 0} />
        <StatCard label="Gross" value={usd(gross)} size="sm" />
        <StatCard label="Platform fees" value={usd(fees)} size="sm" />
      </div>

      <AdminSection>
        {orders.length === 0 ? (
          <EmptyState
            variant="first-use"
            icon={Receipt}
            title="No orders yet"
            description="Orders show up here once buyers start checking out. Checkout turns on with billing."
          />
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <OrderRow key={o.id} o={o} />
            ))}
          </div>
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
