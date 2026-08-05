import { UnderlineTabs, type UnderlineTabItem } from '@/components/admin/underline-tabs'
import type { PropertyType } from '@/lib/listings/types'

// The Housing category sub-menu (owner ask): a trimmed tab row —
//   All | House | Room | Apartment | Studio | Other (dropdown: Other / Condo / Townhouse) | Roommates
// The four common types are top-level tabs; the long tail (other / condo / townhouse) folds into an
// "Other" disclosure so the row stays short.
//
// PATTERN: UnderlineTabs — the one tab vocabulary (DAWN readme §"The composition system":
// "UnderlineTabs …, so pill tabs do not exist"), the SAME row the other marketplace sub-menus use
// (see events-surface). WHY not the in-panel segment: this is member-facing browse navigation
// between sibling views of the housing index, not a control that reshapes one panel. Each tab is a
// real URL (`?type=<slug>`), so the view stays server-rendered, shareable, and crawlable — including
// the three folded behind "Other", whose links sit in the markup whether the disclosure is open or
// shut. This file is now pure data; the strip itself is composed, never authored.

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

const typeHref = (slug?: string) => (slug ? `/housing?type=${slug}` : '/housing')

export function HousingCategoryNav({ selectedType }: { selectedType: string }) {
  const tabs: UnderlineTabItem[] = [
    { href: typeHref(), label: 'All' },
    ...TOP.map((t) => ({ href: typeHref(t.slug), label: t.label })),
    { label: 'Other', menu: OTHER.map((o) => ({ href: typeHref(o.slug), label: o.label })) },
    { href: '/housing/roommates', label: 'Roommates' },
  ]
  // Explicit active href: these are query-param views of ONE path, so pathname matching cannot
  // tell them apart. An unset type is the "All" tab.
  return <UnderlineTabs tabs={tabs} activeHref={typeHref(selectedType || undefined)} label="Housing categories" />
}
