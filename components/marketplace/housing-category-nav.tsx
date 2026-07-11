import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PropertyType } from '@/lib/listings/types'

// The Housing category sub-menu (owner ask): a trimmed tab row —
//   All | House | Room | Apartment | Studio | Other (dropdown: Other / Condo / Townhouse) | Roommates
// The four common types are top-level tabs; the long tail (other / condo / townhouse) folds into an
// "Other" disclosure so the row stays short. Underline-tab styling matches the other marketplace
// sub-menus (components/admin/underline-tabs). The dropdown is a native <details> so it needs no client
// JS and closes on navigation. Each tab is a real URL (`?type=<slug>`), so the view stays server-rendered
// and shareable. Tokens only, no hex.

const TAB = 'flex shrink-0 items-center gap-1 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors'
const ACTIVE = 'border-primary-strong text-text'
const IDLE = 'border-transparent text-muted hover:border-border-strong hover:text-text'

const TOP: { slug: PropertyType; label: string }[] = [
  { slug: 'house', label: 'House' },
  { slug: 'room', label: 'Room' },
  { slug: 'apartment', label: 'Apartment' },
  { slug: 'studio', label: 'Studio' },
]
const OTHER: { slug: PropertyType; label: string }[] = [
  { slug: 'other', label: 'Other' },
  { slug: 'condo', label: 'Condo' },
  { slug: 'townhouse', label: 'Townhouse' },
]
const OTHER_SLUGS = OTHER.map((o) => o.slug) as string[]

const typeHref = (slug?: string) =>
  slug ? `/marketplace/housing?type=${slug}` : '/marketplace/housing'

export function HousingCategoryNav({ selectedType }: { selectedType: string }) {
  const otherActive = OTHER_SLUGS.includes(selectedType)
  return (
    <nav
      className="-mb-px flex items-center gap-1 overflow-x-auto border-b border-border"
      aria-label="Housing categories"
    >
      <Link
        href={typeHref()}
        aria-current={!selectedType ? 'page' : undefined}
        className={cn(TAB, !selectedType ? ACTIVE : IDLE)}
      >
        All
      </Link>
      {TOP.map((t) => (
        <Link
          key={t.slug}
          href={typeHref(t.slug)}
          aria-current={selectedType === t.slug ? 'page' : undefined}
          className={cn(TAB, selectedType === t.slug ? ACTIVE : IDLE)}
        >
          {t.label}
        </Link>
      ))}
      <details className="group relative shrink-0">
        <summary
          className={cn(
            TAB,
            'cursor-pointer list-none [&::-webkit-details-marker]:hidden',
            otherActive ? ACTIVE : IDLE,
          )}
        >
          Other
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="absolute left-0 z-20 mt-1 min-w-[9rem] rounded-lg border border-border bg-surface p-1 shadow-lg">
          {OTHER.map((o) => (
            <Link
              key={o.slug}
              href={typeHref(o.slug)}
              className={cn(
                'block rounded-md px-3 py-1.5 text-sm transition-colors',
                selectedType === o.slug
                  ? 'bg-primary-bg font-semibold text-primary-strong'
                  : 'text-muted hover:bg-surface-elevated hover:text-text',
              )}
            >
              {o.label}
            </Link>
          ))}
        </div>
      </details>
      <Link href="/marketplace/housing/roommates" className={cn(TAB, IDLE)}>
        Roommates
      </Link>
    </nav>
  )
}
