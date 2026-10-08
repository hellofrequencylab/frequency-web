// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SiteCalendarAgenda } from './site-calendar-agenda'
import type { CalendarEvent } from '@/lib/calendar/item'

// LIVE-873: the website calendar's event list. Each row opens the event preview in a popup, and the
// popup's one link out is the event's page on Frequency.

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

const ev = (slug: string, title: string, dayKey: string): CalendarEvent => ({
  slug,
  title,
  dayKey,
  timeLabel: '7:00 PM',
  whenLabel: 'Thu, Oct 15, 7:00 PM PDT',
  startInstantIso: null,
  location: 'Encinitas',
  goingCount: 0,
  coverUrl: null,
  isCancelled: false,
})

describe('the website calendar event list', () => {
  it('lists each event as a compact row and opens its preview in a popup', () => {
    const el = mount(
      <SiteCalendarAgenda
        eventOrigin="https://frequencylocal.com"
        events={[ev('cn', 'Circle Night', '2026-10-15'), ev('bw', 'Breathwork Saturday', '2026-10-24')]}
      />,
    )
    const rows = [...el.querySelectorAll('[data-site-calendar-agenda] li button')]
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Circle Night'),
      expect.stringContaining('Breathwork Saturday'),
    ])
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    act(() => (rows[1] as HTMLButtonElement).click())
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Breathwork Saturday')
    expect(dialog?.textContent).toContain('Encinitas')
    const link = [...document.querySelectorAll('a')].find((a) => a.textContent?.includes('Go to event'))
    expect(link?.getAttribute('href')).toBe('https://frequencylocal.com/events/bw')
  })

  it('says so when nothing is scheduled', () => {
    const el = mount(<SiteCalendarAgenda eventOrigin="https://frequencylocal.com" events={[]} />)
    expect(el.textContent).toContain('Nothing on the calendar yet.')
  })
})
