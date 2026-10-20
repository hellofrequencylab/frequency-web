import Link from 'next/link'
import { FqMarketHeader, type FqAreaDoor } from './area-nav'
import {
  AREA_LABEL,
  AREA_PREFIX,
  browsableAreas,
  isMarketplaceOperator,
  marketplaceVisibility,
  type MarketArea,
} from '@/lib/marketplace/visibility'

// The Marketplace's doors in the kit (the DAWN MarketplaceBar's area picker and the operator's
// hidden-area banner, redrawn). The doors are the areas THIS viewer may browse (browsableAreas, the
// same read both commerce navs use), plus paid Events, which the Marketplace has always linked as
// its Events tab. An operator looking at an area members cannot see gets one quiet panel saying so.

const COPY: Record<string, { blurb: string; tip: string }> = {
  market: {
    blurb: 'Swap, sell or give away',
    tip: 'Neighbors list things they no longer need. Tap a listing to see it, then message the poster to arrange a pickup. Use the filters to narrow by category or sort by price.',
  },
  housing: {
    blurb: 'Rooms and places nearby',
    tip: 'Find a room, sublet or place to share. Open a listing for details, then message the poster directly. Post your own with the button at the top.',
  },
  makers: {
    blurb: 'Buy direct from makers',
    tip: 'Shop work from local makers and businesses. The seller gets paid directly and the fee stays low. Want to sell? Use the open-a-shop prompt below.',
  },
  shop: {
    blurb: 'Frequency gear and goods',
    tip: 'Official Frequency products. Pick an item, choose your options and check out right here.',
  },
  events: {
    blurb: 'Paid events and tickets',
    tip: 'Events with a ticket price. Open one to see details and reserve your spot.',
  },
}

export async function FqMarketAreas() {
  const areas = await browsableAreas()
  const doors: FqAreaDoor[] = [
    ...areas.map((a) => ({ key: a, href: AREA_PREFIX[a], label: AREA_LABEL[a], ...COPY[a] })),
    { key: 'events', href: '/events?price=paid', label: 'Events', ...COPY.events },
  ]
  if (doors.length < 2) return null
  return <FqMarketHeader doors={doors} />
}

export async function FqHiddenAreaNote({ area }: { area: MarketArea }) {
  const [vis, operator] = await Promise.all([marketplaceVisibility(), isMarketplaceOperator()])
  if (vis[area] || !operator) return null
  return (
    <div className="panel row wrap fqm-note">
      <span className="t2 grow">
        {AREA_LABEL[area]} is hidden from members. Only operators can see it.
      </span>
      <Link className="btn sm" href="/admin/marketplace">
        Visibility settings
      </Link>
    </div>
  )
}
