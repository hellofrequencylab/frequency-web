import type { CalendarEvent } from './item'

// THE PUBLIC / GUEST FEED (LIVE-419, ADR-1445). Guest and ordinary members see live
// gatherings only. Pencil and planning stay off this feed. Production is the live show.
// Cancelled stays for the C0 date-square footer (LIVE-414); it is not a guest chip.
// ICS stays live-only.

/** Stages the guest calendar never shows. Named so the helper can exclude them by the same words. */
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
