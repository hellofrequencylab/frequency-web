// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarTimeViews } from './calendar-time-views'
import type { CalendarEvent } from '@/lib/calendar/item'

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
})

const yoga: CalendarEvent = {
  slug: 'yoga',
  title: 'Sunset yoga',
  dayKey: '2026-10-27',
  timeLabel: '6:00 PM',
  endTimeLabel: '7:00 PM',
  whenLabel: 'Tue, Oct 27, 6:00 PM',
  startInstantIso: null,
  location: null,
  goingCount: 0,
  coverUrl: null,
  isCancelled: false,
  stage: 'planning',
  layer: 'pencil',
  planId: 'p1',
}
const todo: CalendarEvent = { ...yoga, slug: 'todo-1', title: 'Order mats', timeLabel: 'To-do', endTimeLabel: null, layer: 'todos', stage: null, planId: null }

function mount(view: 'day' | 'week' | 'timeline', extra: Partial<Parameters<typeof CalendarTimeViews>[0]> = {}) {
  const onOpen = vi.fn()
  const onOpenDay = vi.fn()
  const onAnchor = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      <CalendarTimeViews
        view={view}
        items={[yoga, todo]}
        plans={[{ id: 'p1', title: 'Autumn retreat', stage: 'planning' } as never]}
        hiddenLayers={new Set()}
        anchorDay="2026-10-27"
        onAnchor={onAnchor}
        todayDay="2026-10-27"
        canOpen={(item) => !!item.planId}
        onOpen={onOpen}
        onOpenPlan={vi.fn()}
        onOpenDay={onOpenDay}
        {...extra}
      />,
    )
  })
  return { onOpen, onOpenDay, onAnchor }
}

describe('CalendarTimeViews (LIVE-1178)', () => {
  it('draws a timed block with its word, title and range, and the to-do in the all-day row', () => {
    const { onOpen } = mount('day')
    const block = container!.querySelector('[data-calendar-time-item="planning"]') as HTMLButtonElement
    expect(block.textContent).toContain('Planning')
    expect(block.textContent).toContain('Sunset yoga')
    expect(block.textContent).toContain('6:00 PM to 7:00 PM')
    expect(container!.querySelector('[data-calendar-all-day-row]')?.textContent).toContain('Order mats')
    act(() => block.click())
    expect(onOpen).toHaveBeenCalledWith(yoga)
  })

  it('draws an item with nowhere to go as text, never a dead button', () => {
    mount('day')
    const chip = container!.querySelector('[data-calendar-time-item="todos"]')!
    expect(chip.tagName).toBe('DIV')
  })

  it('opens a day from its week column header', () => {
    const { onOpenDay } = mount('week')
    const head = container!.querySelector('button[aria-label^="Open Tue"]') as HTMLButtonElement
    act(() => head.click())
    expect(onOpenDay).toHaveBeenCalledWith('2026-10-27')
  })

  it('pages the week by seven days and the day by one', () => {
    const week = mount('week')
    act(() => (container!.querySelector('button[aria-label="Next week"]') as HTMLButtonElement).click())
    expect(week.onAnchor).toHaveBeenCalledWith('2026-11-03')
    act(() => root!.unmount())
    container!.remove()
    const day = mount('day')
    act(() => (container!.querySelector('button[aria-label="Previous day"]') as HTMLButtonElement).click())
    expect(day.onAnchor).toHaveBeenCalledWith('2026-10-26')
  })

  it('draws the timeline by Plan with its dates and to-do dots', () => {
    mount('timeline', { items: [yoga, { ...todo, planId: 'p1', dayKey: '2026-10-20' }] })
    const row = container!.querySelector('[data-calendar-timeline-row="plan-p1"]')!
    expect(row.textContent).toContain('Autumn retreat')
    expect(row.querySelector('[aria-label="Sunset yoga, Oct 27"]')).not.toBeNull()
    expect(row.querySelector('[aria-label^="Overdue to-do"]')).not.toBeNull()
  })

  it('says so when the nine weeks are empty', () => {
    mount('timeline', { items: [] })
    expect(container!.textContent).toContain('Nothing in these nine weeks.')
  })
})
