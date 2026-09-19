// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarPmConsole } from './calendar-pm-console'
import type { CalendarEvent } from '@/lib/calendar/item'

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container!
}

const pencil: CalendarEvent = {
  slug: 'entry-1',
  title: 'New moon sit',
  dayKey: '2026-09-22',
  timeLabel: '7:00 PM',
  whenLabel: 'Tue, 2026-09-22, 7:00 PM PDT',
  startInstantIso: '2026-09-22T19:00:00.000Z',
  location: null,
  goingCount: 0,
  coverUrl: null,
  isCancelled: false,
  stage: 'pencil',
  layer: 'pencil',
}

describe('CalendarPmConsole render (LIVE-415 / LIVE-416 / LIVE-417)', () => {
  it('lists a penciled gathering in pencilLane, not mixed into the board', () => {
    const el = mount(
      <CalendarPmConsole events={[pencil]}>
        <div data-date-map>map</div>
      </CalendarPmConsole>,
    )
    expect(el.querySelector('[data-calendar-pm-console]')).not.toBeNull()
    expect(el.querySelector('[data-pencil-lane]')?.textContent).toContain('New moon sit')
    expect(el.querySelector('[data-pencil-lane]')?.textContent).toContain('Pencil')
    expect(el.textContent).toContain('The board')
    expect(el.textContent).toContain('Nothing on the board yet.')
    expect(el.querySelector('[data-date-map]')?.textContent).toBe('map')
    expect(el.textContent).not.toContain('Nothing penciled in.')
    expect(el.textContent).toContain('Nothing in planning.')
  })

  it('lists a planning gathering in planningLane, not on the board or in pencilLane', () => {
    const planning: CalendarEvent = { ...pencil, slug: 'entry-2', title: 'Open house', stage: 'planning' }
    const el = mount(
      <CalendarPmConsole events={[pencil, planning]}>
        <div data-date-map>map</div>
      </CalendarPmConsole>,
    )
    expect(el.querySelector('[data-pencil-lane]')?.textContent).toContain('New moon sit')
    expect(el.querySelector('[data-pencil-lane]')?.textContent).not.toContain('Open house')
    expect(el.querySelector('[data-planning-lane]')?.textContent).toContain('Open house')
    expect(el.querySelector('[data-planning-lane]')?.textContent).toContain('Planning')
    expect(el.textContent).toContain('Nothing on the board yet.')
    expect(el.textContent).not.toContain('Nothing in planning.')
  })

  it('shows the empty pencil lane, planning lane, and board when there is nothing to run', () => {
    const el = mount(
      <CalendarPmConsole events={[]}>
        <div data-date-map>map</div>
      </CalendarPmConsole>,
    )
    expect(el.textContent).toContain('Nothing penciled in.')
    expect(el.textContent).toContain('Nothing in planning.')
    expect(el.textContent).toContain('Nothing on the board yet.')
    expect(el.querySelector('[data-date-map]')).not.toBeNull()
  })
})
