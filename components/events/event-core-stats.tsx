import { Ticket, Banknote, Check, Star, Clock, Zap, Gauge } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { formatEventMoney, type EventCoreStats } from '@/lib/events/event-stats'

// The ONE core-stats row for an event (EVENTS-REWORK, item 13). The host Manage dashboard
// and the in-rail Event settings editor both render THIS over loadEventCoreStats, so the
// headline numbers read identically wherever a host looks. Presentational + client-safe
// (StatCard has no hooks), so the rail's client module can use it too.
//
//   variant="strip"  → labeled GROUP clusters of soft compact tiles (StatCard size "xs",
//                      unbordered — no white card, owner directive) for the Manage hub's Home
//                      strip: Tickets (sold/revenue, paid only) and Guests (RSVP set +
//                      capacity), each tile linking into its hub section via `links`. The
//                      caller lays the groups in its own flex row so it can append siblings
//                      (e.g. a Reach group with page views).
//   variant="panel"  → a self-contained 2-up grid of bordered tiles for the narrow admin
//                      rail (event-settings-module), replacing its former inline divs.
//
// (The original full-size "cards" variant for the DashboardTemplate `stats` slot retired
// with the Manage hub rework, ADR-828 — the hub renders the strip instead.)

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
  variant,
  links,
}: {
  stats: EventCoreStats
  variant: 'strip' | 'panel'
  /** strip only: where a tile drills into — sold/revenue → `tickets`, everything else → `guests`. */
  links?: { tickets?: string; guests?: string }
}) {
  const tiles = tilesFor(stats)

  if (variant === 'strip') {
    const money = tiles.filter((t) => t.key === 'sold' || t.key === 'revenue')
    const guests = tiles.filter((t) => t.key !== 'sold' && t.key !== 'revenue')
    const groups = [
      ...(money.length ? [{ label: 'Tickets', tiles: money, href: links?.tickets }] : []),
      { label: 'Guests', tiles: guests, href: links?.guests },
    ]
    return (
      <>
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-subtle">{g.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.tiles.map((t) => (
                <StatCard key={t.key} size="xs" label={t.label} value={t.value} icon={t.Icon} detail={t.detail} href={g.href} />
              ))}
            </div>
          </div>
        ))}
      </>
    )
  }

  // variant === 'panel': TIGHT tile grid for the narrow admin rail — a dense stat strip, NOT the
  // full-size StatCard (which made the rail's top section balloon). Icon + a small value over a 2xs
  // label; the capacity detail tucks under it. Reads as a compact "at a glance" band at the top of
  // the panel.
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {tiles.map((t) => (
        <div
          key={t.key}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5"
        >
          <t.Icon className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-tight text-text">{t.value}</div>
            <div className="truncate text-2xs font-medium uppercase tracking-wide text-subtle">{t.label}</div>
            {t.detail && <div className="truncate text-2xs text-subtle">{t.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
