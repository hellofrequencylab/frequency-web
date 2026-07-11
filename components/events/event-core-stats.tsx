import { Ticket, Banknote, Check, Star, Clock, Zap, Gauge } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { formatEventMoney, type EventCoreStats } from '@/lib/events/event-stats'

// The ONE core-stats row for an event (EVENTS-REWORK, item 13). The host Manage dashboard
// and the in-rail Event settings editor both render THIS over loadEventCoreStats, so the
// headline numbers read identically wherever a host looks. Presentational + client-safe
// (StatCard has no hooks), so the rail's client module can use it too.
//
//   variant="cards"  → bare <StatCard> tiles for the DashboardTemplate `stats` slot, which
//                      supplies the responsive grid (manage page).
//   variant="panel"  → a self-contained 2-up grid of bordered tiles for the narrow admin
//                      rail (event-settings-module), replacing its former inline divs.

interface Tile {
  key: string
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  Icon: LucideIcon
}

function tilesFor(stats: EventCoreStats): Tile[] {
  const capacityValue = stats.capacity == null ? 'Unlimited' : String(stats.capacity)
  const capacityDetail =
    stats.capacity != null && stats.capacity > 0
      ? `${Math.round((stats.going / stats.capacity) * 100)}% full`
      : `${stats.going} going`

  const tiles: Tile[] = []
  // Sold + Revenue lead for a paid event; a free event skips them so the row isn't zeros.
  if (stats.paid) {
    tiles.push({ key: 'sold', label: 'Sold', value: stats.sold, Icon: Ticket })
    tiles.push({
      key: 'revenue',
      label: 'Revenue',
      value: formatEventMoney(stats.revenueCents, stats.currency),
      Icon: Banknote,
    })
  }
  tiles.push({ key: 'going', label: 'Going', value: stats.going, Icon: Check })
  tiles.push({ key: 'interested', label: 'Interested', value: stats.interested, Icon: Star })
  tiles.push({ key: 'waitlist', label: 'Waitlist', value: stats.waitlist, Icon: Clock })
  tiles.push({ key: 'checkedIn', label: 'Checked in', value: stats.checkedIn, Icon: Zap })
  tiles.push({
    key: 'capacity',
    label: 'Capacity',
    value: capacityValue,
    detail: capacityDetail,
    Icon: Gauge,
  })
  return tiles
}

export function EventCoreStatsCards({
  stats,
  variant = 'cards',
}: {
  stats: EventCoreStats
  variant?: 'cards' | 'panel'
}) {
  const tiles = tilesFor(stats)

  if (variant === 'panel') {
    return (
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <StatCard key={t.key} bordered label={t.label} value={t.value} icon={t.Icon} detail={t.detail} />
        ))}
      </div>
    )
  }

  return (
    <>
      {tiles.map((t) => (
        <StatCard key={t.key} label={t.label} value={t.value} icon={t.Icon} detail={t.detail} />
      ))}
    </>
  )
}
