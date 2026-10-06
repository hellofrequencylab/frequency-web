import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Receipt, ShoppingBag, Truck } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { resolveIndexHero } from '@/lib/layout/index-hero'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { getMyProfileId } from '@/lib/auth'
import { rateLimitOk } from '@/lib/rate-limit'
import { recordCommerceOrderFromSessionId } from '@/lib/commerce/checkout'
import { listOrdersForBuyer, sellerNames, sellerNameKey, type CommerceOrder } from '@/lib/commerce/orders'
import { disputesForOrders, type CommerceDispute } from '@/lib/commerce/disputes'
import { DisputeButton } from '@/components/marketplace/dispute-button'
import { FULFILLMENT_LABEL, orderNeedsFulfilment, type OrderFulfilment } from '@/lib/commerce/fulfilment-state'
import type { FulfillmentStatus } from '@/lib/commerce/types'

// My Orders — a member's purchase history across Makers + Shop. Checkout's success_url
// lands here. Connect-only verticals (General / Housing) never create orders. An order that needs
// sending shows where it stands and the tracking link once the seller marks it shipped (LIVE-606).
// A split order (one payment, several sellers, LIVE-621) lists its lines under each seller's name, so
// the buyer can tell who is sending what (LIVE-624), and each seller's group says where THAT
// seller's share stands, since each ships their own (LIVE-705).

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

type Line = CommerceOrder['items'][number]

/** The order's lines, one group per seller on a split order and one unlabelled group otherwise. PURE. */
function lineGroups(order: CommerceOrder, names: Map<string, string>): { key: string; label: string | null; items: Line[] }[] {
  if (order.fundsFlow !== 'separate') return [{ key: 'all', label: null, items: order.items }]
  const groups = new Map<string, { key: string; label: string; items: Line[] }>()
  for (const it of order.items) {
    const key = it.seller ? sellerNameKey(it.seller) : 'unknown'
    const label = it.seller ? names.get(key) ?? (it.seller.kind === 'space' ? 'A Space' : 'A maker') : 'A seller'
    const g = groups.get(key) ?? { key, label, items: [] }
    g.items.push(it)
    groups.set(key, g)
  }
  return [...groups.values()]
}

/** Where a shipment stands, with its carrier and tracking link. */
function ShippingLine({ status, f }: { status: FulfillmentStatus; f: OrderFulfilment }) {
  return (
    <p data-order-fulfilment={status} className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-muted">
      <Truck className="h-4 w-4 shrink-0" aria-hidden />
      <span className="font-medium text-text">{FULFILLMENT_LABEL[status]}</span>
      {f.carrier && <span>via {f.carrier}</span>}
      {f.tracking &&
        (f.trackingUrl ? (
          <a href={f.trackingUrl} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
            Track {f.tracking}
          </a>
        ) : (
          <span>{f.tracking}</span>
        ))}
    </p>
  )
}

