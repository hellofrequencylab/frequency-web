import Link from 'next/link'
import { Tag, Home, ShoppingBag, CalendarDays, Store, ArrowRight } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'

// Shared bottom-of-page guide for every commerce surface (ADR-596). Names the five
// surfaces in one line each, then points sellers at Business. Server component,
// semantic tokens only, no em or en dashes. Composed from the kit (SectionHeader +
// buttonClasses) so it reads the same under Classifieds, Housing, Market, Events,
// and the Frequency Store.

const SURFACES = [
  { icon: Tag, name: 'Classifieds', blurb: 'Swap, lend, give, and find things locally, no fees.' },
  { icon: Home, name: 'Housing', blurb: 'Rooms, rentals, and roommate matching.' },
  { icon: ShoppingBag, name: 'Market', blurb: 'Products, services, and tickets from members and businesses.' },
  { icon: CalendarDays, name: 'Events', blurb: 'Find paid and free events near you.' },
  { icon: Store, name: 'Frequency Store', blurb: 'First-party Frequency goods.' },
] as const

export function MarketplaceGuide() {
  return (
    <section
      aria-label="About the marketplace"
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"
    >
      <SectionHeader title="What's where" />

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SURFACES.map((s) => (
          <li key={s.name} className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-elevated text-primary-strong">
              <s.icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">{s.name}</p>
              <p className="text-sm leading-snug text-muted">{s.blurb}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
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
