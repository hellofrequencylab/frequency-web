import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { Button, buttonClasses } from '@/components/ui/button'
import { EventCoreStatsCards } from '@/components/events/event-core-stats'
import type { EventCoreStats } from '@/lib/events/event-stats-core'
import { adminViewHref } from '@/lib/calendar/admin-views'
import type { ListIndexItem } from '@/lib/calendar/list-index'
import { cn } from '@/lib/utils'

// LIST VIEW (ADR-1464). Tight gathering index on the left. Right interior is the
// selected event's stats and management. Kit pieces only. Not a spreadsheet.

export function CalendarListView({
  slug,
  items,
  selected,
  stats,
}: {
  slug: string
  items: ListIndexItem[]
  selected: ListIndexItem | null
  stats: EventCoreStats | null
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
                <Link
                  href={adminViewHref(slug, 'list', { item: item.key })}
                  scroll={false}
                  replace
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'block rounded-card border px-3 py-2 transition-colors',
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
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <section className="min-w-0 flex-1" aria-labelledby="calendar-list-viewer">
        {selected ? (
          <CalendarListViewer item={selected} stats={stats} />
        ) : (
          <EmptyState variant="no-results" title="Pick a gathering." description="Stats and management open here." />
        )}
      </section>
    </div>
  )
}

function CalendarListViewer({ item, stats }: { item: ListIndexItem; stats: EventCoreStats | null }) {
  const openHref = item.href
  const manageHref = item.editHref
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
      {item.description && <p className="text-body-sm text-text">{item.description}</p>}
      {item.notes && (
        <p className="text-body-sm text-muted">
          <span className="font-semibold text-text">Team notes. </span>
          {item.notes}
        </p>
      )}
      {stats ? (
        <EventCoreStatsCards
          stats={stats}
          variant="panel"
          links={{
            tickets: manageHref ?? undefined,
            guests: manageHref ?? undefined,
          }}
        />
      ) : item.goingCount > 0 ? (
        <p className="text-body-sm text-muted">
          <span className="font-semibold text-text tabular-nums">{item.goingCount}</span> going
        </p>
      ) : item.entryId ? (
        <p className="text-body-sm text-muted">An event on its way. Numbers appear once it is a published event.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {openHref && (
          <Button asChild variant="primary" size="sm">
            <Link href={openHref}>{item.entryId && !item.eventId ? 'Open settings' : 'Open event'}</Link>
          </Button>
        )}
        {manageHref && manageHref !== openHref && (
          <Link href={manageHref} className={buttonClasses('secondary', 'sm')}>
            Manage
          </Link>
        )}
      </div>
    </div>
  )
}
