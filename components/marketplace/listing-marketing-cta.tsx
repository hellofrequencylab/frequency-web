// The full-width marketing band at the foot of a listing detail page: a plain invitation to post your
// own. Vertical-aware copy (Classifieds / Market / Housing). Presentational Server Component; tokens
// only, no hex; voice per CONTENT-VOICE (plain, no narrated feelings, no em/en dashes).

import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { ListingDetailView } from '@/lib/listings-shared/detail-view'

const COPY: Record<ListingDetailView['vertical'], { heading: string; body: string; href: string; cta: string }> = {
  classifieds: {
    heading: 'Have something to pass on?',
    body: 'Post it to Classifieds and reach neighbors nearby. No fees, no checkout, just a quick way to hand it off.',
    href: '/classifieds/new',
    cta: 'Post a listing',
  },
  market: {
    heading: 'Sell what you make.',
    body: 'Open a storefront in the Market and list your first product. Getting listed is getting discovered.',
    href: '/market',
    cta: 'Start selling',
  },
  housing: {
    heading: 'Have a place to share?',
    body: 'List a rental, a room, or a sublet and reach members looking nearby. Contact stays in messages.',
    href: '/marketplace/housing/new',
    cta: 'List housing',
  },
}

export function ListingMarketingCTA({ vertical }: { vertical: ListingDetailView['vertical'] }) {
  const c = COPY[vertical]
  return (
    <section className="mt-12 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary-bg via-surface to-signal-bg p-6 sm:p-10">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
        <h2 className="text-2xl font-bold text-text sm:text-3xl">{c.heading}</h2>
        <p className="max-w-xl text-sm text-muted sm:text-base">{c.body}</p>
        <Link
          href={c.href}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" aria-hidden /> {c.cta}
        </Link>
      </div>
    </section>
  )
}
