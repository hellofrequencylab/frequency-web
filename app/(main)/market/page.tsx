import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin, Store } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { listListings, LISTING_KINDS, type ListingKind, type MarketListingWithAuthor } from '@/lib/marketplace'
import { IndexTemplate } from '@/components/templates/index-template'
import { EmptyState } from '@/components/ui/empty-state'
import { NewListingButton } from '@/components/studio/market/new-listing-button'

export const metadata: Metadata = {
  title: 'Marketplace',
  description: 'Swap, give, lend, and find things with people near you — no fees, just neighbors.',
}
export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<ListingKind, string> = Object.fromEntries(LISTING_KINDS.map((k) => [k.key, k.label])) as Record<ListingKind, string>

function ListingCard({ l }: { l: MarketListingWithAuthor }) {
  const place = [l.neighborhood, l.city].filter(Boolean).join(', ')
  return (
    <Link href={`/market/${l.id}`} className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-primary/60">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-primary-strong">
          {KIND_LABEL[l.kind] ?? l.kind}
        </span>
        {l.price_note && <span className="text-sm font-semibold text-text">{l.price_note}</span>}
      </div>
      <h3 className="mt-2 text-sm font-bold text-text">{l.title}</h3>
      {l.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{l.description}</p>}
      <div className="mt-3 flex items-center gap-2 text-xs text-subtle">
        {place && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{place}</span>}
        {l.author && <span className="truncate">· {l.author.display_name}</span>}
      </div>
    </Link>
  )
}

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams
  const activeKind = LISTING_KINDS.some((k) => k.key === kind) ? (kind as ListingKind) : null
  const [profileId, listings] = await Promise.all([
    getMyProfileId(),
    listListings({ kind: activeKind }),
  ])

  return (
    <IndexTemplate
      title="Marketplace"
      description="Swap, give, lend, and find things with people near you. No fees, no in-app payment — just neighbors helping out. Arrange the handoff offline."
      action={profileId ? <NewListingButton /> : undefined}
    >
      {/* Kind filter */}
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/market" className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${!activeKind ? 'bg-primary text-on-primary' : 'bg-surface-elevated text-muted hover:text-text'}`}>All</Link>
        {LISTING_KINDS.map((k) => (
          <Link
            key={k.key}
            href={`/market?kind=${k.key}`}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${activeKind === k.key ? 'bg-primary text-on-primary' : 'bg-surface-elevated text-muted hover:text-text'}`}
          >
            {k.label}
          </Link>
        ))}
      </div>

      {listings.length === 0 ? (
        <EmptyState
          icon={Store}
          title={activeKind ? 'Nothing here yet' : 'The marketplace is just getting started'}
          description={profileId ? 'Post the first listing — offer something, give it away, or ask for what you need.' : 'Sign in to post and respond to listings.'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => <ListingCard key={l.id} l={l} />)}
        </div>
      )}
    </IndexTemplate>
  )
}
