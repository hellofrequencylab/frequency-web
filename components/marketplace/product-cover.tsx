import Image from 'next/image'
import { Package, CalendarClock, Ticket } from 'lucide-react'
import { DEFAULT_OBJECT_POSITION } from '@/lib/images/focal-point'
import type { MarketGroup } from '@/lib/commerce/types'

// The shared product COVER treatment — every product surface leads with the same header: the listing's
// first photo, or a branded gradient + type icon when it has none, so a catalog always reads as a real
// grid. Extracted from ProductCard so the public browse card and the Shop admin catalog share ONE cover
// (no drift between what an operator sees and what a buyer sees). Drop it inside a relative, clipped box
// (EntityCard's cover slot already is one; the admin card wraps its own).
//
// FOCAL POINT (ADR-845). This is a hard crop, so a tall poster or an off-center subject loses its
// middle unless the tile is told where to look. `focus` is a CSS `object-position` string carried
// per item; unset means centered, which is byte-identical to the plain `object-cover` this rendered
// before. The value is generic on purpose: a ticketed event supplies its host-chosen cover focus
// today (lib/events/cover-focus.ts), and a shop product can supply one later through the same prop
// without this component learning what kind of thing it is drawing.

const GROUP_ICON: Record<MarketGroup, typeof Package> = {
  products: Package,
  services: CalendarClock,
  tickets: Ticket,
}

export function ProductCover({
  image,
  group,
  focus,
  sizes = '(min-width:1024px) 25vw, 100vw',
}: {
  image: string | null | undefined
  group: MarketGroup
  /** CSS `object-position` for the crop. Unset or blank crops centered, exactly as before. */
  focus?: string | null
  sizes?: string
}) {
  if (image) {
    return (
      <Image
        fill
        src={image}
        alt=""
        className="object-cover"
        style={{ objectPosition: focus?.trim() || DEFAULT_OBJECT_POSITION }}
        sizes={sizes}
      />
    )
  }
  const Icon = GROUP_ICON[group]
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-bg/40 via-surface-elevated to-surface-elevated">
      <Icon className="h-10 w-10 text-primary/40" aria-hidden />
    </div>
  )
}
