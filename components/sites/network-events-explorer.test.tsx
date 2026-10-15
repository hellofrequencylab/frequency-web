// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { NetworkEventsExplorer, type NetworkEventEntry } from './network-events-explorer'

vi.mock('./network-countdown', () => ({ NetworkCountdown: () => null }))
beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
afterAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false }) })

it('filters the actual cards and next-event door by chapter and calendar day, then resets', () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const items: NetworkEventEntry[] = [
    { id: 'friday', title: 'Feel Good Friday', day: '2026-10-16', chapter: 'Encinitas' },
    { id: 'tuesday', title: 'Team Up Tuesday', day: '2026-10-20', chapter: 'North Park' },
    { id: 'coffee', title: 'Coffee', day: '2026-10-20', chapter: 'Encinitas' },
  ].map((row) => ({ ...row, time: '9 AM', href: `https://frequency.example/events/${row.id}`, startsAt: `${row.day}T09:00:00Z`, timeZone: 'America/Los_Angeles', countdown: null, card: <li key={row.id} data-event={row.id}>{row.title}</li> }))
  const click = (selector: string) => act(() => (container.querySelector(selector) as HTMLButtonElement).click())
  const cards = () => [...container.querySelectorAll('[data-event]')].map((node) => node.getAttribute('data-event'))
  try {
    act(() => root.render(<NetworkEventsExplorer items={items} chapters={[{ label: 'Encinitas', tone: 'var(--color-primary)' }, { label: 'North Park', tone: 'var(--nw-tag-1)' }]} today="2026-10-15" max={2} allLabel="All chapters" empty="No matching events" moreHref="https://frequency.example/spaces/the-group/calendar" moreLabel="See more events" />))
    expect(cards()).toEqual(['friday', 'tuesday'])
    expect(container.querySelector('.nw-more')).not.toBeNull()
    click('.nw-chiprow li:nth-child(3) button')
    expect(cards()).toEqual(['tuesday'])
    expect(container.querySelector('.nw-upnext a')?.getAttribute('href')).toBe('https://frequency.example/events/tuesday')
    expect(container.querySelector('.nw-more')).toBeNull()
    click('button[aria-label="2026-10-16, no events scheduled"]')
    expect(cards()).toEqual([])
    expect(container.querySelector('.nw-empty')?.textContent).toBe('No matching events')
    expect(container.querySelector('.nw-upnext')).toBeNull()
    click('.nw-count button')
    click('.nw-chiprow li:first-child button')
    click('button[aria-label="2026-10-20, events scheduled"]')
    expect(cards()).toEqual(['tuesday', 'coffee'])
    expect(container.querySelector('.nw-month-day[aria-pressed="true"]')?.textContent).toBe('20')
    click('button[aria-label="Next month"]')
    expect(container.querySelector('.nw-month-name')?.textContent).toBe('November 2026')
    click('button[aria-label="Previous month"]')
    expect(container.querySelector('.nw-month-name')?.textContent).toBe('October 2026')
    expect((container.querySelector('button[aria-label="2026-10-01, no events scheduled"]') as HTMLButtonElement).disabled).toBe(true)
    click('.nw-count button')
    expect(cards()).toEqual(['friday', 'tuesday'])
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})
