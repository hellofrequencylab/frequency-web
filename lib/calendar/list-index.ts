import type { EventCoreStats } from '@/lib/events/event-stats-core'
import type { CalendarEvent } from './item'
import { isOperatorListItem, operatorListHref, operatorStageLabel } from './pm-console'
import type { EntryStage } from './registry'

// LIST VIEW INDEX (ADR-1464, ADR-1467). The left-hand gathering index. The right
// pane is the event control console (header, share, stats), not the Studio editor.

export type ListIndexItem = {
  key: string
  title: string
  whenLabel: string
  stageLabel: string
  href: string | null
  editHref: string | null
  publicSlug: string | null
  isCancelled: boolean
  eventId: string | null
  entryId: string | null
  location: string | null
  description: string | null
  notes: string | null
  goingCount: number
  coverUrl: string | null
  startInstantIso: string | null
  stage: EntryStage | null
}

export function listPublicSlug(ev: CalendarEvent): string | null {
  if (!ev.eventId) return null
  if (ev.slug.startsWith('entry-')) return null
  return ev.slug
}

export function listItemKey(ev: CalendarEvent): string {
  return `${ev.slug}|${ev.dayKey}`
}

export function listIndexItems(events: CalendarEvent[]): ListIndexItem[] {
  return events
    .filter(isOperatorListItem)
    .slice()
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.title.localeCompare(b.title))
    .map((ev) => {
      const publicSlug = listPublicSlug(ev)
      return {
        key: listItemKey(ev),
        title: ev.title,
        whenLabel: ev.whenLabel,
        stageLabel: operatorStageLabel(ev),
        href: publicSlug ? `/events/${publicSlug}` : operatorListHref(ev),
        editHref: ev.editHref ?? null,
        publicSlug,
        isCancelled: ev.isCancelled || ev.stage === 'cancelled',
        eventId: ev.eventId ?? null,
        entryId: ev.entryId ?? null,
        location: ev.location,
        description: ev.description ?? null,
        notes: ev.notes ?? null,
        goingCount: ev.goingCount,
        coverUrl: ev.coverUrl,
        startInstantIso: ev.startInstantIso,
        stage: ev.stage ?? null,
      }
    })
}

/** Selected row, or the first, or null when the index is empty. */
export function selectListItem(items: ListIndexItem[], selectedKey: string | null | undefined): ListIndexItem | null {
  if (items.length === 0) return null
  if (selectedKey) {
    const match = items.find((row) => row.key === selectedKey)
    if (match) return match
  }
  return items[0] ?? null
}

/** Headline numbers the List viewer can show without opening Manage. */
export function truncatedListStats(item: ListIndexItem): EventCoreStats {
  return {
    sold: 0,
    revenueCents: 0,
    currency: 'usd',
    going: item.goingCount,
    interested: 0,
    waitlist: 0,
    checkedIn: 0,
    capacity: null,
    paid: false,
  }
}
