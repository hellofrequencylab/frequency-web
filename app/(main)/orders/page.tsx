import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Receipt, ShoppingBag } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { getMyProfileId } from '@/lib/auth'
import { listOrdersForBuyer, type CommerceOrder } from '@/lib/commerce/orders'

// My Orders — a member's purchase history across Makers + Shop. Checkout's success_url
// lands here. Connect-only verticals (General / Housing) never create orders.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My orders' }

function usd(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

const STATUS_TONE: Record<string, string> = {
  paid: 'bg-primary-bg text-primary-strong',
  fulfilled: 'bg-primary-bg text-primary-strong',
  refunded: 'bg-surface-elevated text-muted',
  cancelled: 'bg-surface-elevated text-muted',
  failed: 'bg-surface-elevated text-warning',
}

function OrderCard({ order }: { order: CommerceOrder }) {
  const when = new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-subtle">{when}</span>
        <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide ${STATUS_TONE[order.status] ?? 'bg-surface-elevated text-muted'}`}>
          {order.status}
        </span>
      </div>
      <ul className="mt-3 space-y-1">
        {order.items.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-3 text-sm text-text">
            <span>
              {it.title}
              {it.qty > 1 && <span className="text-subtle"> × {it.qty}</span>}
            </span>
            <span className="text-muted">{usd(it.subtotalCents, order.currency)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-semibold text-text">Total</span>
        <span className="text-sm font-semibold text-text">{usd(order.amountCents, order.currency)}</span>
      </div>
    </div>
  )
}

export default async function OrdersPage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/orders')
  const orders = await listOrdersForBuyer(profileId)

  return (
    <IndexTemplate title="My orders" description="Everything you've bought from makers and the Frequency shop.">
      {orders.length === 0 ? (
        <EmptyState
          icon={Receipt}
          variant="first-use"
          title="No orders yet."
          description="When you buy from a maker or the shop, your orders show up here."
          action={
            <Link href="/marketplace/makers" className={buttonClasses('primary', 'md')}>
              <ShoppingBag className="h-4 w-4" aria-hidden />
              Browse makers
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </IndexTemplate>
  )
}
