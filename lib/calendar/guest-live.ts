import type { CalendarEvent } from './item'

// THE PUBLIC / GUEST FEED (LIVE-414, LIVE-419, ADR-1445, ADR-1457). Guest and ordinary
// members see live gatherings plus cancelled footer text. Pencil and planning stay off
// this feed. Production is the live show. The Calendar tab Guest branch calls guestLiveItems.

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

/** What the guest surface should say after guestLiveItems. First-use is only when the feed is empty. */
export type GuestFeedState = {
  liveCount: number
  cancelledCount: number
  blockedCount: number
  isFirstUse: boolean
}

export function guestFeedState(items: readonly CalendarEvent[]): GuestFeedState {
  let liveCount = 0
  let cancelledCount = 0
  let blockedCount = 0
  for (const item of items) {
    if (item.layer === 'unavailable') blockedCount += 1
    else if (item.isCancelled) cancelledCount += 1
    else liveCount += 1
  }
  return {
    liveCount,
    cancelledCount,
    blockedCount,
    isFirstUse: liveCount === 0 && cancelledCount === 0 && blockedCount === 0,
  }
}
