'use client'

import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { EventCoreStatsCards } from '@/components/events/event-core-stats'
import { EventShareButton } from '@/components/events/event-share-button'
import { AddToCalendar, buildGoogleCalendarUrl } from '@/components/events/add-to-calendar'
import { truncatedListStats, type ListIndexItem } from '@/lib/calendar/list-index'
import { cn } from '@/lib/utils'

// LIST VIEW (ADR-1464, ADR-1467). Condensed gathering index on the left. Right
// interior is the event control console: header with stage pill, primary facts,
// share links, and headline stats. Not the Studio editor.

function stageTone(label: string, cancelled: boolean): BadgeTone {
  if (cancelled || label === 'Cancelled') return 'danger'
  if (label === 'Draft') return 'warning'
  if (label === 'Production') return 'success'
  if (label === 'Planning') return 'signal'
  return 'neutral'
}

export function CalendarListView({
  items,
  selected,
  onSelect,
  onOpenPlan,
}: {
  items: ListIndexItem[]
  selected: ListIndexItem | null
  onSelect: (key: string) => void
  onOpenPlan?: (planId: string, entryId?: string | null) => void
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
      <nav aria-label="Gatherings" className="w-full shrink-0 lg:w-52">
        <SectionHeader title="Gatherings" count={items.length} />
        <ul className="mt-3 space-y-1">
          {items.map((item) => {
            const current = selected?.key === item.key
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onSelect(item.key)}
                  aria-pressed={current}
                  className={cn(
                    'block w-full rounded-card border px-2.5 py-1.5 text-left transition-colors',
                    current
                      ? 'border-primary bg-primary-bg text-primary-strong'
                      : 'border-border bg-surface hover:border-border-strong hover:bg-surface-elevated',
                  )}
                >
                  <span className={cn('block truncate text-body-sm font-semibold', item.isCancelled && 'line-through')}>
                    {item.title}
                  </span>
                  <span className="mt-0.5 block truncate text-meta text-muted">{item.whenLabel}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <section className="min-w-0 flex-1" aria-labelledby="calendar-list-viewer">
        {selected ? (
          <CalendarListViewer item={selected} onOpenPlan={onOpenPlan} />
        ) : (
          <EmptyState variant="no-results" title="Pick a gathering." description="A control console opens here." />
        )}
      </section>
    </div>
  )
}

function CalendarListViewer({
  item,
  onOpenPlan,
}: {
  item: ListIndexItem
  onOpenPlan?: (planId: string, entryId?: string | null) => void
}) {
  const openHref = item.href
  const publicSlug = item.publicSlug
  const googleUrl =
    publicSlug && item.startInstantIso
      ? buildGoogleCalendarUrl({
          title: item.title,
          startsAt: item.startInstantIso,
          endsAt: null,
          description: item.description,
          location: item.location,
        })
      : null

  return (
    <div data-calendar-list-viewer className="space-y-5 rounded-card border border-border bg-surface p-4 sm:p-5">
      <header className="flex flex-row items-start justify-between gap-3">
        <h3
          id="calendar-list-viewer"
          className={cn('min-w-0 text-page-title font-bold text-text', item.isCancelled && 'line-through')}
        >
          {item.title}
        </h3>
        <Badge tone={stageTone(item.stageLabel, item.isCancelled)} size="md">
          {item.stageLabel}
        </Badge>
      </header>

      <div className="space-y-1.5">
        <p className="text-body-sm text-muted">{item.whenLabel}</p>
        {item.location && <p className="text-body-sm text-text">{item.location}</p>}
        {item.description && <p className="text-body-sm text-text">{item.description}</p>}
        {item.notes && (
          <p className="text-body-sm text-muted">
            <span className="font-semibold text-text">Team notes. </span>
            {item.notes}
          </p>
        )}
      </div>

      {publicSlug && (
        <section aria-labelledby="calendar-list-share" className="space-y-3">
          <h4 id="calendar-list-share" className="text-body-sm font-bold text-text">
            Share
          </h4>
          <p className="text-body-sm text-muted">Send the public page. Copy the link, scan the QR, or drop the date on a calendar.</p>
          <div className="flex flex-wrap items-center gap-2">
            <EventShareButton slug={publicSlug} title={item.title} sharerProfileId={null} />
            {googleUrl && <AddToCalendar icsHref={`/events/${publicSlug}/event.ics`} googleUrl={googleUrl} />}
          </div>
        </section>
      )}

      <section aria-labelledby="calendar-list-stats" className="space-y-3">
        <h4 id="calendar-list-stats" className="text-body-sm font-bold text-text">
          At a glance
        </h4>
        <EventCoreStatsCards stats={truncatedListStats(item)} variant="panel" />
      </section>

      {(item.planId && onOpenPlan) || openHref ? (
        <div className="flex flex-wrap gap-2">
          {item.planId && onOpenPlan && (
            <Button type="button" variant="primary" size="sm" onClick={() => onOpenPlan(item.planId!, item.entryId)}>
              Open Plan
            </Button>
          )}
          {openHref && (
            <Button asChild variant={item.planId && onOpenPlan ? 'secondary' : 'primary'} size="sm">
              <Link href={openHref}>Go to event</Link>
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
