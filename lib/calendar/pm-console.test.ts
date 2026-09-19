import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './item'
import {
  isOperatorListItem,
  isPencilLaneItem,
  isPlanningLaneItem,
  operatorListHref,
  operatorListItems,
  operatorStageLabel,
  pencilLane,
  planningLane,
  productionLane,
  isProductionLaneItem,
} from './pm-console'

function item(partial: Partial<CalendarEvent> & Pick<CalendarEvent, 'slug' | 'title' | 'dayKey'>): CalendarEvent {
  return {
    timeLabel: '7:00 PM',
    whenLabel: `Sat, ${partial.dayKey}, 7:00 PM PDT`,
    startInstantIso: `${partial.dayKey}T19:00:00.000Z`,
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    ...partial,
  }
}

describe('operatorListItems (LIVE-415)', () => {
  it('keeps staged entries and live events, and drops private and unavailable', () => {
    const pencil = item({ slug: 'entry-1', title: 'New moon sit', dayKey: '2026-09-22', stage: 'pencil', layer: 'pencil' })
    const live = item({ slug: 'open-house', title: 'Open house', dayKey: '2026-09-24' })
    const priv = item({ slug: 'entry-2', title: 'Staff meeting', dayKey: '2026-09-23', layer: 'private' })
    const blocked = item({ slug: 'entry-3', title: 'Unavailable', dayKey: '2026-09-23', layer: 'unavailable' })
    const past = item({ slug: 'old-one', title: 'Last month', dayKey: '2026-08-01', statusLabel: 'Past' })

    const list = operatorListItems([past, live, blocked, priv, pencil])
    expect(list.map((row) => row.title)).toEqual(['New moon sit', 'Open house'])
    expect(list[0]?.stageLabel).toBe('Pencil')
    expect(list[1]?.stageLabel).toBe('Production')
  })

  it('labels cancelled and drafts, and keeps a cancelled past gathering', () => {
    const calledOff = item({
      slug: 'called-off',
      title: 'Full moon sit',
      dayKey: '2026-08-20',
      isCancelled: true,
      statusLabel: 'Past',
    })
    const draft = item({ slug: 'draft-sit', title: 'Draft sit', dayKey: '2026-09-30', statusLabel: 'Draft' })
    const cancelledStage = item({
      slug: 'entry-4',
      title: 'Rain date',
      dayKey: '2026-09-21',
      stage: 'cancelled',
      layer: 'pencil',
    })

    expect(operatorStageLabel(calledOff)).toBe('Cancelled')
    expect(operatorStageLabel(draft)).toBe('Draft')
    expect(operatorStageLabel(cancelledStage)).toBe('Cancelled')
    expect(isOperatorListItem(calledOff)).toBe(true)
    expect(operatorListItems([calledOff, draft, cancelledStage]).map((row) => row.stageLabel)).toEqual([
      'Cancelled',
      'Cancelled',
      'Draft',
    ])
  })

  it('puts pencil-stage gatherings in pencilLane and planning-stage in planningLane', () => {
    const hold = item({ slug: 'entry-1', title: 'New moon sit', dayKey: '2026-09-22', stage: 'pencil', layer: 'pencil' })
    const otherDate = item({
      slug: 'entry-1b',
      title: 'New moon sit',
      dayKey: '2026-09-23',
      stage: 'pencil',
      layer: 'pencil',
      optionGroup: 'g1',
    })
    const planning = item({
      slug: 'entry-2',
      title: 'Open house',
      dayKey: '2026-09-24',
      stage: 'planning',
      layer: 'pencil',
    })
    const later = item({
      slug: 'entry-2b',
      title: 'Open house',
      dayKey: '2026-09-25',
      stage: 'planning',
      layer: 'pencil',
    })
    const live = item({ slug: 'open-house', title: 'Published sit', dayKey: '2026-09-26' })

    expect(isPencilLaneItem(hold)).toBe(true)
    expect(isPencilLaneItem(planning)).toBe(false)
    expect(isPlanningLaneItem(planning)).toBe(true)
    expect(isPlanningLaneItem(hold)).toBe(false)
    expect(isPlanningLaneItem(live)).toBe(false)
    expect(pencilLane([hold, otherDate, planning, live]).map((row) => row.key)).toEqual([
      'entry-1|2026-09-22',
      'entry-1b|2026-09-23',
    ])
    expect(planningLane([hold, planning, later, live]).map((row) => row.key)).toEqual([
      'entry-2|2026-09-24',
      'entry-2b|2026-09-25',
    ])
    expect(operatorListItems([hold, planning, live]).map((row) => row.stageLabel)).toEqual([
      'Pencil',
      'Planning',
      'Production',
    ])
  })

  it('puts production-stage gatherings and the live show in productionLane', () => {
    const pencil = item({ slug: 'entry-1', title: 'New moon sit', dayKey: '2026-09-22', stage: 'pencil', layer: 'pencil' })
    const planning = item({
      slug: 'entry-2',
      title: 'Open house',
      dayKey: '2026-09-24',
      stage: 'planning',
      layer: 'pencil',
    })
    const production = item({
      slug: 'entry-3',
      title: 'Ready sit',
      dayKey: '2026-09-25',
      stage: 'production',
      layer: 'pencil',
    })
    const live = item({ slug: 'open-house', title: 'Published sit', dayKey: '2026-09-26' })
    const draft = item({ slug: 'draft-sit', title: 'Draft sit', dayKey: '2026-09-30', statusLabel: 'Draft' })

    expect(isProductionLaneItem(production)).toBe(true)
    expect(isProductionLaneItem(live)).toBe(true)
    expect(isProductionLaneItem(pencil)).toBe(false)
    expect(isProductionLaneItem(planning)).toBe(false)
    expect(isProductionLaneItem(draft)).toBe(false)
    expect(productionLane([pencil, planning, production, live, draft]).map((row) => row.key)).toEqual([
      'entry-3|2026-09-25',
      'open-house|2026-09-26',
    ])
  })

  it('links published events and leaves private entries without a page', () => {
    const live = item({ slug: 'open-house', title: 'Open house', dayKey: '2026-09-24', editHref: '/events/open-house/manage' })
    const entry = item({
      slug: 'entry-1',
      title: 'New moon sit',
      dayKey: '2026-09-22',
      stage: 'planning',
      layer: 'pencil',
      entryId: 'aaaa',
    })
    expect(operatorListHref(live)).toBe('/events/open-house/manage')
    expect(operatorListHref(entry)).toBeNull()
    expect(operatorListHref(item({ slug: 'public-one', title: 'Public', dayKey: '2026-09-25' }))).toBe(
      '/events/public-one',
    )
  })
})
