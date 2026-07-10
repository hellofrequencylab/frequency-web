import { Suspense } from 'react'
import Link from 'next/link'
import { Store, Plus } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { getMyProfileId } from '@/lib/auth'
import { listMarketListings } from '@/lib/commerce/products'
import { MARKET_GROUPS, asMarketGroup, type MarketGroup } from '@/lib/commerce/types'
import { ProductCard } from '@/components/marketplace/product-card'
import { MarketplaceFacets } from '@/components/marketplace/facet-nav'
import { MarketplaceHiddenBanner } from '@/components/marketplace/hidden-banner'

// Market — the community commerce umbrella (ADR-593). One browse surface grouping Products / Services /
// Tickets, aggregating market-published listings across makers (owner_kind='profile') and Business
// Spaces ('space'). A ?group= rail narrows to one type; the default shows each non-empty group as a
// section. Only listings the owner opted into the Market (market_published) appear. No em or en dashes.

export const metadata = {
  title: 'Market',
  description: 'Products, services, and tickets from people and businesses in the Frequency community.',
}

const GROUP_LABEL: Record<MarketGroup, string> = { products: 'Products', services: 'Services', tickets: 'Tickets' }

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-56 rounded-2xl" />
      ))}
    </div>
  )
}

function Grid({ items }: { items: Awaited<ReturnType<typeof listMarketListings>> }) {
  return (
    <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
      {items.map((p) => (
        <ProductCard key={p.id} product={p} href={`/market/${p.id}`} />
      ))}
    </div>
  )
}

// One group's grid (used when a ?group= is selected — the focused view).
async function GroupGrid({ group, q }: { group: MarketGroup; q?: string }) {
  const items = await listMarketListings({ group, q })
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Store}
        variant="first-use"
        title={`No ${GROUP_LABEL[group].toLowerCase()} yet.`}
        description="When people and businesses publish to the Market, they show up here."
      />
    )
  }
  return <div className="@container">{<Grid items={items} />}</div>
}

// The default (all-groups) view: each non-empty group as its own section.
async function AllGroups({ q }: { q?: string }) {
  const perGroup = await Promise.all(MARKET_GROUPS.map((g) => listMarketListings({ group: g, q, limit: 12 })))
  const sections = MARKET_GROUPS.map((g, i) => ({ group: g, items: perGroup[i] })).filter((s) => s.items.length > 0)
  if (sections.length === 0) {
    return (
      <EmptyState
        icon={Store}
        variant="first-use"
        title="Nothing in the Market yet."
        description="This is where the community sells. Publish a product, service, or ticket and it shows up here."
      />
    )
  }
  return (
    <div className="@container space-y-10">
      {sections.map((s) => (
        <section key={s.group}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-text">{GROUP_LABEL[s.group]}</h2>
            <Link href={`/market?group=${s.group}`} className="text-sm font-medium text-primary-strong hover:underline">
              See all
            </Link>
          </div>
          <Grid items={s.items} />
        </section>
      ))}
    </div>
  )
}

function GroupRail({ active }: { active: MarketGroup | null }) {
  const tabs: { key: MarketGroup | null; label: string }[] = [
    { key: null, label: 'All' },
    ...MARKET_GROUPS.map((g) => ({ key: g, label: GROUP_LABEL[g] })),
  ]
  return (
    <nav aria-label="Market groups" className="flex flex-wrap gap-1 rounded-2xl border border-border bg-surface p-1 shadow-sm">
      {tabs.map((t) => {
        const on = t.key === active
        const href = t.key ? `/market?group=${t.key}` : '/market'
        return (
          <Link
            key={t.label}
            href={href}
            aria-current={on ? 'page' : undefined}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${
              on ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface-elevated hover:text-text'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; group?: string | string[] }>
}) {
  const { q, group: groupParam } = await searchParams
  const group = asMarketGroup(groupParam)
  const viewerProfileId = await getMyProfileId()

  return (
    <IndexTemplate
      title="Market"
      description="Products, services, and tickets from people and businesses in the community. Buy direct, the seller gets paid, the fee stays low."
      action={
        viewerProfileId ? (
          <div className="flex items-center gap-2">
            <Link href="/market/manage" className={buttonClasses('secondary', 'sm')}>
              My storefront
            </Link>
            <Link href="/market/sell" className={buttonClasses('primary', 'md')}>
              <Plus className="h-4 w-4" aria-hidden />
              List a product
            </Link>
          </div>
        ) : undefined
      }
      toolbar={
        <div className="space-y-3">
          <MarketplaceFacets active="makers" />
          <GroupRail active={group} />
        </div>
      }
    >
      <MarketplaceHiddenBanner area="makers" />
      <Suspense key={`${group ?? 'all'}:${q ?? ''}`} fallback={<GridSkeleton />}>
        {group ? <GroupGrid group={group} q={q} /> : <AllGroups q={q} />}
      </Suspense>
    </IndexTemplate>
  )
}
