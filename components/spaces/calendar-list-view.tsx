'use client'

import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { Button } from '@/components/ui/button'
import { EventCoreStatsCards } from '@/components/events/event-core-stats'
import { truncatedListStats, type ListIndexItem } from '@/lib/calendar/list-index'
import { cn } from '@/lib/utils'

// LIST VIEW (ADR-1464, ADR-1467). Condensed gathering index on the left. Right
// interior is a truncated stats card, not the event edit screen.

export function CalendarListView({
  items,
  selected,
  onSelect,
}: {
  items: ListIndexItem[]
  selected: ListIndexItem | null
  onSelect: (key: string) => void
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="Nothing to run yet."
        description="Pencil a date on the Admin view. Published events land here too."
      />
    )
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start" data-calendar-list-view>
      <nav aria-label="Gatherings" className="w-full shrink-0 lg:w-80">
        <SectionHeader title="Gatherings" count={items.length} />
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const current = selected?.key === item.key
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onSelect(item.key)}
                  aria-pressed={current}
                  className={cn(
                    'block w-full rounded-card border px-3 py-2 text-left transition-colors',
                    current
                      ? 'border-primary bg-primary-bg text-primary-strong'
                      : 'border-border bg-surface hover:border-border-strong hover:bg-surface-elevated',
                  )}
                >
                  <span className={cn('block text-body-sm font-semibold', item.isCancelled && 'line-through')}>
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-meta text-muted">{item.whenLabel}</span>
                  <span className="mt-1 inline-flex items-center rounded-pill bg-surface-elevated px-2 py-0.5 text-meta font-semibold text-muted">
                    {item.stageLabel}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <section className="min-w-0 flex-1" aria-labelledby="calendar-list-viewer">
        {selected ? (
          <CalendarListViewer item={selected} />
        ) : (
          <EmptyState variant="no-results" title="Pick a gathering." description="A short stats card opens here." />
        )}
      </section>
    </div>
  )
}

function CalendarListViewer({ item }: { item: ListIndexItem }) {
  const openHref = item.href
  return (
    <div data-calendar-list-viewer className="space-y-4 rounded-card border border-border bg-surface p-4">
      <SectionHeader id="calendar-list-viewer" title={item.title} />
      <p className="text-body-sm text-muted">{item.whenLabel}</p>
      {item.location && <p className="text-body-sm text-text">{item.location}</p>}
      <p>
        <span className="inline-flex items-center rounded-pill bg-surface-elevated px-2 py-0.5 text-meta font-semibold text-muted">
          {item.stageLabel}
        </span>
      </p>
      {item.description && (
        <p className="line-clamp-3 text-body-sm text-text">{item.description}</p>
      )}
      <EventCoreStatsCards stats={truncatedListStats(item)} variant="panel" />
      {openHref && (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="primary" size="sm">
            <Link href={openHref}>Go to event</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