function OrderCard({
  order,
  dispute,
  names,
}: {
  order: CommerceOrder
  dispute: CommerceDispute | null
  names: Map<string, string>
}) {
  const when = new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  // A dispute makes sense on a completed purchase, not a failed / cancelled checkout.
  const disputable = order.status === 'paid' || order.status === 'fulfilled'
  // Shipping state only for a settled order with something to send: a booking or a Journey is never
  // "not sent yet", and a refunded order is not on its way anywhere.
  const shippingState = disputable && order.needsFulfilment
  // A split order says where each seller's share stands under that seller's lines (LIVE-705). If the
  // shares could not be read, the order's roll-up line below stands in for them.
  const byShare = order.fundsFlow === 'separate' && order.sellerFulfilments
    ? new Map(order.sellerFulfilments.map((s) => [sellerNameKey(s.seller), s]))
    : null
  return (
    <div className="rounded-card border border-border bg-surface p-4 lift-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-meta text-subtle">{when}</span>
        <span className={`rounded-pill px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide ${STATUS_TONE[order.status] ?? 'bg-surface-elevated text-muted'}`}>
          {order.status}
        </span>
      </div>
      {lineGroups(order, names).map((g) => (
        <div key={g.key} data-order-seller={g.label ? g.key : undefined} className="mt-3">
          {g.label && <p className="text-meta font-medium text-subtle">From {g.label}</p>}
          <ul className="mt-1 space-y-1">
            {g.items.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 text-body-sm text-text">
                <span>
                  {it.title}
                  {it.qty > 1 && <span className="text-subtle"> × {it.qty}</span>}
                </span>
                <span className="text-muted">{usd(it.subtotalCents, order.currency)}</span>
              </li>
            ))}
          </ul>
          {byShare && disputable && orderNeedsFulfilment(g.items.map((it) => it.productKind)) && byShare.get(g.key) && (
            <ShippingLine status={byShare.get(g.key)!.fulfillmentStatus} f={byShare.get(g.key)!.fulfilment} />
          )}
        </div>
      ))}
      {shippingState && !byShare && <ShippingLine status={order.fulfillmentStatus} f={order.fulfilment} />}
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-body-sm font-semibold text-text">Total</span>
        <span className="text-body-sm font-semibold text-text">{usd(order.amountCents, order.currency)}</span>
      </div>
      {(disputable || dispute) && (
        <div className="mt-3 border-t border-border pt-3">
          <DisputeButton
            orderId={order.id}
            existing={dispute ? { id: dispute.id, status: dispute.status } : null}
          />
        </div>
      )}
    </div>
  )
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; booked?: string; session_id?: string }>
}) {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/orders')
  const params = await searchParams
  const justPaid = params.ok === '1'
  const justBooked = params.booked === '1'

  // SCAN-711: hosted Checkout lands here with ?ok=1&session_id=cs_… BEFORE the webhook has usually
  // arrived, and the list hides pending rows, so a buyer who had just been charged read "No orders
  // yet" with no confirmation. Settle the session on the way in, the same backstop the on-page form
  // runs (settleCommerceOrderAction): rate-limited per IP, fails open when the limiter is unwired
  // because this runs after a successful charge, and never fatal, since the webhook still owes the
  // order. The flip is guarded by status = pending, so a second visit is a no-op.
  const sessionId = params.session_id ?? ''
  if (sessionId.startsWith('cs_')) {
    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (await rateLimitOk('settle_commerce_order', ip, 30, '1 m', { whenUnconfigured: 'allow' })) {
      try {
        await recordCommerceOrderFromSessionId(sessionId)
      } catch (e) {
        console.error('[orders] settle on return failed; the webhook still owes the order', { sessionId, e })
      }
    }
  }
  const orders = await listOrdersForBuyer(profileId)
  const [disputes, names] = await Promise.all([
    disputesForOrders(orders.map((o) => o.id)),
    // Seller names only for split orders, the one card that labels its lines by seller.
    sellerNames(orders.filter((o) => o.fundsFlow === 'separate').flatMap((o) => o.items.flatMap((it) => (it.seller ? [it.seller] : [])))),
  ])

  const hero = await resolveIndexHero('/orders')

  return (
    <IndexTemplate
      {...hero}
      title="My orders"
      description="Everything you've bought from the Market and the Frequency Store."
    >
      {(justPaid || justBooked) && (
        <div
          role="status"
          className="mb-4 rounded-card border border-success bg-success-bg px-4 py-3 text-body-sm text-success"
        >
          {justBooked ? 'You’re booked. Your booking is below.' : 'Payment received. Your order is below.'}
        </div>
      )}
      {orders.length === 0 ? (
        <EmptyState
          icon={Receipt}
          variant="first-use"
          title="No orders yet."
          description="When you buy from the Market or the Frequency Store, your orders show up here."
          action={
            <Link href="/market" className={buttonClasses('primary', 'md')}>
              <ShoppingBag className="h-4 w-4" aria-hidden />
              Browse the Market
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} dispute={disputes.get(o.id) ?? null} names={names} />
          ))}
        </div>
      )}
    </IndexTemplate>
  )
}
