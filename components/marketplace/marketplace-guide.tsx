import Link from 'next/link'
import { Tag, Home, ShoppingBag, CalendarDays, Store, ArrowRight } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { browsableAreas, type MarketArea } from '@/lib/marketplace/visibility'

// Shared bottom-of-page guide for every commerce surface (ADR-596). Names the five
// surfaces in one line each, then points sellers at Business. Server component,
// semantic tokens only, no em or en dashes. Composed from the kit (SectionHeader +
// buttonClasses) so it reads the same under Classifieds, Housing, Market, Events,
// and the Frequency Store.
//
// AND IT SHOWS THE AREAS THE FLAG SAYS ARE OPEN (LIVE-245). Every surface stays declared, and
// `area` names the lib/marketplace/visibility key it answers to (null for Events, a member noun
// rather than a switchable market area). Same reason as MarketplaceFacets: this card named the
// Frequency Store on every commerce page while marketplace_shop_published was false, so it read
// as an answer to "what's where" that sent a member somewhere they get redirected out of.

const SURFACES = [
  { icon: Tag, area: 'market', name: 'Classifieds', href: '/classifieds', blurb: 'Swap, lend, give, and find things locally, no fees.' },
  { icon: Home, area: 'housing', name: 'Housing', href: '/housing', blurb: 'Rooms, rentals, and roommate matching.' },
  { icon: ShoppingBag, area: 'makers', name: 'Market', href: '/market', blurb: 'Products, services, and tickets from members and businesses.' },
  { icon: CalendarDays, area: null, name: 'Events', href: '/events?price=paid', blurb: 'Ticketed events from members and businesses.' },
  { icon: Store, area: 'shop', name: 'Frequency Store', href: '/store', blurb: 'First-party Frequency goods.' },
] as const satisfies readonly { area: MarketArea | null; name: string; href: string; blurb: string; icon: unknown }[]

export async function MarketplaceGuide() {
  const open = new Set(await browsableAreas())
  const surfaces = SURFACES.filter((s) => s.area === null || open.has(s.area))
  return (
    <section
      aria-label="About the marketplace"
      className="rounded-card border border-border bg-surface p-5 lift-1 sm:p-6"
    >
      <SectionHeader title="What's where" />

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {surfaces.map((s) => (
          <li key={s.name} className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-control bg-surface-elevated text-primary-strong">
              <s.icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <Link href={s.href} className="text-body-sm font-semibold text-text hover:text-primary-strong hover:underline">
                {s.name}
              </Link>
              <p className="text-body-sm leading-snug text-muted">{s.blurb}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-sm text-muted">
          Want to sell here? List products, services, and ticketed events in the Market when you go Business.
        </p>
        <Link href="/spaces/new" className={buttonClasses('primary', 'md', 'shrink-0')}>
          Go Business
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  )
}
