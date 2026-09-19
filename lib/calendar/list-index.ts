import type { CalendarEvent } from './item'
import { isOperatorListItem, operatorListHref, operatorStageLabel } from './pm-console'
import type { EntryStage } from './registry'

// LIST VIEW INDEX (ADR-1464). The left-hand event index for Admin List. Same
// operator set as the PM console, richer so the right-hand viewer can show
// stats and management without a second fetch of the row.

export type ListIndexItem = {
  key: string
  title: string
  whenLabel: string
  stageLabel: string
  href: string | null
  editHref: string | null
  isCancelled: boolean
  eventId: string | null
  entryId: string | null
  location: string | null
  description: string | null
  notes: string | null
  goingCount: number
  coverUrl: string | null
  stage: EntryStage | null
}

export function listItemKey(ev: CalendarEvent): string {
  return `${ev.slug}|${ev.dayKey}`
}

export function listIndexItems(events: CalendarEvent[]): ListIndexItem[] {
  return events
    .filter(isOperatorListItem)
    .slice()
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.title.localeCompare(b.title))
    .map((ev) => ({
      key: listItemKey(ev),
      title: ev.title,
      whenLabel: ev.whenLabel,
      stageLabel: operatorStageLabel(ev),
      href: operatorListHref(ev),
      editHref: ev.editHref ?? null,
      isCancelled: ev.isCancelled || ev.stage === 'cancelled',
      eventId: ev.eventId ?? null,
      entryId: ev.entryId ?? null,
      location: ev.location,
      description: ev.description ?? null,
      notes: ev.notes ?? null,
      goingCount: ev.goingCount,
      coverUrl: ev.coverUrl,
      stage: ev.stage ?? null,
    }))
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
