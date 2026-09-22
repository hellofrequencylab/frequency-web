import type { EventCoreStats } from '@/lib/events/event-stats-core'
import type { CalendarEvent } from './item'
import { isOperatorListItem, operatorListHref, operatorStageLabel, operatorStageTone } from './pm-console'
import { itemIsCancelled, type EntryStage, type EntryStageTone } from './registry'

// LIST VIEW INDEX (ADR-1464, ADR-1467). The left-hand gathering index. The right
// pane is the event control console (header, share, stats), not the Studio editor.

export type ListIndexItem = {
  key: string
  /** The item's calendar day (YYYY-MM-DD), so the console's agenda can group a month by day. */
  dayKey: string
  title: string
  whenLabel: string
  stageLabel: string
  /** The tone of the badge that says `stageLabel` (lib/calendar/registry.ts, never the label). */
  stageTone: EntryStageTone
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
  planId: string | null
}

export function listPublicSlug(ev: CalendarEvent): string | null {
  if (!ev.eventId) return null
  if (ev.publicationState !== 'published') return null
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
        dayKey: ev.dayKey,
        title: ev.title,
        whenLabel: ev.whenLabel,
        stageLabel: operatorStageLabel(ev),
        stageTone: operatorStageTone(ev),
        href: publicSlug ? `/events/${publicSlug}` : operatorListHref(ev),
        editHref: ev.editHref ?? null,
        publicSlug,
        isCancelled: itemIsCancelled(ev.stage, ev.isCancelled),
        eventId: ev.eventId ?? null,
        entryId: ev.entryId ?? null,
        location: ev.location,
        description: ev.description ?? null,
        notes: ev.notes ?? null,
        goingCount: ev.goingCount,
        coverUrl: ev.coverUrl,
        startInstantIso: ev.startInstantIso,
        stage: ev.stage ?? null,
        planId: ev.planId ?? null,
      }
    })
}

export type AgendaDay = { dayKey: string; label: string; items: ListIndexItem[] }

/** The day heading the console's agenda prints, e.g. "Tue, Sep 22". Calendar days, so UTC on purpose. */
export function agendaDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  if (!y || !m || !d) return dayKey
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

/** THE CONSOLE AGENDA (PROG-CAL12): the shown month's items from the List index, grouped by day in
 *  day order. The index is already sorted by day then title, so the groups fall out in one pass. */
export function agendaForMonth(items: ListIndexItem[], year: number, month1: number): AgendaDay[] {
  const prefix = `${year}-${String(month1).padStart(2, '0')}-`
  const out: AgendaDay[] = []
  for (const item of items) {
    if (!item.dayKey.startsWith(prefix)) continue
    const last = out[out.length - 1]
    if (last && last.dayKey === item.dayKey) last.items.push(item)
    else out.push({ dayKey: item.dayKey, label: agendaDayLabel(item.dayKey), items: [item] })
  }
  return out
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
