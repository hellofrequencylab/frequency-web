import { Suspense } from 'react'
import Link from 'next/link'
import { Hammer, Plus } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { getMyProfileId } from '@/lib/auth'
import { listMakerProducts } from '@/lib/commerce/products'
import { ProductCard } from '@/components/marketplace/product-card'
import { MarketplaceFacets } from '@/components/marketplace/facet-nav'

// Makers — the Etsy-like market (commerce core, owner_kind='profile'). Index of
// member products. Selling needs a payouts-ready Connect account; buying needs nothing.

export const metadata = {
  title: 'Makers',
  description: 'Handmade and small-batch goods from makers in the Frequency community.',
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-56 rounded-2xl" />
      ))}
    </div>
  )
}

async function MakersGrid({ q }: { q?: string }) {
  const products = await listMakerProducts({ q })
  if (products.length === 0) {
    return (
      <EmptyState
        icon={Hammer}
        variant="first-use"
        title="No makers yet."
        description="If you make something, this is your shelf. Open a maker storefront and list your first piece."
      />
    )
  }
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} href={`/marketplace/makers/${p.id}`} />
        ))}
      </div>
    </div>
  )
}

export default async function MakersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const viewerProfileId = await getMyProfileId()
  return (
    <IndexTemplate
      title="Makers"
      description="Handmade and small-batch, from people in the community. Buy direct. The maker gets paid, the fee stays low."
      action={
        viewerProfileId ? (
          <div className="flex items-center gap-2">
            <Link href="/marketplace/makers/manage" className={buttonClasses('secondary', 'sm')}>
              My storefront
            </Link>
            <Link href="/marketplace/makers/sell" className={buttonClasses('primary', 'md')}>
              <Plus className="h-4 w-4" aria-hidden />
              List a piece
            </Link>
          </div>
        ) : undefined
      }
      toolbar={<MarketplaceFacets active="makers" />}
    >
      <Suspense key={q ?? ''} fallback={<GridSkeleton />}>
        <MakersGrid q={q} />
      </Suspense>
    </IndexTemplate>
  )
}
