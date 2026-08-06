import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Hammer, Plus, Wallet, CheckCircle2, Rocket, PackageX, EyeOff, Trash2 } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { getMyProfileId } from '@/lib/auth'
import { listMyMakerProducts } from '@/lib/commerce/products'
import { listOrdersForSeller } from '@/lib/commerce/orders'
import { getConnectStatus, payoutsLive } from '@/lib/billing/connect'
import type { CommerceProduct } from '@/lib/commerce/types'
import { setMyProductStatusAction, deleteMyProductAction } from '../../marketplace/commerce-actions'

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

// A compact icon-only SUBMIT control (the storefront row-actions read as a tight icon
// cluster, not a wrap of labelled buttons). This page is where the density was designed,
// and IconButton was extracted FROM it -- so the shape now comes back the other way: the
// only thing left here is `type="submit"`, because each action is its own server-action
// form. Everything else (the 32px floor, the 44px coarse target, the focus ring, the
// press) belongs to the primitive.
function IconSubmit({ label, danger = false, children }: { label: string; danger?: boolean; children: ReactNode }) {
  return (
    <IconButton type="submit" label={label} tone={danger ? 'danger' : 'default'}>
      {children}
    </IconButton>
  )
}

function ProductRow({ p }: { p: CommerceProduct }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4 lift-1">
      <div className="min-w-0">
        <Link href={`/market/${p.id}`} className="font-medium text-text hover:text-primary">
          {p.title}
        </Link>
        <p className="text-body-sm text-subtle">
          {usd(p.priceCents, p.currency)} · <span className="uppercase tracking-wide">{STATUS_LABEL[p.status] ?? p.status}</span>
        </p>
      </div>
      <div className="flex items-center gap-1">
        {p.status !== 'active' && (
          <form action={setMyProductStatusAction.bind(null, p.id, 'active')}>
            <IconSubmit label="Publish"><Rocket className="h-4 w-4" /></IconSubmit>
          </form>
        )}
        {p.status === 'active' && (
          <>
            <form action={setMyProductStatusAction.bind(null, p.id, 'sold_out')}>
              <IconSubmit label="Mark sold out"><PackageX className="h-4 w-4" /></IconSubmit>
            </form>
            <form action={setMyProductStatusAction.bind(null, p.id, 'draft')}>
              <IconSubmit label="Unpublish"><EyeOff className="h-4 w-4" /></IconSubmit>
            </form>
          </>
        )}
        <form action={deleteMyProductAction.bind(null, p.id)}>
          <IconSubmit label="Delete" danger><Trash2 className="h-4 w-4" /></IconSubmit>
        </form>
      </div>
    </div>
  )
}

export default async function MakerManagePage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/market/manage')

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
        <Link href="/market/sell" className={buttonClasses('primary', 'md')}>
          <Plus className="h-4 w-4" aria-hidden />
          List a product
        </Link>
      }
    >
      {/* Payout readiness */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface-elevated p-4">
        <div className="flex items-center gap-3">
          {connect.ready ? (
            <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />
          ) : (
            <Wallet className="h-5 w-5 text-subtle" aria-hidden />
          )}
          <div>
            <p className="text-body-sm font-medium text-text">
              {connect.ready ? 'Payouts are set up' : 'Set up payouts to get paid'}
            </p>
            <p className="text-meta text-subtle">
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
        <p className="mb-6 text-body-sm text-muted">
          <span className="font-semibold text-text">{sales.length}</span> {sales.length === 1 ? 'sale' : 'sales'} ·{' '}
          <span className="font-semibold text-text">{usd(salesTotal)}</span> gross
        </p>
      )}

      {products.length === 0 ? (
        <EmptyState
          icon={Hammer}
          variant="first-use"
          title="Nothing listed yet."
          description="List your first product. It shows up in the Market right away."
          action={
            <Link href="/market/sell" className={buttonClasses('primary', 'md')}>
              <Plus className="h-4 w-4" aria-hidden />
              List a product
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
