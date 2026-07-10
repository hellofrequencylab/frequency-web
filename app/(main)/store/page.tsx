import { Suspense } from 'react'
import { Store } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { listShopProducts } from '@/lib/commerce/products'
import { ProductCard } from '@/components/marketplace/product-card'
import { MarketplaceFacets } from '@/components/marketplace/facet-nav'
import { MarketplaceHiddenBanner } from '@/components/marketplace/hidden-banner'

// Frequency Store — first-party Frequency retail (commerce core, owner_kind='platform').
// Frequency is the seller. Distinct from the Vault (Gems) and a Space's own Shop tab.

export const metadata = {
  title: 'Frequency Store',
  description: 'Frequency merch, event passes, and retreats.',
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-60 rounded-2xl" />
      ))}
    </div>
  )
}

async function ShopGrid() {
  const products = await listShopProducts()
  if (products.length === 0) {
    return (
      <EmptyState
        icon={Store}
        variant="first-use"
        title="The Store is being stocked."
        description="Merch, event passes, and retreats are coming. Check back soon."
      />
    )
  }
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} href={`/store/${p.id}`} />
        ))}
      </div>
    </div>
  )
}

export default function ShopPage() {
  return (
    <IndexTemplate
      title="Frequency Store"
      description="Frequency merch, event passes, and retreats. Wear it, gift it, show up."
      toolbar={<MarketplaceFacets active="shop" />}
    >
      <MarketplaceHiddenBanner area="shop" />
      <Suspense fallback={<GridSkeleton />}>
        <ShopGrid />
      </Suspense>
    </IndexTemplate>
  )
}
