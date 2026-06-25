import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Hammer, Plus, Wallet, CheckCircle2 } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { getMyProfileId } from '@/lib/auth'
import { listMyMakerProducts } from '@/lib/commerce/products'
import { listOrdersForSeller } from '@/lib/commerce/orders'
import { getConnectStatus, payoutsLive } from '@/lib/billing/connect'
import type { CommerceProduct } from '@/lib/commerce/types'
import { setMyProductStatusAction, deleteMyProductAction } from '../../commerce-actions'

// Seller storefront manager — a maker's own products + payout readiness + recent sales.
// Listing is free; getting paid needs a payout account (Stripe Connect) at /settings/billing.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My storefront' }

function usd(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', active: 'Live', sold_out: 'Sold out', archived: 'Archived',
}

function ProductRow({ p }: { p: CommerceProduct }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="min-w-0">
        <Link href={`/marketplace/makers/${p.id}`} className="font-medium text-text hover:text-primary">
          {p.title}
        </Link>
        <p className="text-sm text-subtle">
          {usd(p.priceCents, p.currency)} · <span className="uppercase tracking-wide">{STATUS_LABEL[p.status] ?? p.status}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {p.status !== 'active' && (
          <form action={setMyProductStatusAction.bind(null, p.id, 'active')}>
            <button type="submit" className={buttonClasses('ghost', 'sm')}>Publish</button>
          </form>
        )}
        {p.status === 'active' && (
          <>
            <form action={setMyProductStatusAction.bind(null, p.id, 'sold_out')}>
              <button type="submit" className={buttonClasses('ghost', 'sm')}>Mark sold out</button>
            </form>
            <form action={setMyProductStatusAction.bind(null, p.id, 'draft')}>
              <button type="submit" className={buttonClasses('ghost', 'sm')}>Unpublish</button>
            </form>
          </>
        )}
        <form action={deleteMyProductAction.bind(null, p.id)}>
          <button type="submit" className={buttonClasses('ghost', 'sm')}>Delete</button>
        </form>
      </div>
    </div>
  )
}

export default async function MakerManagePage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/marketplace/makers/manage')

  const [products, sales, connect, live] = await Promise.all([
    listMyMakerProducts(profileId),
    listOrdersForSeller(profileId),
    getConnectStatus(profileId),
    payoutsLive(),
  ])
  const salesTotal = sales.reduce((sum, o) => sum + o.amountCents, 0)

  return (
    <IndexTemplate
      title="My storefront"
      description="Your maker listings, payouts, and sales in one place."
      action={
        <Link href="/marketplace/makers/sell" className={buttonClasses('primary', 'md')}>
          <Plus className="h-4 w-4" aria-hidden />
          List a piece
        </Link>
      }
    >
      {/* Payout readiness */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-elevated p-4">
        <div className="flex items-center gap-3">
          {connect.ready ? (
            <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />
          ) : (
            <Wallet className="h-5 w-5 text-subtle" aria-hidden />
          )}
          <div>
            <p className="text-sm font-medium text-text">
              {connect.ready ? 'Payouts are set up' : 'Set up payouts to get paid'}
            </p>
            <p className="text-xs text-subtle">
              {!live
                ? 'Listing is open now. Paid checkout turns on when the platform enables payments.'
                : connect.ready
                  ? 'Money from a sale lands in your connected account.'
                  : 'Connect a payout account so a buyer can check out with you.'}
            </p>
          </div>
        </div>
        {!connect.ready && (
          <Link href="/settings/billing" className={buttonClasses('secondary', 'sm')}>
            Set up payouts
          </Link>
        )}
      </div>

      {sales.length > 0 && (
        <p className="mb-6 text-sm text-muted">
          <span className="font-semibold text-text">{sales.length}</span> {sales.length === 1 ? 'sale' : 'sales'} ·{' '}
          <span className="font-semibold text-text">{usd(salesTotal)}</span> gross
        </p>
      )}

      {products.length === 0 ? (
        <EmptyState
          icon={Hammer}
          variant="first-use"
          title="Your shelf is empty."
          description="List your first piece. It shows up in Makers right away."
          action={
            <Link href="/marketplace/makers/sell" className={buttonClasses('primary', 'md')}>
              <Plus className="h-4 w-4" aria-hidden />
              List a piece
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <ProductRow key={p.id} p={p} />
          ))}
        </div>
      )}
    </IndexTemplate>
  )
}
