import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { Coins, Receipt, Wallet } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { spaceEarningsSummary } from '@/lib/commerce/orders'
import { ShopTabs, toShopTab, type ShopTab } from '@/components/spaces/shop/shop-tabs'
import { CatalogTab } from './catalog-tab'
import { OrdersTab } from './orders-tab'
import { StorefrontTab } from './storefront-tab'

// THE BUSINESS-SPACE SHOP CONSOLE (ADR-596). One DashboardTemplate page, three tabs (Catalog / Orders /
// Storefront), that REPLACES /settings/services. Mirrors the CRM board triad: this page owns the route +
// gate + chrome + stats; the tab bar is URL-driven (?tab=); each tab renders in its own Suspense. Selling
// is a Business-account feature, so the console gates on isConsoleSpaceType (business / nonprofit) exactly
// like the /manage console; free-vs-paid is the take rate (5% vs 3%), not a lock. No em or en dashes.

export const metadata = { title: 'Shop' }

const TAB_COPY: Record<ShopTab, { title: string; description: string }> = {
  catalog: { title: 'Shop', description: 'Your products, services, and tickets. List an item and manage what is live.' },
  orders: { title: 'Orders', description: 'Your sales and what you have earned. Payouts run straight to your account.' },
  storefront: { title: 'Storefront', description: 'Your public Shop tab: its name, and whether it shows on your page.' },
}

export default async function SpaceShopConsolePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string | string[] }>
}) {
  const { slug } = await params
  const { tab } = await searchParams
  const activeTab = toShopTab(tab)

  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) notFound()
  // The Shop is a Business-account surface (business / nonprofit types), like the /manage console.
  if (!isConsoleSpaceType(space.type)) notFound()
  // Shop is now a gateable function: a real manager who fails the `shop` gate (turned off, or their space
  // role is below the min-role) is denied. A staff previewer keeps read-only access (writes re-gate below).
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'shop', caps.role)) notFound()

  const brandName = space.brandName ?? space.name
  const consoleHref = `/spaces/${slug}/settings/shop`
  const readOnly = !canManage && staffViewing

  return (
    <DashboardTemplate
      eyebrow={brandName}
      title={TAB_COPY[activeTab].title}
      description={TAB_COPY[activeTab].description}
      stats={
        <Suspense fallback={<StatsSkeleton />}>
          <ShopStats spaceId={space.id} />
        </Suspense>
      }
      width="wide"
    >
      {readOnly && (
        <p className="rounded-xl border border-border bg-surface-elevated/50 px-3 py-2 text-xs text-subtle">
          You are viewing this space as staff. Changes are turned off.
        </p>
      )}
      <ShopTabs consoleHref={consoleHref} active={activeTab} />

      <Suspense fallback={<TabSkeleton />}>
        {activeTab === 'catalog' && <CatalogTab slug={slug} spaceId={space.id} readOnly={readOnly} />}
        {activeTab === 'orders' && <OrdersTab spaceId={space.id} />}
        {activeTab === 'storefront' && <StorefrontTab slug={slug} preferences={space.preferences} readOnly={readOnly} />}
      </Suspense>
    </DashboardTemplate>
  )
}

function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// The live earnings band for THIS space's commerce (settled orders). Fail-safe to zeros.
async function ShopStats({ spaceId }: { spaceId: string }) {
  const e = await spaceEarningsSummary(spaceId)
  return (
    <>
      <StatCard size="sm" label="Net earned" value={usd(e.netCents)} icon={Wallet} />
      <StatCard size="sm" label="Gross sales" value={usd(e.grossCents)} icon={Coins} />
      <StatCard size="sm" label="Orders" value={e.orderCount} icon={Receipt} />
    </>
  )
}

function StatsSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-elevated/50" />
      ))}
    </>
  )
}

function TabSkeleton() {
  return <div className="mt-4 h-40 animate-pulse rounded-2xl bg-surface-elevated/50" />
}
