import { describe, it, expect } from 'vitest'
import { guestLiveItems, GUEST_HIDDEN_STAGES, isGuestHiddenStage } from './guest-live'
import type { CalendarEvent } from './item'

function item(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    slug: over.slug ?? 'gathering',
    title: over.title ?? 'Sit',
    dayKey: over.dayKey ?? '2026-09-20',
    timeLabel: '7:00 PM',
    whenLabel: 'Sun, Sep 20, 7:00 PM PDT',
    startInstantIso: '2026-09-20T19:00:00.000Z',
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: over.isCancelled ?? false,
    layer: over.layer,
    stage: over.stage,
  }
}

describe('guestLiveItems (LIVE-414)', () => {
  it('keeps live events and cancelled gatherings', () => {
    const live = item({ slug: 'live', title: 'Open sit' })
    const cancelled = item({ slug: 'off', title: 'Called off', isCancelled: true, stage: 'cancelled' })
    expect(guestLiveItems([live, cancelled]).map((e) => e.slug)).toEqual(['live', 'off'])
  })

  it('drops pencil and planning so the guest feed is live-only', () => {
    expect(GUEST_HIDDEN_STAGES).toEqual(['pencil', 'planning'])
    expect(isGuestHiddenStage('pencil')).toBe(true)
    expect(isGuestHiddenStage('planning')).toBe(true)
    expect(isGuestHiddenStage('production')).toBe(false)
    expect(isGuestHiddenStage('cancelled')).toBe(false)
    const kept = guestLiveItems([
      item({ slug: 'hold', stage: 'pencil', layer: 'pencil' }),
      item({ slug: 'prep', stage: 'planning', layer: 'pencil' }),
      item({ slug: 'show', stage: 'production' }),
      item({ slug: 'team', layer: 'private' }),
      item({ slug: 'closed', layer: 'unavailable' }),
    ])
    expect(kept.map((e) => e.slug)).toEqual(['show', 'closed'])
  })
})
