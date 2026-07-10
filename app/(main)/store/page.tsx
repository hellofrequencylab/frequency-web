import { Store, ShoppingBag } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { listShopProducts } from '@/lib/commerce/products'
import { ProductCard } from '@/components/marketplace/product-card'
import { MarketHero } from '@/components/marketplace/market-hero'
import { MarketSearchBar } from '@/components/marketplace/market-search-bar'
import { MarketplaceFacets } from '@/components/marketplace/facet-nav'
import { MarketplaceHiddenBanner } from '@/components/marketplace/hidden-banner'

// Frequency Store — first-party Frequency retail (commerce core, owner_kind='platform'). Frequency is the
// seller. Hero-led (the site PhotoHero grammar). Distinct from the Vault (Gems) and a Space's Shop tab.

export const metadata = {
  title: 'Frequency Store',
  description: 'Frequency merch, event passes, and retreats.',
}

const HERO_IMAGE = 'https://picsum.photos/seed/frequency-store/1600/600'

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const query = (q ?? '').trim().toLowerCase()
  const allProducts = await listShopProducts()
  const products = query
    ? allProducts.filter((p) => `${p.title} ${p.description ?? ''}`.toLowerCase().includes(query))
    : allProducts
  return (
    <div className="space-y-8">
      <MarketHero
        image={HERO_IMAGE}
        eyebrow="Frequency Store"
        title="Wear it, gift it, show up"
        subtitle="Frequency merch, event passes, and retreats, straight from us to you."
        search={<MarketSearchBar placeholder="Search the Store" />}
      />

      <MarketplaceHiddenBanner area="shop" />

      <div className="space-y-6">
        <MarketplaceFacets active="shop" />

        <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
          <StatCard size="sm" label="In stock" value={allProducts.length} icon={ShoppingBag} />
          <StatCard size="sm" label="Shipping" value="Flat" icon={Store} />
        </div>

        {products.length === 0 ? (
          <EmptyState
            icon={Store}
            variant="first-use"
            title="The Store is being stocked."
            description="Merch, event passes, and retreats are coming. Check back soon."
          />
        ) : (
          <div className="@container">
            <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} href={`/store/${p.id}`} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
