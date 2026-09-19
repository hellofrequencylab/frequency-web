import type { CalendarEvent } from './item'
import { entryStage } from './registry'

// THE ADMIN OPERATOR LIST (ADR-1445 C1–C4, ADR-1450, ADR-1454, ADR-1458, ADR-1456).
// pencilLane is C2. planningLane is C3. productionLane is C4. Cancelled stays on
// the mixed board. Private entries and Unavailable time stay on the date map.

export type OperatorListItem = {
  key: string
  title: string
  whenLabel: string
  stageLabel: string
  href: string | null
  isCancelled: boolean
}

function isStaffOnlyNoise(ev: CalendarEvent): boolean {
  return ev.layer === 'private' || ev.layer === 'unavailable'
}

export function operatorStageLabel(ev: CalendarEvent): string {
  const staged = entryStage(ev.stage)
  if (staged) return staged.label
  if (ev.isCancelled) return 'Cancelled'
  if (ev.statusLabel === 'Draft') return 'Draft'
  return 'Production'
}

export function operatorListHref(ev: CalendarEvent): string | null {
  if (ev.editHref) return ev.editHref
  if (ev.entryId) return null
  if (ev.slug.startsWith('entry-')) return null
  return `/events/${ev.slug}`
}

export function isOperatorListItem(ev: CalendarEvent): boolean {
  if (isStaffOnlyNoise(ev)) return false
  if (ev.stage) return true
  if ((ev.layer ?? 'events') !== 'events') return false
  if (ev.statusLabel === 'Past' && !ev.isCancelled) return false
  return true
}

export function operatorListItems(events: CalendarEvent[]): OperatorListItem[] {
  return events
    .filter(isOperatorListItem)
    .slice()
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.title.localeCompare(b.title))
    .map((ev) => ({
      key: `${ev.slug}|${ev.dayKey}`,
      title: ev.title,
      whenLabel: ev.whenLabel,
      stageLabel: operatorStageLabel(ev),
      href: operatorListHref(ev),
      isCancelled: ev.isCancelled || ev.stage === 'cancelled',
    }))
}

export function isPencilLaneItem(ev: CalendarEvent): boolean {
  return isOperatorListItem(ev) && ev.stage === 'pencil'
}

export function isPlanningLaneItem(ev: CalendarEvent): boolean {
  return isOperatorListItem(ev) && ev.stage === 'planning'
}

export function isProductionLaneItem(ev: CalendarEvent): boolean {
  return isOperatorListItem(ev) && operatorStageLabel(ev) === 'Production'
}

export function pencilLane(events: CalendarEvent[]): OperatorListItem[] {
  return operatorListItems(events.filter((ev) => ev.stage === 'pencil'))
}

export function planningLane(events: CalendarEvent[]): OperatorListItem[] {
  return operatorListItems(events.filter((ev) => ev.stage === 'planning'))
}

export function productionLane(events: CalendarEvent[]): OperatorListItem[] {
  return operatorListItems(events.filter(isProductionLaneItem))
}
