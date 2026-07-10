import Link from 'next/link'
import { Store, ShoppingCart, Receipt, Flag, ShieldAlert, Plus, Eye, EyeOff } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { listPlatformCatalog, listSpaceCatalog } from '@/lib/commerce/products'
import { orderStatusCounts } from '@/lib/commerce/orders'
import { reportStatusCounts } from '@/lib/commerce/reports'
import { disputeStatusCounts } from '@/lib/commerce/disputes'
import { marketplaceVisibility, MARKET_AREAS, AREA_LABEL } from '@/lib/marketplace/visibility'
import type { CommerceProduct } from '@/lib/commerce/types'
import {
  createShopProductAction,
  setCatalogStatusAction,
  deleteCatalogProductAction,
  setAreaVisibilityAction,
} from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Marketplace · Admin' }

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'

function usd(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

const STATUS_LABEL: Record<string, string> = { draft: 'Draft', active: 'Live', sold_out: 'Sold out', archived: 'Archived' }

function CatalogRow({ p, oversight = false }: { p: CommerceProduct; oversight?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-text">{p.title}</p>
        <p className="text-xs text-subtle">
          {usd(p.priceCents, p.currency)} · <span className="uppercase tracking-wide">{STATUS_LABEL[p.status] ?? p.status}</span>
          {p.stock != null && <span> · {p.stock} in stock</span>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {p.status === 'active' ? (
          <form action={setCatalogStatusAction.bind(null, p.id, oversight ? 'archived' : 'draft')}>
            <button type="submit" className={buttonClasses('ghost', 'sm')}>{oversight ? 'Take down' : 'Unpublish'}</button>
          </form>
        ) : (
          <form action={setCatalogStatusAction.bind(null, p.id, 'active')}>
            <button type="submit" className={buttonClasses('ghost', 'sm')}>Publish</button>
          </form>
        )}
        {!oversight && (
          <>
            <Link href={`/admin/marketplace/${p.id}`} className={buttonClasses('ghost', 'sm')}>Edit</Link>
            <form action={deleteCatalogProductAction.bind(null, p.id)}>
              <button type="submit" className={buttonClasses('ghost', 'sm')}>Delete</button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default async function MarketplaceAdminPage() {
  await requireAdmin('admin', { staff: 'platform' })

  const [catalog, spaceCatalog, orderCounts, reportCounts, disputeCounts, visibility] = await Promise.all([
    listPlatformCatalog(),
    listSpaceCatalog(),
    orderStatusCounts(),
    reportStatusCounts(),
    disputeStatusCounts(),
    marketplaceVisibility(),
  ])
  const liveCount = catalog.filter((p) => p.status === 'active').length
  const ordersDone = (orderCounts.paid ?? 0) + (orderCounts.fulfilled ?? 0)
  const openReports = (reportCounts.open ?? 0) + (reportCounts.reviewing ?? 0)
  const openDisputes = (disputeCounts.open ?? 0) + (disputeCounts.reviewing ?? 0)

  return (
    <AdminTemplate
      title="Marketplace"
      icon={Store}
      eyebrow="Platform"
      description="Stock the first-party Shop, oversee Space storefronts, and keep an eye on orders and reports."
      width="wide"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/admin/marketplace/orders" className={buttonClasses('secondary', 'sm')}>
            <Receipt className="h-4 w-4" aria-hidden /> Orders
          </Link>
          <Link href="/admin/marketplace/reports" className={buttonClasses('secondary', 'sm')}>
            <Flag className="h-4 w-4" aria-hidden /> Reports
          </Link>
          <Link href="/admin/marketplace/disputes" className={buttonClasses('secondary', 'sm')}>
            <ShieldAlert className="h-4 w-4" aria-hidden /> Disputes
          </Link>
        </div>
      }
    >
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Shop products" value={catalog.length} icon={Store} />
        <StatCard label="Live" value={liveCount} icon={ShoppingCart} />
        <StatCard label="Orders" value={ordersDone} icon={Receipt} href="/admin/marketplace/orders" />
        <StatCard label="Open reports" value={openReports} icon={Flag} href="/admin/marketplace/reports" />
        <StatCard label="Open disputes" value={openDisputes} icon={ShieldAlert} href="/admin/marketplace/disputes" />
      </div>

      <AdminSection
        title="Area visibility"
        description="Switch an area OFF to work on it privately. A hidden area vanishes from members' nav and pages; you and other operators still see and edit it."
      >
        <div className="space-y-2">
          {MARKET_AREAS.map((area) => {
            const published = visibility[area]
            return (
              <div key={area} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
                <div className="flex items-center gap-2">
                  {published ? (
                    <Eye className="h-4 w-4 text-primary" aria-hidden />
                  ) : (
                    <EyeOff className="h-4 w-4 text-subtle" aria-hidden />
                  )}
                  <span className="font-medium text-text">{AREA_LABEL[area]}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide ${published ? 'bg-primary-bg text-primary-strong' : 'bg-surface-elevated text-muted'}`}
                  >
                    {published ? 'Published' : 'Hidden'}
                  </span>
                </div>
                <form action={setAreaVisibilityAction.bind(null, area, !published)}>
                  <button type="submit" className={buttonClasses(published ? 'ghost' : 'primary', 'sm')}>
                    {published ? 'Hide' : 'Publish'}
                  </button>
                </form>
              </div>
            )
          })}
        </div>
      </AdminSection>

      <AdminSection title="Add a Shop product" description="First-party merch, passes, or retreats. Saved as a draft; publish to go live.">
        <form action={createShopProductAction} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="title" required maxLength={200} className={FIELD} placeholder="Title" aria-label="Title" />
            <input name="category" maxLength={60} className={FIELD} placeholder="Category (optional)" aria-label="Category" />
            <input name="price" type="number" min="0" step="0.01" required className={FIELD} placeholder="Price (USD)" aria-label="Price" />
            <input name="stock" type="number" min="0" step="1" className={FIELD} placeholder="Stock (blank = unlimited)" aria-label="Stock" />
          </div>
          <textarea name="description" rows={2} maxLength={2000} className={FIELD} placeholder="Description (optional)" aria-label="Description" />
          <div className="flex justify-end">
            <button type="submit" className={buttonClasses('primary', 'md')}>
              <Plus className="h-4 w-4" aria-hidden /> Add product
            </button>
          </div>
        </form>
      </AdminSection>

      <AdminSection title="Shop catalog" description="The first-party storefront at /shop.">
        {catalog.length === 0 ? (
          <EmptyState variant="first-use" icon={Store} title="No products yet" description="Add your first Shop product above." />
        ) : (
          <div className="space-y-2">
            {catalog.map((p) => (
              <CatalogRow key={p.id} p={p} />
            ))}
          </div>
        )}
      </AdminSection>

      <AdminSection title="Space storefronts" description="Products sold by member Spaces. Take one down if it breaks the rules.">
        {spaceCatalog.length === 0 ? (
          <EmptyState variant="cleared" icon={ShoppingCart} title="No Space products" description="When a Space opens a storefront, its products appear here for oversight." />
        ) : (
          <div className="space-y-2">
            {spaceCatalog.map((p) => (
              <CatalogRow key={p.id} p={p} oversight />
            ))}
          </div>
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
