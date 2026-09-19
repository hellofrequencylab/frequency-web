import type { CalendarEvent } from './item'

// THE PUBLIC / GUEST FEED (LIVE-414, ADR-1445). Guest and ordinary members see live
// gatherings plus cancelled footer text. Pencil and planning stay off this feed.
// Production is the live show. LIVE-419 will point the Guest branch at this helper.

/** Stages the guest calendar never shows. Named so C5 can exclude them by the same words. */
export const GUEST_HIDDEN_STAGES = ['pencil', 'planning'] as const

export function isGuestHiddenStage(stage: string | null | undefined): boolean {
  return stage === 'pencil' || stage === 'planning'
}

/** Live chips plus cancelled items for the date-square footer. Drops pencil, planning, and private. */
export function guestLiveItems(items: readonly CalendarEvent[]): CalendarEvent[] {
  return items.filter((item) => {
    if (isGuestHiddenStage(item.stage)) return false
    if (item.layer === 'pencil' || item.layer === 'private') return false
    return true
  })
}
