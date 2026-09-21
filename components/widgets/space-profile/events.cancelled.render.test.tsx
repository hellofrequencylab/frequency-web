// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// The popup's join read and the RSVP switch reach the database and the event actions; neither is
// what this test measures, and the card treatment is the events index's own (tested there).
vi.mock('@/app/(main)/events/join-state-actions', () => ({ loadEventJoinState: async () => null }))
vi.mock('@/components/events/rsvp-controls', () => ({ RsvpControls: () => null }))
vi.mock('@/components/events/event-card', () => ({ EventCard: () => null }))

import { EventsBlock } from './events'
import type { SpaceContentData, SpaceEventItem } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

/** The 15th of the current month, so the block's month grid (seeded to today) shows the event. */
function thisMonth(): string {
  const d = new Date()
  d.setUTCDate(15)
  d.setUTCHours(19, 0, 0, 0)
  return d.toISOString()
}

function event(over: Partial<SpaceEventItem>): SpaceEventItem {
  return {
    id: over.id ?? 'e1',
    slug: over.slug ?? 'sit',
    title: over.title ?? 'Open sit',
    startsAt: thisMonth(),
    timeZone: 'America/Los_Angeles',
    ...over,
  }
}

const space = {} as SpaceProfileContext

describe('EventsBlock cancelled (calendar stage colours)', () => {
  it('carries the real cancelled flag: a cancelled row is grey and struck through, never a brand square', () => {
    const data: SpaceContentData = {
      events: [event({ id: 'off', slug: 'off', title: 'Called off', isCancelled: true }), event({})],
    } as SpaceContentData
    const el = mount(<EventsBlock space={space} data={data} content={{ view: 'list' }} />)
    const off = el.querySelector('[data-space-event-row="cancelled"]') as HTMLButtonElement
    expect(off).not.toBeNull()
    expect(off.textContent).toContain('Called off')
    expect(off.textContent).toContain('Cancelled')
    // The innermost span that carries the title (its wrapper carries it too, by containment).
    const title = [...off.querySelectorAll('span')].filter((n) => n.textContent?.includes('Called off')).at(-1)
    expect(title?.className).toContain('line-through')
    expect(title?.className).toContain('text-muted')
    const square = off.querySelector('span')
    expect(square?.className).not.toContain('bg-primary-bg')
    expect(square?.className).toContain('bg-surface-elevated')

    const live = el.querySelector('[data-space-event-row="live"]') as HTMLButtonElement
    expect(live.textContent).toContain('Open sit')
    expect(live.textContent).not.toContain('Cancelled')
    expect(live.querySelector('span')?.className).toContain('bg-primary-bg')
  })

  it('moves a cancelled event to the month grid footer instead of a live chip', () => {
    const data: SpaceContentData = {
      events: [event({ id: 'off', slug: 'off', title: 'Called off', isCancelled: true }), event({})],
    } as SpaceContentData
    const el = mount(<EventsBlock space={space} data={data} content={{ view: 'calendar' }} />)
    const footer = el.querySelector('[data-calendar-cancelled-footer]')
    expect(footer?.textContent).toContain('Called off')
    const chips = [...el.querySelectorAll('[data-calendar-root] button')].map((n) => n.textContent ?? '')
    expect(chips.some((t) => t.includes('Open sit'))).toBe(true)
    expect(chips.some((t) => t.includes('Called off') && !t.includes('Cancelled'))).toBe(false)
  })
})
