'use client'

import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Button } from '@/components/ui/button'
import { StatusChip } from '@/components/admin/status'
import { StatCard } from '@/components/ui/stat-card'
import { EventShareButton } from '@/components/events/event-share-button'
import { AddToCalendar, buildGoogleCalendarUrl } from '@/components/events/add-to-calendar'
import { listGlanceStats, type ListIndexItem } from '@/lib/calendar/list-index'
import { itemSelectedClass, itemTitleClass } from '@/lib/calendar/registry'
import { cn } from '@/lib/utils'

// LIST VIEW (ADR-1464, ADR-1467). Condensed gathering index on the left. Right
// interior is the event control console: header with stage pill, primary facts,
// share links, and headline stats. Not the Studio editor.
//
// How a stage looks comes from lib/calendar/registry.ts, never from here: the row's title class,
// the selected row's fill, and the stage badge's tone are all the registry's. A cancelled row is
// grey and struck through even when it is the selected row (selection is then its edge alone), so
// the brand fill never reads as "live" over a date that was called off.

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
        description="Pencil a date on the Calendar view. Published events land here too."
      />
    )
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start" data-calendar-list-view>
      <div className="w-full shrink-0 lg:w-52">
        <SectionHeader title="Gatherings" count={items.length} />
        {/* The kit's segmented box, stacked (HYG-105). The selected row's fill is still the registry's:
            a cancelled gathering is selected by its edge alone, never the brand fill (ADR-1503). */}
        <SegmentedControl
          label="Gatherings"
          orientation="vertical"
          size="md"
          className="mt-3"
          value={selected?.key ?? null}
          onChange={onSelect}
          segments={items.map((item) => {
            const current = selected?.key === item.key
            const titleClass = itemTitleClass(item.stage, item.isCancelled)
            return {
              value: item.key,
              selectedClassName: itemSelectedClass(item.stage, item.isCancelled),
              className: 'min-w-0',
              data: { 'data-calendar-list-row': item.isCancelled ? 'cancelled' : (item.stage ?? 'event') },
              label: (
                <>
                  <span
                    className={cn(
                      'block truncate text-body-sm font-semibold',
                      // An idle row's title reads at full strength; a selected row's takes the fill's colour.
                      titleClass || (current ? '' : 'text-text'),
                    )}
                  >
                    {item.isCancelled && <span className="sr-only">Cancelled. </span>}
                    {item.title}
                  </span>
                  <span className="mt-0.5 block truncate text-meta text-muted">{item.whenLabel}</span>
                </>
              ),
            }
          })}
        />
      </div>

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
  const glance = listGlanceStats(item)
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
          className={cn('min-w-0 text-page-title font-bold text-text', itemTitleClass(item.stage, item.isCancelled))}
        >
          {item.title}
        </h3>
        <StatusChip tone={item.stageTone}>{item.stageLabel}</StatusChip>
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

      {glance.length > 0 && (
        <section aria-labelledby="calendar-list-stats" className="space-y-3">
          <h4 id="calendar-list-stats" className="text-body-sm font-bold text-text">
            At a glance
          </h4>
          <div className="grid grid-cols-2 gap-1.5">
            {glance.map((s) => (
              <StatCard key={s.key} label={s.label} value={s.value} size="sm" bordered />
            ))}
          </div>
        </section>
      )}

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
