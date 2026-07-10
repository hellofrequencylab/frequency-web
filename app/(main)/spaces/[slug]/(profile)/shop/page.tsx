import { notFound } from 'next/navigation'
import { Store } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { readStorefrontConfig } from '@/lib/spaces/storefront'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { listPublicSpaceCatalog } from '@/lib/commerce/products'
import { productRatingsFor } from '@/lib/commerce/reviews'
import { marketGroupForKind, MARKET_GROUPS, type MarketGroup } from '@/lib/commerce/types'
import { ProductCard } from '@/components/marketplace/product-card'
import { EmptyState } from '@/components/ui/empty-state'

// THE PUBLIC SPACE SHOP TAB (ADR-596). The member-facing storefront: this Space's active catalog grouped
// by type (Products / Services / Tickets). Identity Hero + tab chrome come from the (profile) layout; this
// is the body. DOUBLE-GATED: the nav (profile-nav.ts) only HIDES the tab when unpublished, but the /shop
// URL is still directly reachable, so this route also refuses it when the storefront is not published.
// Reads the PUBLIC catalog (status='active' only), never the console reader (which leaks drafts).

const GROUP_LABEL: Record<MarketGroup, string> = { products: 'Products', services: 'Services', tickets: 'Tickets' }

export default async function SpaceShopTabPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) notFound()
  setActiveSpace(space)

  // Double-gate: the nav hides the tab when unpublished, but the /shop URL is still directly reachable,
  // so refuse it here when the storefront is not published OR the Space is not a Shop-capable type
  // (matches the write-side isConsoleSpaceType gate — defense in depth).
  const storefront = readStorefrontConfig(space.preferences)
  if (!storefront.published || !isConsoleSpaceType(space.type)) notFound()

  const items = await listPublicSpaceCatalog(space.id)
  // Trust & Safety (Phase 8): aggregate ratings per item (batch); every item shares this Space's
  // verification, so the badge is derived once from the Space type (a Business/nonprofit page = verified).
  const ratings = await productRatingsFor(items.map((p) => p.id))
  const spaceVerified = isConsoleSpaceType(space.type)
  const sections = MARKET_GROUPS.map((g) => ({
    group: g,
    items: items.filter((p) => marketGroupForKind(p.productKind) === g),
  })).filter((s) => s.items.length > 0)

  if (sections.length === 0) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        <EmptyState
          icon={Store}
          title="Nothing here yet."
          description="This shop has no items listed right now. Check back soon."
        />
      </div>
    )
  }

  return (
    <div className="@container mx-auto w-full max-w-4xl space-y-10 px-4 py-6">
      {sections.map((s) => (
        <section key={s.group}>
          <h2 className="mb-4 text-lg font-bold text-text">{GROUP_LABEL[s.group]}</h2>
          <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
            {s.items.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                href={`/market/${p.id}`}
                rating={ratings.get(p.id) ?? null}
                verified={spaceVerified}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
