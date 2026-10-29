import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './item'
import { publicSiteItems, siteDayItems, siteMonthAgenda, siteWindow } from './site-month'

// Pass 10: the website month draws public data only. The feed above it is already gated; this is the second
// lock, so a Pencil, a Plan, a Production date, a to-do or a shared-layer item cannot reach a visitor's browser.

const ev = (slug: string, dayKey: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  slug,
  title: slug,
  dayKey,
  timeLabel: '7:00 PM',
  whenLabel: 'Thu, Oct 15, 7:00 PM PDT',
  startInstantIso: null,
  location: 'Encinitas',
  goingCount: 3,
  coverUrl: null,
  isCancelled: false,
  layer: 'events',
  ...extra,
})

describe('publicSiteItems', () => {
  it('keeps published gatherings, called-off ones and Unavailable spans', () => {
    const out = publicSiteItems([
      ev('circle', '2026-10-15'),
      ev('gone', '2026-10-16', { isCancelled: true }),
      ev('unavailable-1', '2026-10-17', { layer: 'unavailable', title: 'Blocked for the team retreat' }),
    ])
    expect(out.map((i) => i.kind)).toEqual(['event', 'cancelled', 'unavailable'])
    // An Unavailable span says only that the time is taken.
    expect(out[2].item.title).toBe('Unavailable')
  })

  it('drops Pencil, Plan, Production, to-dos, shared-layer and private items', () => {
    const out = publicSiteItems([
      ev('a', '2026-10-01', { layer: 'works' }),
      ev('b', '2026-10-02', { layer: 'private' }),
      ev('c', '2026-10-03', { layer: 'todos' }),
      ev('d', '2026-10-04', { layer: 'shared' }),
      ev('e', '2026-10-05', { layer: 'pencil' }),
      ev('f', '2026-10-06', { stage: 'pencil' }),
      ev('g', '2026-10-07', { stage: 'planning' }),
      ev('h', '2026-10-08', { stage: 'production' }),
      ev('i', '2026-10-09', { planId: 'plan-1' }),
      ev('j', '2026-10-10', { entryId: 'entry-1' }),
      ev('k', '2026-10-11', { optionGroup: 'group-1' }),
    ])
    expect(out).toEqual([])
  })

  it('rebuilds each item from public fields, so no note, edit link or entry input rides along', () => {
    const [kept] = publicSiteItems([
      ev('circle', '2026-10-15', {
        notes: 'bring the keys',
        editHref: '/spaces/x/events/circle/edit',
        description: 'team brief',
        statusLabel: 'Draft',
        eventId: 'evt-1',
        sourceLabel: 'Meld',
      }),
    ])
    const keys = Object.keys(kept.item)
    for (const leak of ['notes', 'editHref', 'description', 'statusLabel', 'eventId', 'sourceLabel', 'entryInput', 'planId', 'stage']) {
      expect(keys).not.toContain(leak)
    }
    expect(kept.item.title).toBe('circle')
  })
})

describe('siteDayItems and siteMonthAgenda', () => {
  const run = publicSiteItems([ev('retreat', '2026-10-29', { endDayKey: '2026-11-01' }), ev('circle', '2026-10-15')])

  it('stands a run of days on every day it covers', () => {
    expect(siteDayItems(run, '2026-10-30').map((i) => i.item.slug)).toEqual(['retreat'])
    expect(siteDayItems(run, '2026-11-01').map((i) => i.item.slug)).toEqual(['retreat'])
    expect(siteDayItems(run, '2026-11-02')).toEqual([])
  })

  it('lists a run once, on its first day in the month', () => {
    expect(siteMonthAgenda(run, '2026-10').map((d) => d.day)).toEqual(['2026-10-15', '2026-10-29'])
    expect(siteMonthAgenda(run, '2026-11').map((d) => d.day)).toEqual(['2026-11-01'])
  })
})

describe('siteWindow', () => {
  it('reads two months back and twelve ahead', () => {
    const w = siteWindow('2026-10', null)
    expect([w.minYm, w.maxYm]).toEqual(['2026-08', '2027-10'])
    expect(w.fromDay <= '2026-08-01' && w.toDay >= '2027-11-01').toBe(true)
  })

  it('stops short of a month a capped read only half filled', () => {
    expect(siteWindow('2026-10', '2027-03-04').maxYm).toBe('2027-02')
    expect(siteWindow('2026-10', '2026-10-20').maxYm).toBe('2026-10')
  })
})
