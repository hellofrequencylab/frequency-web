import Image from 'next/image'
import { Package, CalendarClock, Ticket } from 'lucide-react'
import type { MarketGroup } from '@/lib/commerce/types'

// The shared product COVER treatment — every product surface leads with the same header: the listing's
// first photo, or a branded gradient + type icon when it has none, so a catalog always reads as a real
// grid. Extracted from ProductCard so the public browse card and the Shop admin catalog share ONE cover
// (no drift between what an operator sees and what a buyer sees). Drop it inside a relative, clipped box
// (EntityCard's cover slot already is one; the admin card wraps its own).

const GROUP_ICON: Record<MarketGroup, typeof Package> = {
  products: Package,
  services: CalendarClock,
  tickets: Ticket,
}

export function ProductCover({
  image,
  group,
  sizes = '(min-width:1024px) 25vw, 100vw',
}: {
  image: string | null | undefined
  group: MarketGroup
  sizes?: string
}) {
  if (image) {
    return <Image fill src={image} alt="" className="object-cover" sizes={sizes} />
  }
  const Icon = GROUP_ICON[group]
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-bg/40 via-surface-elevated to-surface-elevated">
      <Icon className="h-10 w-10 text-primary/40" aria-hidden />
    </div>
  )
}
