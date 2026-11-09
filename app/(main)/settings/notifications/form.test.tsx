// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'

vi.mock('./actions', () => ({ saveNotificationPreferences: vi.fn() }))

const { NotificationsForm } = await import('./form')
const { wiredCategories, isPreferenceWired } = await import('@/lib/notifications/wired')

const initial = new Proxy({}, { get: () => false }) as never

function render() {
  const html = renderToStaticMarkup(<NotificationsForm initial={initial} />)
  return new JSDOM(`<main>${html}</main>`).window.document
}

describe('the notification grid (LIVE-NOTIFICATION-GRID)', () => {
  it('header and rows share one grid track, so every cell sits under its heading', () => {
    const doc = render()
    const header = doc.querySelector('.bg-surface-elevated.grid')!
    const rows = [...doc.querySelectorAll('.divide-y > div')]
    expect(rows.length).toBe(wiredCategories(['dispatches', 'events', 'comments', 'mentions', 'lifecycle', 'practice', 'matches']).length)
    const track = (el: Element) => [...el.classList].find((c) => c.startsWith('grid-cols-'))
    for (const row of rows) {
      expect(track(row)).toBe(track(header))
      // topic + three channel cells + the SMS placeholder
      expect(row.children.length).toBe(header.children.length)
    }
  })

  it('every switch is named by channel and topic and described by the topic line', () => {
    const doc = render()
    const switches = [...doc.querySelectorAll('[role="switch"]')]
    expect(switches.length).toBeGreaterThan(1)
    for (const sw of switches) {
      const name = sw.getAttribute('aria-label') ?? ''
      expect(name).toMatch(/^(Email|In-app|Push) for .+/)
      const desc = doc.getElementById(sw.getAttribute('aria-describedby') ?? '')
      expect(desc?.textContent?.length ?? 0).toBeGreaterThan(10)
    }
    // A wired pair is a switch; the sample pair everyone has is email for events.
    expect(isPreferenceWired('email', 'events')).toBe(true)
    expect(switches.some((sw) => sw.getAttribute('aria-label') === 'Email for Events')).toBe(true)
  })
})
