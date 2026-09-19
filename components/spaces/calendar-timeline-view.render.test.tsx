// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarTimelineView } from './calendar-timeline-view'
import { monthTimelineDays } from '@/lib/calendar/month-timeline'

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

describe('CalendarTimelineView', () => {
  it('renders a month time scale with one bar, not a week grid heading', () => {
    const el = mount(
      <CalendarTimelineView
        slug="lab"
        year={2026}
        month1={9}
        days={monthTimelineDays(2026, 9, '2026-09-19')}
        bars={[
          {
            key: 'sit|2026-09-22',
            title: 'New moon sit',
            whenLabel: 'Tue, Sep 22, 7:00 PM PDT',
            timeLabel: '7:00 PM',
            stageLabel: 'Production',
            href: '/events/sit',
            isCancelled: false,
            startCol: 22,
            span: 1,
          },
        ]}
      />,
    )
    expect(el.querySelector('[data-calendar-timeline-view]')).not.toBeNull()
    expect(el.textContent).toContain('September 2026')
    expect(el.textContent).toContain('New moon sit')
    expect(el.textContent).toContain('Previous')
    expect(el.textContent).not.toContain('SunMonTueWedThuFriSat')
  })
})
