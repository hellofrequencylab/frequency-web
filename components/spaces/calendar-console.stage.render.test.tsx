// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarConsole } from './calendar-console'
import { listIndexItems } from '@/lib/calendar/list-index'
import { CALENDAR_PRESENTATIONS } from '@/lib/calendar/registry'
import type { CalendarEvent } from '@/lib/calendar/item'

// COLOUR PLUS THE WORD, in the console agenda (LIVE-470).
//
// The agenda is a TEAM surface, so it says the stage. It was the one list left where a Planning
// date and a Production read the same, because the row carried `stageLabel` and `stageTone` all
// along and nothing printed them.
//
// 🔴 DELIBERATELY NARROW. This file asserts the agenda item's stage pill and nothing else about
// the console's layout, which moves under it (LIVE-474 and LIVE-478 both rebuilt this chrome). It
// reads `[data-console-item-stage]`, so it survives the chrome moving around it.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function event(over: Partial<CalendarEvent>): CalendarEvent {
  return {
    slug: 'sit',
    title: 'New moon sit',
    dayKey: '2026-09-20',
    timeLabel: '7:00 PM',
    whenLabel: 'Sun, Sep 20, 7:00 PM PDT',
    startInstantIso: '2026-09-20T19:00:00.000Z',
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    ...over,
  }
}

const items = listIndexItems([
  event({ slug: 'entry-1', title: 'Solstice', dayKey: '2026-09-20', layer: 'pencil', stage: 'planning', entryId: 'e1' }),
  event({ slug: 'entry-2', title: 'Full moon', dayKey: '2026-09-21', layer: 'pencil', stage: 'pencil', entryId: 'e2' }),
])

describe('the console agenda says the stage', () => {
  it('prints the registry word and tone on every agenda row', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() =>
      root!.render(
        <CalendarConsole
          open
          onClose={() => {}}
          month={{ year: 2026, month1: 9 }}
          onMonthChange={() => {}}
          viewControls={null}
          items={items}
          selectedKey={null}
          onSelectItem={() => {}}
          onOpenPlan={() => {}}
          stageRef={createRef<HTMLDivElement>()}
        />,
      ),
    )
    const pills = [...document.body.querySelectorAll('[data-console-item-stage]')]
    expect(pills.map((n) => n.getAttribute('data-console-item-stage'))).toEqual(['planning', 'pencil'])
    expect(pills.map((n) => n.textContent)).toEqual([
      CALENDAR_PRESENTATIONS.planning.word,
      CALENDAR_PRESENTATIONS.pencil.word,
    ])
    expect(pills[0].querySelector('span')?.className).toContain('bg-info-bg')
  })
})
